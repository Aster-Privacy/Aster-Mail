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
import { list_alias_pins } from "../api/alias_pins";
import { list_alias_contacts } from "../api/alias_contacts";
import { list_alias_destinations } from "../api/alias_destinations";
import { list_alias_directories } from "../api/alias_directories";
import { list_domains, list_domain_addresses } from "../api/domains";

const HASH_ALG = ["SHA", "256"].join("-");

export interface ReEncryptedAlias {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  alias_address_hash: string;
  encrypted_note?: string;
  note_nonce?: string;
}

export interface ReEncryptedContact {
  id: string;
  encrypted_data: string;
  data_nonce: string;
  contact_token: string;
}

export interface ReEncryptedPin {
  id: string;
  encrypted_sender: string;
  sender_nonce: string;
}

export interface ReEncryptedAliasContact {
  id: string;
  encrypted_contact: string;
  contact_nonce: string;
}

export interface ReEncryptedDestination {
  id: string;
  encrypted_destination: string;
  destination_nonce: string;
}

export interface ReEncryptedDirectory {
  id: string;
  encrypted_label: string;
  label_nonce: string;
}

export interface ReEncryptedDomainAddress {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  local_part_hash: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
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

async function derive_domain_address_hmac_key(
  passphrase: string,
): Promise<CryptoKey> {
  const passphrase_bytes = new TextEncoder().encode(passphrase);
  const raw = await derive_encryption_key_from_passphrase(passphrase_bytes);
  const info = new TextEncoder().encode("astermail-domain-address-hmac-v1");
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
  re_encrypted_pins: ReEncryptedPin[];
  re_encrypted_alias_contacts: ReEncryptedAliasContact[];
  re_encrypted_destinations: ReEncryptedDestination[];
  re_encrypted_directories: ReEncryptedDirectory[];
  re_encrypted_domain_addresses: ReEncryptedDomainAddress[];
}> {
  const [
    old_aes,
    new_aes,
    new_alias_hmac,
    new_contacts_hmac,
    new_domain_hmac,
  ] = await Promise.all([
    derive_aes_key(old_passphrase),
    derive_aes_key(new_passphrase),
    derive_alias_hmac_key(new_passphrase),
    derive_contacts_hmac_key(new_passphrase),
    derive_domain_address_hmac_key(new_passphrase),
  ]);

  const re_encrypted_aliases: ReEncryptedAlias[] = [];
  const re_encrypted_pins: ReEncryptedPin[] = [];
  const re_encrypted_alias_contacts: ReEncryptedAliasContact[] = [];
  const re_encrypted_destinations: ReEncryptedDestination[] = [];
  const re_encrypted_directories: ReEncryptedDirectory[] = [];
  const re_encrypted_domain_addresses: ReEncryptedDomainAddress[] = [];
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

        if (alias.encrypted_note && alias.note_nonce) {
          const { encrypted: encrypted_note, nonce: note_nonce } =
            await re_encrypt_field(
              alias.encrypted_note,
              alias.note_nonce,
              old_aes,
              new_aes,
            );

          result.encrypted_note = encrypted_note;
          result.note_nonce = note_nonce;
        }

        re_encrypted_aliases.push(result);
      } catch (err) {
        throw new Error(
          `alias_reencrypt_failed:${alias.id}:${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const pins_response = await list_alias_pins(alias.id);

      if (!pins_response.error && pins_response.data) {
        for (const pin of pins_response.data.pins) {
          if (!pin.encrypted_sender || !pin.sender_nonce) continue;

          try {
            const { encrypted, nonce } = await re_encrypt_field(
              pin.encrypted_sender,
              pin.sender_nonce,
              old_aes,
              new_aes,
            );

            re_encrypted_pins.push({
              id: pin.id,
              encrypted_sender: encrypted,
              sender_nonce: nonce,
            });
          } catch (err) {
            throw new Error(
              `pin_reencrypt_failed:${pin.id}:${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }

      const alias_contacts_response = await list_alias_contacts(alias.id);

      if (!alias_contacts_response.error && alias_contacts_response.data) {
        for (const alias_contact of alias_contacts_response.data.contacts) {
          if (!alias_contact.encrypted_contact || !alias_contact.contact_nonce)
            continue;

          try {
            const { encrypted, nonce } = await re_encrypt_field(
              alias_contact.encrypted_contact,
              alias_contact.contact_nonce,
              old_aes,
              new_aes,
            );

            re_encrypted_alias_contacts.push({
              id: alias_contact.id,
              encrypted_contact: encrypted,
              contact_nonce: nonce,
            });
          } catch (err) {
            throw new Error(
              `alias_contact_reencrypt_failed:${alias_contact.id}:${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }

      const destinations_response = await list_alias_destinations(alias.id);

      if (!destinations_response.error && destinations_response.data) {
        for (const destination of destinations_response.data.destinations) {
          if (!destination.encrypted_destination || !destination.destination_nonce)
            continue;

          try {
            const { encrypted, nonce } = await re_encrypt_field(
              destination.encrypted_destination,
              destination.destination_nonce,
              old_aes,
              new_aes,
            );

            re_encrypted_destinations.push({
              id: destination.id,
              encrypted_destination: encrypted,
              destination_nonce: nonce,
            });
          } catch (err) {
            throw new Error(
              `destination_reencrypt_failed:${destination.id}:${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
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
      } catch (err) {
        throw new Error(
          `contact_reencrypt_failed:${contact.id}:${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (!response.data.has_more || !response.data.next_cursor) break;

    contact_cursor = response.data.next_cursor;
  }

  const directories_response = await list_alias_directories();

  if (!directories_response.error && directories_response.data) {
    for (const directory of directories_response.data.directories) {
      if (!directory.encrypted_label || !directory.label_nonce) continue;

      try {
        const { encrypted, nonce } = await re_encrypt_field(
          directory.encrypted_label,
          directory.label_nonce,
          old_aes,
          new_aes,
        );

        re_encrypted_directories.push({
          id: directory.id,
          encrypted_label: encrypted,
          label_nonce: nonce,
        });
      } catch (err) {
        throw new Error(
          `directory_reencrypt_failed:${directory.id}:${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  const domains_response = await list_domains();

  if (!domains_response.error && domains_response.data) {
    for (const domain of domains_response.data.domains) {
      const addresses_response = await list_domain_addresses(domain.id);

      if (addresses_response.error || !addresses_response.data) continue;

      for (const address of addresses_response.data.addresses) {
        try {
          const lp_ciphertext = base64_to_array(address.encrypted_local_part);
          const lp_nonce = base64_to_array(address.local_part_nonce);
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

          const full_address = `${local_part.toLowerCase()}@${domain.domain_name.toLowerCase()}`;
          const hash_sig = await crypto.subtle.sign(
            "HMAC",
            new_domain_hmac,
            new TextEncoder().encode(full_address),
          );

          const result: ReEncryptedDomainAddress = {
            id: address.id,
            encrypted_local_part: array_to_base64(
              new Uint8Array(new_lp_ciphertext),
            ),
            local_part_nonce: array_to_base64(new_lp_nonce),
            local_part_hash: array_to_base64(new Uint8Array(hash_sig)),
          };

          if (address.encrypted_display_name && address.display_name_nonce) {
            const {
              encrypted: encrypted_display_name,
              nonce: display_name_nonce,
            } = await re_encrypt_field(
              address.encrypted_display_name,
              address.display_name_nonce,
              old_aes,
              new_aes,
            );

            result.encrypted_display_name = encrypted_display_name;
            result.display_name_nonce = display_name_nonce;
          }

          re_encrypted_domain_addresses.push(result);
        } catch (err) {
          throw new Error(
            `domain_address_reencrypt_failed:${address.id}:${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  return {
    re_encrypted_aliases,
    re_encrypted_contacts,
    re_encrypted_pins,
    re_encrypted_alias_contacts,
    re_encrypted_destinations,
    re_encrypted_directories,
    re_encrypted_domain_addresses,
  };
}
