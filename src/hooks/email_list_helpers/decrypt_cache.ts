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

import { on_vault_cleared } from "@/services/crypto/memory_key_store";
import { register_envelope_attachment_keys } from "@/services/crypto/inbound_attachment_keys";
import { is_undecryptable_body } from "@/utils/undecryptable_body";

const MAX_ENTRIES = 2000;
const MAX_CACHED_CHARS = 32_000_000;
const ENTRY_OVERHEAD_CHARS = 1024;

export interface DecryptedListItem {
  envelope: DecryptedEnvelope | null;
  metadata: MailItemMetadata | null;
  cacheable?: boolean;
}

interface CacheEntry {
  user_email: string;
  encrypted_envelope: string;
  envelope_nonce: string;
  encrypted_metadata: string;
  metadata_nonce: string;
  metadata_version: number | undefined;
  envelope: DecryptedEnvelope;
  metadata: MailItemMetadata | null;
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

function text_length(value: unknown): number {
  return typeof value === "string" ? value.length : 0;
}

function has_metadata(item: MailItem): boolean {
  return !!(item.encrypted_metadata && item.metadata_nonce);
}

function matches(entry: CacheEntry, item: MailItem, user_email: string) {
  return (
    entry.user_email === user_email &&
    entry.encrypted_envelope === (item.encrypted_envelope ?? "") &&
    entry.envelope_nonce === item.envelope_nonce &&
    entry.encrypted_metadata === (item.encrypted_metadata ?? "") &&
    entry.metadata_nonce === (item.metadata_nonce ?? "") &&
    entry.metadata_version === item.metadata_version
  );
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
    is_undecryptable_body(envelope.text_body)
  ) {
    return;
  }

  const encrypted_envelope = item.encrypted_envelope ?? "";
  const encrypted_metadata = item.encrypted_metadata ?? "";
  const size =
    encrypted_envelope.length +
    encrypted_metadata.length +
    text_length(envelope.subject) +
    text_length(envelope.body_text) +
    text_length(envelope.body_html) +
    text_length(envelope.text_body) +
    text_length(envelope.html_body) +
    ENTRY_OVERHEAD_CHARS;

  if (size > MAX_CACHED_CHARS / 8) return;

  remove(item.id);

  entries.set(item.id, {
    user_email,
    encrypted_envelope,
    envelope_nonce: item.envelope_nonce,
    encrypted_metadata,
    metadata_nonce: item.metadata_nonce ?? "",
    metadata_version: item.metadata_version,
    envelope: { ...envelope },
    metadata: metadata ? { ...metadata } : null,
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
      envelope: { ...entry.envelope },
      metadata: entry.metadata ? { ...entry.metadata } : null,
    };
  }

  const started_generation = generation;
  const result = await decrypt();

  if (started_generation === generation) store(item, user_email, result);

  return result;
}

export function clear_list_decrypt_cache(): void {
  entries.clear();
  cached_chars = 0;
  generation += 1;
}
