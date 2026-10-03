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
  size: number;
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

function matches(entry: CacheEntry, item: MailItem, user_email: string) {
  return (
    entry.user_email === user_email &&
    entry.envelope_nonce === item.envelope_nonce &&
    entry.metadata_nonce === (item.metadata_nonce ?? "") &&
    entry.metadata_version === item.metadata_version &&
    entry.envelope_fingerprint === fingerprint(item.encrypted_envelope) &&
    entry.metadata_fingerprint === fingerprint(item.encrypted_metadata)
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
    envelope_fingerprint: fingerprint(item.encrypted_envelope),
    envelope_nonce: item.envelope_nonce,
    metadata_fingerprint: fingerprint(item.encrypted_metadata),
    metadata_nonce: item.metadata_nonce ?? "",
    metadata_version: item.metadata_version,
    envelope: trimmed,
    metadata: metadata ? structuredClone(metadata) : null,
    body_summary,
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

export function clear_list_decrypt_cache(): void {
  entries.clear();
  cached_chars = 0;
  generation += 1;
}
