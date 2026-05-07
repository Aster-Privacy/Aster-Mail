//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { derive_encryption_key_from_passphrase } from "./memory_key_store";
import { list_aliases } from "../api/aliases";
import { list_contacts } from "../api/contacts";

const HASH_ALG = ["SHA", "256"].join("-");

export interface ReEncryptedAlias {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  alias_address_hash: string;
}

export interface ReEncryptedContact {
  id: string;
  encrypted_data: string;
  data_nonce: string;
  contact_token: string;
}

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function derive_aes_key(passphrase: string): Promise<CryptoKey> {
  const passphrase_bytes = new TextEncoder().encode(passphrase);
  const raw = await derive_encryption_key_from_passphrase(passphrase_bytes);

  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function derive_alias_hmac_key(passphrase: string): Promise<CryptoKey> {
  const passphrase_bytes = new TextEncoder().encode(passphrase);
  const raw = await derive_encryption_key_from_passphrase(passphrase_bytes);
  const info = new TextEncoder().encode("astermail-alias-hmac-v1");
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

async function derive_contacts_hmac_key(passphrase: string): Promise<CryptoKey> {
  const passphrase_bytes = new TextEncoder().encode(passphrase);
  const raw = await derive_encryption_key_from_passphrase(passphrase_bytes);
  const info = new TextEncoder().encode("contacts-hmac-v2");
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

async function re_encrypt_field(
  encrypted_b64: string,
  nonce_b64: string,
  old_key: CryptoKey,
  new_key: CryptoKey,
): Promise<{ encrypted: string; nonce: string }> {
  const ciphertext = base64_to_array(encrypted_b64);
  const nonce = base64_to_array(nonce_b64);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    old_key,
    ciphertext,
  );
  const new_nonce = crypto.getRandomValues(new Uint8Array(12));
  const new_ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new_nonce },
    new_key,
    decrypted,
  );

  return {
    encrypted: array_to_base64(new Uint8Array(new_ciphertext)),
    nonce: array_to_base64(new_nonce),
  };
}

export async function re_encrypt_user_data(
  old_passphrase: string,
  new_passphrase: string,
): Promise<{
  re_encrypted_aliases: ReEncryptedAlias[];
  re_encrypted_contacts: ReEncryptedContact[];
}> {
  const [old_aes, new_aes, new_alias_hmac, new_contacts_hmac] = await Promise.all([
    derive_aes_key(old_passphrase),
    derive_aes_key(new_passphrase),
    derive_alias_hmac_key(new_passphrase),
    derive_contacts_hmac_key(new_passphrase),
  ]);

  const re_encrypted_aliases: ReEncryptedAlias[] = [];
  let alias_offset = 0;

  while (true) {
    const response = await list_aliases({ limit: 100, offset: alias_offset });

    if (response.error || !response.data) break;

    for (const alias of response.data.aliases) {
      if (alias.is_random) continue;

      try {
        const lp_ciphertext = base64_to_array(alias.encrypted_local_part);
        const lp_nonce = base64_to_array(alias.local_part_nonce);
        const lp_plaintext = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: lp_nonce },
          old_aes,
          lp_ciphertext,
        );
        const local_part = new TextDecoder().decode(lp_plaintext);
        const new_lp_nonce = crypto.getRandomValues(new Uint8Array(12));
        const new_lp_ciphertext = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: new_lp_nonce },
          new_aes,
          lp_plaintext,
        );

        const full_address = `${local_part.toLowerCase()}@${alias.domain}`;
        const addr_sig = await crypto.subtle.sign(
          "HMAC",
          new_alias_hmac,
          new TextEncoder().encode(full_address),
        );

        const result: ReEncryptedAlias = {
          id: alias.id,
          encrypted_local_part: array_to_base64(new Uint8Array(new_lp_ciphertext)),
          local_part_nonce: array_to_base64(new_lp_nonce),
          alias_address_hash: array_to_base64(new Uint8Array(addr_sig)),
        };

        if (alias.encrypted_display_name && alias.display_name_nonce) {
          const { encrypted: encrypted_display_name, nonce: display_name_nonce } =
            await re_encrypt_field(
              alias.encrypted_display_name,
              alias.display_name_nonce,
              old_aes,
              new_aes,
            );

          result.encrypted_display_name = encrypted_display_name;
          result.display_name_nonce = display_name_nonce;
        }

        re_encrypted_aliases.push(result);
      } catch {
        continue;
      }
    }

    if (!response.data.has_more) break;

    alias_offset += response.data.aliases.length;
  }

  const re_encrypted_contacts: ReEncryptedContact[] = [];
  let contact_cursor: string | undefined;

  while (true) {
    const params: { limit: number; cursor?: string } = { limit: 100 };

    if (contact_cursor) params.cursor = contact_cursor;

    const response = await list_contacts(params);

    if (response.error || !response.data) break;

    for (const contact of response.data.items) {
      try {
        const ct_ciphertext = base64_to_array(contact.encrypted_data);
        const ct_nonce = base64_to_array(contact.data_nonce);
        const ct_plaintext = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: ct_nonce },
          old_aes,
          ct_ciphertext,
        );
        const new_ct_nonce = crypto.getRandomValues(new Uint8Array(12));
        const new_ct_ciphertext = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: new_ct_nonce },
          new_aes,
          ct_plaintext,
        );

        const parsed = JSON.parse(new TextDecoder().decode(ct_plaintext));
        const first_name: string = parsed.first_name ?? "";
        const last_name: string = parsed.last_name ?? "";
        const emails: string[] = Array.isArray(parsed.emails) ? parsed.emails : [];
        const searchable =
          `${first_name} ${last_name} ${emails.join(" ")}`.toLowerCase();
        const contact_token_sig = await crypto.subtle.sign(
          "HMAC",
          new_contacts_hmac,
          new TextEncoder().encode(searchable),
        );

        re_encrypted_contacts.push({
          id: contact.id,
          encrypted_data: array_to_base64(new Uint8Array(new_ct_ciphertext)),
          data_nonce: array_to_base64(new_ct_nonce),
          contact_token: array_to_base64(new Uint8Array(contact_token_sig)),
        });
      } catch {
        continue;
      }
    }

    if (!response.data.has_more || !response.data.next_cursor) break;

    contact_cursor = response.data.next_cursor;
  }

  return { re_encrypted_aliases, re_encrypted_contacts };
}
