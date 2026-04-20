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
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import {
  list_mail_items,
  link_mail_to_thread,
  type MailItem,
} from "@/services/api/mail";
import {
  decrypt_envelope_with_bytes,
  base64_to_array,
} from "@/services/crypto/envelope";
import {
  get_passphrase_bytes,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import { zero_uint8_array } from "@/services/crypto/secure_memory";

const HASH_ALG = "SHA-256";
const FETCH_LIMIT = 50;
const ENVELOPE_KEY_VERSIONS = ["astermail-envelope-v1", "astermail-import-v1"];
const COOLDOWN_MS = 10_000;

let last_run_at = 0;
let running = false;

function normalize_subject(subject: string): string {
  return subject
    .replace(/^(\s*(re|fwd?|aw|sv|vs|ref|rif|r)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

function uint8_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

async function generate_thread_token(root_id: string): Promise<string> {
  const material = new TextEncoder().encode("astermail-thread:" + root_id);
  const hash = await crypto.subtle.digest(HASH_ALG, material);

  return uint8_to_base64(new Uint8Array(hash));
}

interface DecryptedItem {
  id: string;
  subject: string;
  date: string;
  thread_token: string | null;
}

async function decrypt_subject_from_item(
  item: MailItem,
  passphrase_bytes: Uint8Array,
  identity_key: string,
): Promise<string | null> {
  if (!item.encrypted_envelope) return null;

  try {
    const nonce_bytes = item.envelope_nonce
      ? base64_to_array(item.envelope_nonce)
      : new Uint8Array(0);

    if (nonce_bytes.length === 0) {
      const enc_bytes = base64_to_array(item.encrypted_envelope);
      const json = new TextDecoder().decode(enc_bytes);
      const parsed = JSON.parse(json);

      return parsed.subject || null;
    }

    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<{ subject?: string }>(
        item.encrypted_envelope,
        passphrase_bytes,
      );

      return result?.subject || null;
    }

    const enc_bytes = base64_to_array(item.encrypted_envelope);

    for (const version of ENVELOPE_KEY_VERSIONS) {
      try {
        const key_hash = await crypto.subtle.digest(
          HASH_ALG,
          new TextEncoder().encode(identity_key + version),
        );
        const crypto_key = await crypto.subtle.importKey(
          "raw",
          key_hash,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"],
        );
        const decrypted = await decrypt_aes_gcm_with_fallback(crypto_key, enc_bytes, nonce_bytes);
        const parsed = JSON.parse(new TextDecoder().decode(decrypted));

        return parsed.subject || null;
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function fetch_all_items(): Promise<MailItem[]> {
  const all_items: MailItem[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 20; page++) {
    const response = await list_mail_items({
      item_type: "received",
      limit: FETCH_LIMIT,
      cursor,
    });

    if (response.error || !response.data) break;

    all_items.push(...response.data.items);

    if (!response.data.has_more || !response.data.next_cursor) break;
    cursor = response.data.next_cursor;
  }

  return all_items;
}

export async function thread_imported_emails(): Promise<number> {
  if (running) return 0;
  if (Date.now() - last_run_at < COOLDOWN_MS) return 0;

  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) return 0;

  const vault = get_vault_from_memory();

  if (!vault?.identity_key) {
    zero_uint8_array(passphrase_bytes);

    return 0;
  }

  running = true;

  try {
    const all_items = await fetch_all_items();
    const unthreaded = all_items.filter((item) => !item.thread_token);

    if (unthreaded.length === 0) return 0;

    const threaded = all_items.filter((item) => item.thread_token);

    const decrypted_all: DecryptedItem[] = [];

    for (const item of threaded) {
      const subject = await decrypt_subject_from_item(
        item,
        passphrase_bytes,
        vault.identity_key,
      );

      if (subject) {
        decrypted_all.push({
          id: item.id,
          subject,
          date: item.created_at,
          thread_token: item.thread_token ?? null,
        });
      }
    }

    for (const item of unthreaded) {
      const subject = await decrypt_subject_from_item(
        item,
        passphrase_bytes,
        vault.identity_key,
      );

      if (subject) {
        decrypted_all.push({
          id: item.id,
          subject,
          date: item.created_at,
          thread_token: null,
        });
      }
    }

    const subject_groups = new Map<string, DecryptedItem[]>();

    for (const email of decrypted_all) {
      const norm = normalize_subject(email.subject);

      if (!norm) continue;

      const existing = subject_groups.get(norm);

      if (existing) {
        existing.push(email);
      } else {
        subject_groups.set(norm, [email]);
      }
    }

    let linked_count = 0;

    for (const [, group] of subject_groups) {
      const needs_linking = group.filter((e) => !e.thread_token);

      if (needs_linking.length === 0) continue;

      const existing_token = group.find((e) => e.thread_token)?.thread_token;

      if (!existing_token && group.length < 2) continue;

      group.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      const token =
        existing_token ?? (await generate_thread_token(group[0].id));

      for (const email of needs_linking) {
        const result = await link_mail_to_thread(email.id, token);

        if (!result.error) {
          linked_count++;
        }
      }
    }

    return linked_count;
  } finally {
    zero_uint8_array(passphrase_bytes);
    running = false;
    last_run_at = Date.now();
  }
}
