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
import type { DecryptedEnvelope, MailItemMetadata } from "@/types/email";
import type { MailItem } from "@/services/api/mail";

import { summarize_list_body, type ListBodySummary } from "./mapping";

import { on_vault_cleared } from "@/services/crypto/memory_key_store";
import { register_envelope_attachment_keys } from "@/services/crypto/inbound_attachment_keys";
import { is_reaction_payload_body } from "@/lib/reaction_payload";
import { is_undecryptable_body } from "@/utils/undecryptable_body";

const MAX_ENTRIES = 2000;
const MAX_CACHED_CHARS = 8_000_000;
const ENTRY_OVERHEAD_CHARS = 1024;
const UNIQUE_NONCE_MIN_CHARS = 16;
const PASSPHRASE_ENVELOPE_NONCE = "AQ==";
const PASSPHRASE_ENVELOPE_HEAD_CHARS = 40;
const CIPHERTEXT_TAIL_CHARS = 48;

const LIST_HEADER_NAMES = new Set([
  "auto-submitted",
  "dkim-signature",
  "feedback-id",
  "list-id",
  "list-post",
  "list-unsubscribe",
  "mailing-list",
  "precedence",
  "reply-to",
  "return-path",
  "sender",
  "x-anonaddy-original-sender",
  "x-csa-complaints",
  "x-simplelogin-envelope-from",
  "x-simplelogin-original-from",
  "x-simplelogin-type",
]);

export interface DecryptedListItem {
  envelope: DecryptedEnvelope | null;
  metadata: MailItemMetadata | null;
  body_summary?: ListBodySummary;
  cacheable?: boolean;
}

interface CacheEntry {
  user_email: string;
  envelope_fingerprint: string;
  envelope_nonce: string;
  metadata_fingerprint: string;
  metadata_nonce: string;
  metadata_version: number | undefined;
  envelope: DecryptedEnvelope;
  metadata: MailItemMetadata | null;
  body_summary: ListBodySummary;
  envelope_chars: number;
  size: number;
}

export interface ReusedListItem {
  envelope: DecryptedEnvelope;
  metadata: MailItemMetadata | null;
  body_summary: ListBodySummary;
  envelope_chars: number;
}

const entries = new Map<string, CacheEntry>();
let cached_chars = 0;
let generation = 0;
let listeners_registered = false;

function register_listeners(): void {
  if (listeners_registered) return;
  listeners_registered = true;

  on_vault_cleared(() => {
    clear_list_decrypt_cache();
  });
}

function has_metadata(item: MailItem): boolean {
  return !!(item.encrypted_metadata && item.metadata_nonce);
}

