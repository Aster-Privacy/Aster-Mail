//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { DecryptedThreadMessage } from "@/types/thread";
import type { MailItemMetadata } from "@/types/email";
import type { ThreadMessageItem } from "./api/mail_threads";

import { on_vault_cleared } from "./crypto/memory_key_store";
import { register_envelope_attachment_keys } from "./crypto/inbound_attachment_keys";
import { LOCKDOWN_CHANGED_EVENT } from "./lockdown_store";

const MAX_CONTENT_ENTRIES = 100;
const MAX_CONTENT_CHARS = 8_000_000;
const MAX_METADATA_ENTRIES = 2000;
const MAX_METADATA_CHARS = 400_000;
const ENTRY_OVERHEAD_CHARS = 512;
const METADATA_ENTRY_CHARS = 64;

export const CLOSED_THREAD_GRACE_MS = 60_000;
export const MAX_CLOSED_THREADS = 2;
export const HIDDEN_PAGE_PURGE_MS = 180_000;

export type ThreadMessageContent = Pick<
  DecryptedThreadMessage,
  | "sender_name"
  | "sender_email"
  | "display_sender_name"
  | "display_sender_email"
  | "forwarding_service"
  | "subject"
  | "body"
  | "html_content"
  | "e2e_verified"
  | "to_recipients"
  | "cc_recipients"
  | "bcc_recipients"
  | "raw_headers"
> & {
  sent_at?: string;
  attachment_keys?: unknown;
};

export type ThreadMessageFlags = Pick<
  MailItemMetadata,
  "is_read" | "is_starred" | "send_status"
>;

interface Entry<T> {
  key: string;
  value: T;
  size: number;
  owner: string;
}

class BoundedCache<T> {
  private entries = new Map<string, Entry<T>>();
  private total_size = 0;

  constructor(
    private readonly max_entries: number,
    private readonly max_size: number,
    private readonly copy: (value: T) => T,
    private readonly on_remove?: (id: string, owner: string) => void,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get(id: string, key: string, owner = ""): T | null {
    const entry = this.entries.get(id);

    if (!entry) return null;
    if (entry.key !== key || entry.owner !== owner) {
      this.remove(id);

      return null;
    }

    this.entries.delete(id);
    this.entries.set(id, entry);

    return this.copy(entry.value);
  }

  set(id: string, key: string, value: T, size: number, owner = ""): boolean {
    this.remove(id);
    if (size > this.max_size / 8) return false;

    this.entries.set(id, { key, value: this.copy(value), size, owner });
    this.total_size += size;

    while (
      this.entries.size > this.max_entries ||
      this.total_size > this.max_size
    ) {
      const oldest = this.entries.keys().next();

      if (oldest.done) break;
      this.remove(oldest.value);
    }

    return this.entries.has(id);
  }

  remove(id: string): void {
    const entry = this.entries.get(id);

    if (!entry) return;
    this.entries.delete(id);
    this.total_size -= entry.size;
    this.on_remove?.(id, entry.owner);
  }

  clear(): void {
    this.entries.clear();
    this.total_size = 0;
  }
}

interface ThreadState {
  holds: number;
  ids: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
}

const threads = new Map<string, ThreadState>();
const closed_threads = new Set<string>();
let hidden_timer: ReturnType<typeof setTimeout> | null = null;
let content_suspended = false;

function copy_people(
  people: { name: string; email: string }[] | undefined,
): { name: string; email: string }[] | undefined {
  return people?.map((person) => ({ ...person }));
}

function copy_content(content: ThreadMessageContent): ThreadMessageContent {
  return {
    ...content,
    to_recipients: copy_people(content.to_recipients),
    cc_recipients: copy_people(content.cc_recipients),
    bcc_recipients: copy_people(content.bcc_recipients),
    raw_headers: content.raw_headers?.map((header) => ({ ...header })),
    attachment_keys: structuredClone(content.attachment_keys),
  };
}

function copy_flags(flags: ThreadMessageFlags): ThreadMessageFlags {
  return { ...flags };
}

function to_flags(metadata: MailItemMetadata): ThreadMessageFlags {
  return {
    is_read: metadata.is_read,
    is_starred: metadata.is_starred,
    send_status: metadata.send_status,
  };
}

const content_cache = new BoundedCache<ThreadMessageContent>(
  MAX_CONTENT_ENTRIES,
  MAX_CONTENT_CHARS,
  copy_content,
  (id, owner) => {
    threads.get(owner)?.ids.delete(id);
  },
);
const metadata_cache = new BoundedCache<ThreadMessageFlags>(
  MAX_METADATA_ENTRIES,
  MAX_METADATA_CHARS,
  copy_flags,
);
let generation = 0;
let listeners_registered = false;

function page_hidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}

