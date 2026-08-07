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
import {
  derive_encryption_key_from_passphrase,
  get_or_create_derived_encryption_crypto_key,
} from "./memory_key_store";
import type { ApiResponse } from "../api/client";
import { list_aliases } from "../api/aliases";
import { list_contacts } from "../api/contacts";
import { list_alias_pins } from "../api/alias_pins";
import { list_alias_contacts } from "../api/alias_contacts";
import { list_alias_destinations } from "../api/alias_destinations";
import { list_alias_directories } from "../api/alias_directories";
import { list_domains, list_domain_addresses } from "../api/domains";
import { get_legacy_crypto_keys } from "./legacy_keks";

const HASH_ALG = ["SHA", "256"].join("-");

export interface OldKeyMaterial {
  data_kek?: string;
  legacy_keks?: { k: string }[];
}

export interface ReEncryptSkipReport {
  alias_ids: string[];
  contact_ids: string[];
  domain_address_ids: string[];
  unreadable_field_count: number;
}

export interface ReEncryptedAlias {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  alias_address_hash: string;
  encrypted_note?: string;
  note_nonce?: string;
  encrypted_websites?: string;
  websites_nonce?: string;
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

async function import_aes_decryption_key(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

async function build_old_key_candidates(
  old_passphrase: string,
  material?: OldKeyMaterial,
): Promise<CryptoKey[]> {
  const candidates: CryptoKey[] = [];
  const session_key = await get_or_create_derived_encryption_crypto_key();

  if (session_key) {
    candidates.push(session_key);
  }

  const raw_candidates: Uint8Array[] = [];

  raw_candidates.push(
    await derive_encryption_key_from_passphrase(
      new TextEncoder().encode(old_passphrase),
    ),
  );

  const encoded_material = [
    ...(material?.data_kek ? [material.data_kek] : []),
    ...(material?.legacy_keks ?? []).map((entry) => entry.k),
  ];

  for (const encoded of encoded_material) {
    try {
      raw_candidates.push(base64_to_array(encoded));
    } catch {
      continue;
    }
  }

  const seen = new Set<string>();

  for (const raw of raw_candidates) {
    const fingerprint = array_to_base64(raw);

    if (seen.has(fingerprint)) continue;

    seen.add(fingerprint);

    try {
      candidates.push(await import_aes_decryption_key(raw));
    } catch {
      continue;
    }
  }

  candidates.push(...get_legacy_crypto_keys());

  return candidates;
}

async function decrypt_with_candidates(
  candidates: CryptoKey[],
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<ArrayBuffer> {
  let last_error: unknown = new Error("no_candidate_key");

  for (const candidate of candidates) {
    try {
      return await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce },
        candidate,
        ciphertext,
      );
    } catch (error) {
      last_error = error;
    }
  }

  throw last_error instanceof Error ? last_error : new Error(String(last_error));
}

async function re_encrypt_field(
  encrypted_b64: string,
  nonce_b64: string,
  old_keys: CryptoKey[],
  new_key: CryptoKey,
): Promise<{ encrypted: string; nonce: string }> {
  const ciphertext = base64_to_array(encrypted_b64);
  const nonce = base64_to_array(nonce_b64);
  const decrypted = await decrypt_with_candidates(old_keys, ciphertext, nonce);
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

async function carry_forward_field(
  encrypted_b64: string,
  nonce_b64: string,
  old_keys: CryptoKey[],
  new_key: CryptoKey,
  report: ReEncryptSkipReport,
): Promise<{ encrypted: string; nonce: string }> {
  try {
    return await re_encrypt_field(encrypted_b64, nonce_b64, old_keys, new_key);
  } catch {
    report.unreadable_field_count += 1;

    return { encrypted: encrypted_b64, nonce: nonce_b64 };
  }
}

const LIST_RETRY_ATTEMPTS = 4;
const LIST_RETRY_BASE_DELAY_MS = 400;

const DEFINITIVE_LIST_ERROR_CODES = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
]);

function sleep(duration_ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration_ms));
}

export async function list_page_with_retry<T>(
  fetch_page: () => Promise<ApiResponse<T>>,
): Promise<ApiResponse<T>> {
  let response = await fetch_page();

  for (let attempt = 1; attempt < LIST_RETRY_ATTEMPTS; attempt += 1) {
    if (response.data && !response.error) return response;
    if (response.code && DEFINITIVE_LIST_ERROR_CODES.has(response.code)) {
      return response;
    }

    await sleep(LIST_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));

    response = await fetch_page();
  }

  return response;
}