function hash_fingerprint(text: string): string {
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

function fingerprint(value: string | undefined, nonce: string): string {
  const text = value ?? "";

  if (nonce.length >= UNIQUE_NONCE_MIN_CHARS) {
    return `${text.length}:${text.slice(-CIPHERTEXT_TAIL_CHARS)}`;
  }

  if (nonce === PASSPHRASE_ENVELOPE_NONCE) {
    return `${text.length}:${text.slice(0, PASSPHRASE_ENVELOPE_HEAD_CHARS)}:${text.slice(-CIPHERTEXT_TAIL_CHARS)}`;
  }

  return hash_fingerprint(text);
}

function envelope_fingerprint(item: MailItem): string {
  return fingerprint(item.encrypted_envelope, item.envelope_nonce ?? "");
}

function metadata_fingerprint(item: MailItem): string {
  return fingerprint(item.encrypted_metadata, item.metadata_nonce ?? "");
}

function matches(entry: CacheEntry, item: MailItem, user_email: string) {
  return (
    entry.user_email === user_email &&
    entry.envelope_nonce === item.envelope_nonce &&
    entry.metadata_nonce === (item.metadata_nonce ?? "") &&
    entry.metadata_version === item.metadata_version &&
    entry.envelope_fingerprint === envelope_fingerprint(item) &&
    entry.metadata_fingerprint === metadata_fingerprint(item)
  );
}

function trim_envelope(envelope: DecryptedEnvelope): DecryptedEnvelope {
  const source = envelope as DecryptedEnvelope & { date?: string };
  const trimmed: DecryptedEnvelope & { date?: string } = {
    subject: source.subject,
    body_text: "",
    from: source.from,
    to: source.to,
    cc: [],
    bcc: [],
    sent_at: source.sent_at,
    sender_verification: source.sender_verification,
    list_unsubscribe: source.list_unsubscribe,
    list_unsubscribe_post: source.list_unsubscribe_post,
    raw_headers: source.raw_headers?.filter((header) =>
      LIST_HEADER_NAMES.has(String(header?.name ?? "").toLowerCase()),
    ),
    attachment_keys: source.attachment_keys,
  };

  if (source.date !== undefined) trimmed.date = source.date;

  return structuredClone(trimmed);
}

function estimate_size(envelope: DecryptedEnvelope): number {
  let size = (envelope.subject ?? "").length + ENTRY_OVERHEAD_CHARS;

  for (const header of envelope.raw_headers ?? []) {
    size += (header.name ?? "").length + (header.value ?? "").length;
  }

  for (const recipient of envelope.to ?? []) {
    size += (recipient?.name ?? "").length + (recipient?.email ?? "").length;
  }

  return size;
}

function remove(id: string): void {
  const entry = entries.get(id);

  if (!entry) return;

  entries.delete(id);
  cached_chars -= entry.size;
}

function store(item: MailItem, user_email: string, result: DecryptedListItem) {
  const { envelope, metadata } = result;

  if (result.cacheable === false || !envelope) return;
  if (has_metadata(item) && !metadata) return;
  if (
    is_undecryptable_body(envelope.body_text) ||
    is_undecryptable_body(envelope.text_body) ||
    is_reaction_payload_body(envelope.body_text) ||
    is_reaction_payload_body(envelope.text_body)
  ) {
    return;
  }

  const body_summary = summarize_list_body(item.id, envelope);

  if (body_summary.is_undecryptable) return;

  const trimmed = trim_envelope(envelope);
  const size = estimate_size(trimmed) + body_summary.preview.length;

  if (size > MAX_CACHED_CHARS / 8) return;

  remove(item.id);

  entries.set(item.id, {
    user_email,
    envelope_fingerprint: envelope_fingerprint(item),
    envelope_nonce: item.envelope_nonce,
    metadata_fingerprint: metadata_fingerprint(item),
    metadata_nonce: item.metadata_nonce ?? "",
    metadata_version: item.metadata_version,
    envelope: trimmed,
    metadata: metadata ? structuredClone(metadata) : null,
    body_summary,
    envelope_chars: item.encrypted_envelope?.length ?? 0,
    size,
  });
  cached_chars += size;

  while (entries.size > MAX_ENTRIES || cached_chars > MAX_CACHED_CHARS) {
    const oldest = entries.keys().next();

    if (oldest.done) break;
    remove(oldest.value);
  }
}

export async function decrypt_list_item_cached(
  item: MailItem,
  user_email: string,
  decrypt: () => Promise<DecryptedListItem>,
): Promise<DecryptedListItem> {
  register_listeners();

  const entry = entries.get(item.id);

  if (entry && matches(entry, item, user_email)) {
    entries.delete(item.id);
    entries.set(item.id, entry);
    register_envelope_attachment_keys(item.id, entry.envelope);

    return {
      envelope: structuredClone(entry.envelope),
      metadata: entry.metadata ? structuredClone(entry.metadata) : null,
      body_summary: { ...entry.body_summary },
    };
  }

  const started_generation = generation;
  const result = await decrypt();

  if (started_generation === generation) {
    try {
      store(item, user_email, result);
    } catch {
      remove(item.id);
    }
  }

  return result;
}

export function has_reusable_list_items(): boolean {
  return entries.size > 0;
}

export function reuse_list_item_without_envelope(
  item: MailItem,
  user_email: string,
): ReusedListItem | null {
  register_listeners();

  if (item.item_type !== "received") return null;

  const entry = entries.get(item.id);

  if (
    !entry ||
    entry.user_email !== user_email ||
    entry.metadata_nonce !== (item.metadata_nonce ?? "") ||
    entry.metadata_version !== item.metadata_version ||
    entry.metadata_fingerprint !== metadata_fingerprint(item)
  ) {
    return null;
  }

  entries.delete(item.id);
  entries.set(item.id, entry);
  register_envelope_attachment_keys(item.id, entry.envelope);

  return {
    envelope: structuredClone(entry.envelope),
    metadata: entry.metadata ? structuredClone(entry.metadata) : null,
    body_summary: { ...entry.body_summary },
    envelope_chars: entry.envelope_chars,
  };
}

export function clear_list_decrypt_cache(): void {
  entries.clear();
  cached_chars = 0;
  generation += 1;
}