function drop_thread(thread_token: string): void {
  const state = threads.get(thread_token);

  closed_threads.delete(thread_token);
  if (!state) return;
  if (state.timer !== null) clearTimeout(state.timer);
  state.timer = null;
  for (const id of Array.from(state.ids)) content_cache.remove(id);
  state.ids.clear();
  if (state.holds === 0) threads.delete(thread_token);
}

function drop_closed_threads(): void {
  for (const thread_token of Array.from(closed_threads)) {
    drop_thread(thread_token);
  }
}

function mark_closed(thread_token: string, state: ThreadState): void {
  if (page_hidden()) {
    drop_thread(thread_token);

    return;
  }

  closed_threads.delete(thread_token);
  closed_threads.add(thread_token);
  if (state.timer !== null) clearTimeout(state.timer);
  state.timer = setTimeout(
    () => drop_thread(thread_token),
    CLOSED_THREAD_GRACE_MS,
  );

  while (closed_threads.size > MAX_CLOSED_THREADS) {
    const oldest = closed_threads.values().next();

    if (oldest.done) break;
    drop_thread(oldest.value);
  }
}

function on_page_hidden(): void {
  drop_closed_threads();
  if (hidden_timer !== null) return;
  hidden_timer = setTimeout(() => {
    hidden_timer = null;
    if (!page_hidden()) return;
    content_suspended = true;
    for (const thread_token of Array.from(threads.keys())) {
      drop_thread(thread_token);
    }
  }, HIDDEN_PAGE_PURGE_MS);
}

function on_page_visible(): void {
  if (hidden_timer !== null) clearTimeout(hidden_timer);
  hidden_timer = null;
  content_suspended = false;
}

function register_listeners(): void {
  if (listeners_registered) return;
  listeners_registered = true;

  on_vault_cleared(() => {
    clear_thread_decrypt_cache();
  });

  if (typeof window !== "undefined") {
    window.addEventListener(LOCKDOWN_CHANGED_EVENT, () =>
      clear_thread_decrypt_cache(),
    );
    window.addEventListener("pagehide", on_page_hidden);
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (page_hidden()) on_page_hidden();
      else on_page_visible();
    });
  }
}

export function hold_thread_decrypt_cache(thread_token: string): () => void {
  let state = threads.get(thread_token);

  if (!state) {
    state = { holds: 0, ids: new Set(), timer: null };
    threads.set(thread_token, state);
  }
  state.holds += 1;
  if (state.timer !== null) clearTimeout(state.timer);
  state.timer = null;
  closed_threads.delete(thread_token);

  let released = false;

  return () => {
    if (released) return;
    released = true;

    const current = threads.get(thread_token);

    if (!current) return;
    current.holds = Math.max(0, current.holds - 1);
    if (current.holds > 0) return;
    if (current.ids.size === 0) {
      drop_thread(thread_token);

      return;
    }
    mark_closed(thread_token, current);
  };
}

function admit_content(thread_token: string): ThreadState | null {
  if (content_suspended) return null;

  const existing = threads.get(thread_token);

  if (existing && existing.holds > 0) return existing;
  if (page_hidden()) return null;

  const state = existing ?? { holds: 0, ids: new Set<string>(), timer: null };

  if (!existing) threads.set(thread_token, state);
  if (!closed_threads.has(thread_token)) mark_closed(thread_token, state);

  return threads.get(thread_token) === state ? state : null;
}

