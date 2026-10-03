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

const MAX_CONTENT_ENTRIES = 400;
const MAX_CONTENT_CHARS = 8_000_000;
const MAX_METADATA_ENTRIES = 2000;
const MAX_METADATA_CHARS = 2_000_000;
const ENTRY_OVERHEAD_CHARS = 512;

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

interface Entry<T> {
  key: string;
  value: T;
  size: number;
}

class BoundedCache<T> {
  private entries = new Map<string, Entry<T>>();
  private total_size = 0;

  constructor(
    private readonly max_entries: number,
    private readonly max_size: number,
    private readonly copy: (value: T) => T,
  ) {}

  get(id: string, key: string): T | null {
    const entry = this.entries.get(id);

    if (!entry) return null;
    if (entry.key !== key) {
      this.remove(id);

      return null;
    }

    this.entries.delete(id);
    this.entries.set(id, entry);

    return this.copy(entry.value);
  }

  set(id: string, key: string, value: T, size: number): void {
    this.remove(id);
    if (size > this.max_size / 8) return;

    this.entries.set(id, { key, value: this.copy(value), size });
    this.total_size += size;

    while (
      this.entries.size > this.max_entries ||
      this.total_size > this.max_size
    ) {
      const oldest = this.entries.keys().next();

      if (oldest.done) break;
      this.remove(oldest.value);
    }
  }

  remove(id: string): void {
    const entry = this.entries.get(id);

    if (!entry) return;
    this.entries.delete(id);
    this.total_size -= entry.size;
  }

  clear(): void {
    this.entries.clear();
    this.total_size = 0;
  }
}

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

const content_cache = new BoundedCache<ThreadMessageContent>(
  MAX_CONTENT_ENTRIES,
  MAX_CONTENT_CHARS,
  copy_content,
);
const metadata_cache = new BoundedCache<MailItemMetadata>(
  MAX_METADATA_ENTRIES,
  MAX_METADATA_CHARS,
  (metadata) => structuredClone(metadata),
);
let generation = 0;
let listeners_registered = false;

function register_listeners(): void {
  if (listeners_registered) return;
  listeners_registered = true;

  on_vault_cleared(() => {
    clear_thread_decrypt_cache();
  });
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
    (content.html_content ?? "").length;

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

async function cached_decrypt<T>(
  cache: BoundedCache<T>,
  id: string,
  key: string,
  decrypt: () => Promise<{ value: T | null; cacheable: boolean }>,
  size_of: (value: T) => number,
  on_hit?: (value: T) => void,
): Promise<T | null> {
  register_listeners();

  const hit = cache.get(id, key);

  if (hit !== null) {
    on_hit?.(hit);

    return hit;
  }

  const started_generation = generation;
  const { value, cacheable } = await decrypt();

  if (value !== null && cacheable && started_generation === generation) {
    try {
      cache.set(id, key, value, size_of(value));
    } catch {
      cache.remove(id);
    }
  }

  return value;
}

export async function decrypt_thread_content_cached(
  msg: ThreadMessageItem,
  user_email: string,
  decrypt: () => Promise<{
    value: ThreadMessageContent | null;
    cacheable: boolean;
  }>,
): Promise<ThreadMessageContent | null> {
  return cached_decrypt(
    content_cache,
    msg.id,
    content_key(msg, user_email),
    decrypt,
    content_size,
    (content) => register_envelope_attachment_keys(msg.id, content),
  );
}

export async function decrypt_thread_metadata_cached(
  msg: ThreadMessageItem,
  user_email: string,
  decrypt: () => Promise<MailItemMetadata | null>,
): Promise<MailItemMetadata | null> {
  return cached_decrypt(
    metadata_cache,
    msg.id,
    metadata_key(msg, user_email),
    async () => ({ value: await decrypt(), cacheable: true }),
    (metadata) => JSON.stringify(metadata).length,
  );
}

export function clear_thread_decrypt_cache(): void {
  content_cache.clear();
  metadata_cache.clear();
  generation += 1;
}