export async function re_encrypt_user_data(
  old_passphrase: string,
  new_passphrase: string,
  old_key_material?: OldKeyMaterial,
): Promise<{
  re_encrypted_aliases: ReEncryptedAlias[];
  re_encrypted_contacts: ReEncryptedContact[];
  re_encrypted_pins: ReEncryptedPin[];
  re_encrypted_alias_contacts: ReEncryptedAliasContact[];
  re_encrypted_destinations: ReEncryptedDestination[];
  re_encrypted_directories: ReEncryptedDirectory[];
  re_encrypted_domain_addresses: ReEncryptedDomainAddress[];
  skipped: ReEncryptSkipReport;
}> {
  const [
    old_keys,
    new_aes,
    new_alias_hmac,
    new_contacts_hmac,
    new_domain_hmac,
  ] = await Promise.all([
    build_old_key_candidates(old_passphrase, old_key_material),
    derive_aes_key(new_passphrase),
    derive_alias_hmac_key(new_passphrase),
    derive_contacts_hmac_key(new_passphrase),
    derive_domain_address_hmac_key(new_passphrase),
  ]);

  const skipped: ReEncryptSkipReport = {
    alias_ids: [],
    contact_ids: [],
    domain_address_ids: [],
    unreadable_field_count: 0,
  };

  const re_encrypted_aliases: ReEncryptedAlias[] = [];
  const re_encrypted_pins: ReEncryptedPin[] = [];
  const re_encrypted_alias_contacts: ReEncryptedAliasContact[] = [];
  const re_encrypted_destinations: ReEncryptedDestination[] = [];
  const re_encrypted_directories: ReEncryptedDirectory[] = [];
  const re_encrypted_domain_addresses: ReEncryptedDomainAddress[] = [];
  let alias_offset = 0;

  while (true) {
    const response = await list_page_with_retry(() =>
      list_aliases({ limit: 100, offset: alias_offset }),
    );

    if (response.error || !response.data) {
      throw new Error(
        `alias_reencrypt_failed:list:${response.error ?? "no_data"}`,
      );
    }

    for (const alias of response.data.aliases) {
      if (alias.is_random) continue;

      try {
        const lp_ciphertext = base64_to_array(alias.encrypted_local_part);
        const lp_nonce = base64_to_array(alias.local_part_nonce);
        const lp_plaintext = await decrypt_with_candidates(
          old_keys,
          lp_ciphertext,
          lp_nonce,
        );
        const local_part = new TextDecoder().decode(lp_plaintext);
        const new_lp_nonce = crypto.getRandomValues(new Uint8Array(12));
        const new_lp_ciphertext = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: new_lp_nonce },
          new_aes,
          lp_plaintext,
        );

        const full_address = `${local_part.toLowerCase().replace(/\./g, "")}@${alias.domain}`;
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
            await carry_forward_field(
              alias.encrypted_display_name,
              alias.display_name_nonce,
              old_keys,
              new_aes,
              skipped,
            );

          result.encrypted_display_name = encrypted_display_name;
          result.display_name_nonce = display_name_nonce;
        }

        if (alias.encrypted_note && alias.note_nonce) {
          const { encrypted: encrypted_note, nonce: note_nonce } =
            await carry_forward_field(
              alias.encrypted_note,
              alias.note_nonce,
              old_keys,
              new_aes,
              skipped,
            );

          result.encrypted_note = encrypted_note;
          result.note_nonce = note_nonce;
        }

        if (alias.encrypted_websites && alias.websites_nonce) {
          const { encrypted: encrypted_websites, nonce: websites_nonce } =
            await carry_forward_field(
              alias.encrypted_websites,
              alias.websites_nonce,
              old_keys,
              new_aes,
              skipped,
            );

          result.encrypted_websites = encrypted_websites;
          result.websites_nonce = websites_nonce;
        }

        re_encrypted_aliases.push(result);
      } catch {
        skipped.alias_ids.push(alias.id);
      }

      const pins_response = await list_page_with_retry(() =>
        list_alias_pins(alias.id),
      );

      if (pins_response.error || !pins_response.data) {
        skipped.unreadable_field_count += 1;
      } else {
        for (const pin of pins_response.data.pins) {
          if (!pin.encrypted_sender || !pin.sender_nonce) continue;

          try {
            const { encrypted, nonce } = await re_encrypt_field(
              pin.encrypted_sender,
              pin.sender_nonce,
              old_keys,
              new_aes,
            );

            re_encrypted_pins.push({
              id: pin.id,
              encrypted_sender: encrypted,
              sender_nonce: nonce,
            });
          } catch {
            continue;
          }
        }
      }

      const alias_contacts_response = await list_page_with_retry(() =>
        list_alias_contacts(alias.id),
      );

      if (alias_contacts_response.error || !alias_contacts_response.data) {
        skipped.unreadable_field_count += 1;
      } else {
        for (const alias_contact of alias_contacts_response.data.contacts) {
          if (!alias_contact.encrypted_contact || !alias_contact.contact_nonce)
            continue;

          try {
            const { encrypted, nonce } = await re_encrypt_field(
              alias_contact.encrypted_contact,
              alias_contact.contact_nonce,
              old_keys,
              new_aes,
            );

            re_encrypted_alias_contacts.push({
              id: alias_contact.id,
              encrypted_contact: encrypted,
              contact_nonce: nonce,
            });
          } catch {
            continue;
          }
        }
      }

      const destinations_response = await list_page_with_retry(() =>
        list_alias_destinations(alias.id),
      );

      if (destinations_response.error || !destinations_response.data) {
        skipped.unreadable_field_count += 1;
      } else {
        for (const destination of destinations_response.data.destinations) {
          if (!destination.encrypted_destination || !destination.destination_nonce)
            continue;

          try {
            const { encrypted, nonce } = await re_encrypt_field(
              destination.encrypted_destination,
              destination.destination_nonce,
              old_keys,
              new_aes,
            );

            re_encrypted_destinations.push({
              id: destination.id,
              encrypted_destination: encrypted,
              destination_nonce: nonce,
            });
          } catch {
            continue;
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

    const response = await list_page_with_retry(() => list_contacts(params));

    if (response.error || !response.data) {
      throw new Error(
        `contact_reencrypt_failed:list:${response.error ?? "no_data"}`,
      );
    }

    for (const contact of response.data.items) {
      try {
        const ct_ciphertext = base64_to_array(contact.encrypted_data);
        const ct_nonce = base64_to_array(contact.data_nonce);
        const ct_plaintext = await decrypt_with_candidates(
          old_keys,
          ct_ciphertext,
          ct_nonce,
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
        skipped.contact_ids.push(contact.id);
        continue;
      }
    }

    if (!response.data.has_more || !response.data.next_cursor) break;

    contact_cursor = response.data.next_cursor;
  }

  const directories_response = await list_page_with_retry(() =>
    list_alias_directories(),
  );

  if (directories_response.error || !directories_response.data) {
    skipped.unreadable_field_count += 1;
  } else {
    for (const directory of directories_response.data.directories) {
      if (!directory.encrypted_label || !directory.label_nonce) continue;

      try {
        const { encrypted, nonce } = await re_encrypt_field(
          directory.encrypted_label,
          directory.label_nonce,
          old_keys,
          new_aes,
        );

        re_encrypted_directories.push({
          id: directory.id,
          encrypted_label: encrypted,
          label_nonce: nonce,
        });
      } catch {
        continue;
      }
    }
  }

  const domains_response = await list_page_with_retry(() => list_domains());

  if (domains_response.error || !domains_response.data) {
    skipped.unreadable_field_count += 1;
  } else {
    for (const domain of domains_response.data.domains) {
      const addresses_response = await list_page_with_retry(() =>
        list_domain_addresses(domain.id),
      );

      if (addresses_response.error || !addresses_response.data) {
        skipped.unreadable_field_count += 1;
        continue;
      }

      for (const address of addresses_response.data.addresses) {
        try {
          const lp_ciphertext = base64_to_array(address.encrypted_local_part);
          const lp_nonce = base64_to_array(address.local_part_nonce);
          const lp_plaintext = await decrypt_with_candidates(
            old_keys,
            lp_ciphertext,
            lp_nonce,
          );
          const local_part = new TextDecoder().decode(lp_plaintext);
          const new_lp_nonce = crypto.getRandomValues(new Uint8Array(12));
          const new_lp_ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: new_lp_nonce },
            new_aes,
            lp_plaintext,
          );

          const full_address = `${local_part.toLowerCase().replace(/\./g, "")}@${domain.domain_name.toLowerCase()}`;
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
            } = await carry_forward_field(
              address.encrypted_display_name,
              address.display_name_nonce,
              old_keys,
              new_aes,
              skipped,
            );

            result.encrypted_display_name = encrypted_display_name;
            result.display_name_nonce = display_name_nonce;
          }

          re_encrypted_domain_addresses.push(result);
        } catch {
          skipped.domain_address_ids.push(address.id);
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
    skipped,
  };
}