function fingerprint(value: string | undefined): string {
  const text = value ?? "";
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);

    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return `${text.length}:${(h1 >>> 0).toString(36)}:${(h2 >>> 0).toString(36)}`;
}

function content_key(msg: ThreadMessageItem, user_email: string): string {
  return JSON.stringify([
    user_email,
    msg.envelope_nonce,
    fingerprint(msg.encrypted_envelope),
  ]);
}

function metadata_key(msg: ThreadMessageItem, user_email: string): string {
  return JSON.stringify([
    user_email,
    msg.metadata_nonce ?? "",
    msg.metadata_version ?? null,
    fingerprint(msg.encrypted_metadata),
  ]);
}

function content_size(content: ThreadMessageContent): number {
  let size =
    ENTRY_OVERHEAD_CHARS +
    (content.subject ?? "").length +
    (content.body ?? "").length +
    (content.html_content ?? "").length +
    (content.sender_name ?? "").length +
    (content.sender_email ?? "").length +
    (content.display_sender_name ?? "").length +
    (content.display_sender_email ?? "").length +
    (content.forwarding_service ?? "").length +
    (content.sent_at ?? "").length;

  if (content.attachment_keys !== undefined) {
    size += JSON.stringify(content.attachment_keys)?.length ?? 0;
  }

  for (const header of content.raw_headers ?? []) {
    size += (header.name ?? "").length + (header.value ?? "").length;
  }
  for (const list of [
    content.to_recipients,
    content.cc_recipients,
    content.bcc_recipients,
  ]) {
    for (const recipient of list ?? []) {
      size += (recipient?.name ?? "").length + (recipient?.email ?? "").length;
    }
  }

  return size;
}

export async function decrypt_thread_content_cached(
  msg: ThreadMessageItem,
  thread_token: string,
  user_email: string,
  decrypt: () => Promise<{
    value: ThreadMessageContent | null;
    cacheable: boolean;
  }>,
): Promise<ThreadMessageContent | null> {
  register_listeners();

  const key = content_key(msg, user_email);
  const hit = content_cache.get(msg.id, key, thread_token);

  if (hit !== null) {
    register_envelope_attachment_keys(msg.id, hit);

    return hit;
  }

  const started_generation = generation;
  const { value, cacheable } = await decrypt();

  if (value === null || !cacheable || started_generation !== generation) {
    return value;
  }

  const state = admit_content(thread_token);

  if (!state) return value;

  try {
    if (
      content_cache.set(msg.id, key, value, content_size(value), thread_token)
    ) {
      state.ids.add(msg.id);
    }
  } catch {
    content_cache.remove(msg.id);
  }

  return value;
}

export async function decrypt_thread_metadata_cached(
  msg: ThreadMessageItem,
  user_email: string,
  decrypt: () => Promise<MailItemMetadata | null>,
): Promise<ThreadMessageFlags | null> {
  register_listeners();

  const key = metadata_key(msg, user_email);
  const hit = metadata_cache.get(msg.id, key);

  if (hit !== null) return hit;

  const started_generation = generation;
  const metadata = await decrypt();

  if (!metadata) return null;

  const flags = to_flags(metadata);

  if (started_generation === generation) {
    metadata_cache.set(
      msg.id,
      key,
      flags,
      METADATA_ENTRY_CHARS + key.length + (flags.send_status ?? "").length,
    );
  }

  return flags;
}

export function thread_decrypt_cache_size(): number {
  return content_cache.size;
}

export function clear_thread_decrypt_cache(): void {
  content_cache.clear();
  metadata_cache.clear();
  generation += 1;
  closed_threads.clear();
  for (const [thread_token, state] of threads) {
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = null;
    state.ids.clear();
    if (state.holds === 0) threads.delete(thread_token);
  }
  if (hidden_timer !== null) clearTimeout(hidden_timer);
  hidden_timer = null;
  content_suspended = page_hidden();
}
