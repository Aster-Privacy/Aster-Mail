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
import {
  get_vault_from_memory,
  get_derived_encryption_key,
} from "./memory_key_store";
import { list_aliases } from "@/services/api/aliases";
import { list_contacts } from "@/services/api/contacts";
import { rekey_user_data } from "@/services/api/auth";

const HASH_ALG = ["SHA", "256"].join("-");

let rekey_attempted = false;

function b64_to_arr(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function arr_to_b64(arr: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

async function import_decrypt_key(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

async function import_encrypt_key(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
}

async function try_decrypt_with_keys(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  keys: CryptoKey[],
): Promise<ArrayBuffer | null> {
  for (const key of keys) {
    try {
      return await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    } catch {
      continue;
    }
  }
  return null;
}

async function derive_hmac_key(raw: Uint8Array, info_str: string): Promise<CryptoKey> {
  const info = new TextEncoder().encode(info_str);
  const combined = new Uint8Array(raw.byteLength + info.length);
  combined.set(raw, 0);
  combined.set(info, raw.byteLength);
  const hash = await crypto.subtle.digest(HASH_ALG, combined);
  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "HMAC", hash: HASH_ALG },
    false,
    ["sign"],
  );
}

export async function auto_rekey_if_needed(): Promise<boolean> {
  if (rekey_attempted) return false;

  const vault = get_vault_from_memory();
  const new_raw = get_derived_encryption_key();

  if (!vault?.legacy_keks?.length || !new_raw) return false;

  const old_decrypt_keys: CryptoKey[] = [];
  for (const kek of vault.legacy_keks) {
    try {
      old_decrypt_keys.push(await import_decrypt_key(b64_to_arr(kek.k)));
    } catch {
      continue;
    }
  }

  if (old_decrypt_keys.length === 0) return false;

  rekey_attempted = true;

  const current_decrypt = await import_decrypt_key(new_raw);
  const new_encrypt = await import_encrypt_key(new_raw);
  const new_alias_hmac = await derive_hmac_key(new_raw, "astermail-alias-hmac-v1");
  const new_contacts_hmac = await derive_hmac_key(new_raw, "contacts-hmac-v2");

  const re_encrypted_aliases: {
    id: string;
    encrypted_local_part: string;
    local_part_nonce: string;
    encrypted_display_name?: string;
    display_name_nonce?: string;
    alias_address_hash: string;
  }[] = [];

  let offset = 0;
  let found_stale = false;

  outer_aliases: while (true) {
    const response = await list_aliases({ limit: 100, offset });
    if (response.error || !response.data) break;

    for (const alias of response.data.aliases) {
      if (alias.is_random) continue;

      const ct = b64_to_arr(alias.encrypted_local_part);
      const iv = b64_to_arr(alias.local_part_nonce);

      try {
        await crypto.subtle.decrypt({ name: "AES-GCM", iv }, current_decrypt, ct);
        continue;
      } catch {
        // stale - try old keys
      }

      const plaintext = await try_decrypt_with_keys(ct, iv, old_decrypt_keys);
      if (!plaintext) continue;

      found_stale = true;
      const local_part = new TextDecoder().decode(plaintext);
      const new_iv = crypto.getRandomValues(new Uint8Array(12));
      const new_ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: new_iv },
        new_encrypt,
        plaintext,
      );

      const full_address = `${local_part.toLowerCase()}@${alias.domain}`;
      const addr_sig = await crypto.subtle.sign(
        "HMAC",
        new_alias_hmac,
        new TextEncoder().encode(full_address),
      );

      const entry: (typeof re_encrypted_aliases)[0] = {
        id: alias.id,
        encrypted_local_part: arr_to_b64(new Uint8Array(new_ct)),
        local_part_nonce: arr_to_b64(new_iv),
        alias_address_hash: arr_to_b64(new Uint8Array(addr_sig)),
      };

      if (alias.encrypted_display_name && alias.display_name_nonce) {
        const dn_ct = b64_to_arr(alias.encrypted_display_name);
        const dn_iv = b64_to_arr(alias.display_name_nonce);
        const dn_plain = await try_decrypt_with_keys(dn_ct, dn_iv, old_decrypt_keys);
        if (dn_plain) {
          const new_dn_iv = crypto.getRandomValues(new Uint8Array(12));
          const new_dn_ct = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: new_dn_iv },
            new_encrypt,
            dn_plain,
          );
          entry.encrypted_display_name = arr_to_b64(new Uint8Array(new_dn_ct));
          entry.display_name_nonce = arr_to_b64(new_dn_iv);
        }
      }

      re_encrypted_aliases.push(entry);

      if (re_encrypted_aliases.length >= 500) break outer_aliases;
    }

    if (!response.data.has_more) break;
    offset += response.data.aliases.length;
  }

  const re_encrypted_contacts: {
    id: string;
    encrypted_data: string;
    data_nonce: string;
    contact_token: string;
  }[] = [];

  let cursor: string | undefined;

  outer_contacts: while (true) {
    const params: { limit: number; cursor?: string } = { limit: 100 };
    if (cursor) params.cursor = cursor;

    const response = await list_contacts(params);
    if (response.error || !response.data) break;

    for (const contact of response.data.items) {
      const ct = b64_to_arr(contact.encrypted_data);
      const iv = b64_to_arr(contact.data_nonce);

      try {
        await crypto.subtle.decrypt({ name: "AES-GCM", iv }, current_decrypt, ct);
        continue;
      } catch {
        // stale - try old keys
      }

      const plaintext = await try_decrypt_with_keys(ct, iv, old_decrypt_keys);
      if (!plaintext) continue;

      found_stale = true;
      const new_iv = crypto.getRandomValues(new Uint8Array(12));
      const new_ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: new_iv },
        new_encrypt,
        plaintext,
      );

      const parsed = JSON.parse(new TextDecoder().decode(plaintext));
      const first_name: string = parsed.first_name ?? "";
      const last_name: string = parsed.last_name ?? "";
      const emails: string[] = Array.isArray(parsed.emails) ? parsed.emails : [];
      const searchable = `${first_name} ${last_name} ${emails.join(" ")}`.toLowerCase();
      const token_sig = await crypto.subtle.sign(
        "HMAC",
        new_contacts_hmac,
        new TextEncoder().encode(searchable),
      );

      re_encrypted_contacts.push({
        id: contact.id,
        encrypted_data: arr_to_b64(new Uint8Array(new_ct)),
        data_nonce: arr_to_b64(new_iv),
        contact_token: arr_to_b64(new Uint8Array(token_sig)),
      });

      if (re_encrypted_contacts.length >= 500) break outer_contacts;
    }

    if (!response.data.has_more || !response.data.next_cursor) break;
    cursor = response.data.next_cursor;
  }

  if (!found_stale) return false;

  await rekey_user_data({ re_encrypted_aliases, re_encrypted_contacts });
  return true;
}

export function reset_rekey_flag(): void {
  rekey_attempted = false;
}
