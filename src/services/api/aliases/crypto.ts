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
import { HASH_ALG } from "@/services/crypto/constants";
import type { } from "@/lib/i18n/types";


import {
  get_or_create_derived_encryption_crypto_key,
  get_derived_encryption_key,
} from "@/services/crypto/memory_key_store";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";


import { DecryptedEmailAlias, EmailAlias } from "./types";
import { parse_websites_payload } from "./website";
export function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

export function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export async function get_alias_hmac_key(): Promise<CryptoKey> {
  const raw_key = get_derived_encryption_key();

  if (!raw_key) {
    throw new Error("No encryption key available");
  }

  const encoder = new TextEncoder();
  const info = encoder.encode("astermail-alias-hmac-v1");
  const combined = new Uint8Array(raw_key.byteLength + info.length);

  combined.set(raw_key, 0);
  combined.set(info, raw_key.byteLength);

  const hash = await crypto.subtle.digest(HASH_ALG, combined);

  zero_uint8_array(raw_key);
  zero_uint8_array(combined);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "HMAC", hash: HASH_ALG },
    false,
    ["sign"],
  );
}

export async function get_alias_encryption_key(): Promise<CryptoKey> {
  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) {
    throw new Error("No encryption key available");
  }

  return key;
}

export function normalize_local_part(local_part: string): string {
  return local_part.toLowerCase().replace(/\./g, "");
}

export async function compute_alias_hash(
  local_part: string,
  domain: string,
): Promise<string> {
  const hmac_key = await get_alias_hmac_key();
  const full_address = `${normalize_local_part(local_part)}@${domain}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(full_address);
  const signature = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(signature));
}

export async function compute_routing_hash(
  local_part: string,
  domain: string,
): Promise<string> {
  const full_address = `${normalize_local_part(local_part)}@${domain}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(full_address);
  const hash = await crypto.subtle.digest(HASH_ALG, data);

  return array_to_base64(new Uint8Array(hash));
}

export async function encrypt_alias_field(value: string): Promise<{
  encrypted: string;
  nonce: string;
}> {
  const key = await get_alias_encryption_key();
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(value);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    plaintext,
  );

  return {
    encrypted: array_to_base64(new Uint8Array(ciphertext)),
    nonce: array_to_base64(nonce),
  };
}

export async function decrypt_alias_field(
  encrypted: string,
  nonce: string,
): Promise<string> {
  const key = await get_alias_encryption_key();
  const ciphertext = base64_to_array(encrypted);
  const iv = base64_to_array(nonce);
  const decrypted = await decrypt_aes_gcm_with_fallback(key, ciphertext, iv);
  const decoder = new TextDecoder();

  return decoder.decode(decrypted);
}

export async function decrypt_alias(
  alias: EmailAlias,
): Promise<DecryptedEmailAlias> {
  if (alias.is_random) {
    const local_part = new TextDecoder().decode(
      base64_to_array(alias.encrypted_local_part),
    );

    let display_name: string | undefined;

    if (alias.encrypted_display_name && alias.display_name_nonce) {
      try {
        display_name = await decrypt_alias_field(
          alias.encrypted_display_name,
          alias.display_name_nonce,
        );
      } catch {}
    }

    let note: string | undefined;

    if (alias.encrypted_note && alias.note_nonce) {
      try {
        note = await decrypt_alias_field(
          alias.encrypted_note,
          alias.note_nonce,
        );
      } catch {}
    }

    let websites: string[] | undefined;

    if (alias.encrypted_websites && alias.websites_nonce) {
      try {
        const payload = await decrypt_alias_field(
          alias.encrypted_websites,
          alias.websites_nonce,
        );
        const parsed = parse_websites_payload(payload);

        if (parsed.length > 0) websites = parsed;
      } catch {}
    }

    return {
      id: alias.id,
      local_part,
      display_name,
      note,
      websites,
      alias_address_hash: alias.alias_address_hash,
      domain: alias.domain,
      full_address: `${local_part}@${alias.domain}`,
      is_enabled: alias.is_enabled,
      is_random: alias.is_random,
      is_pinned: alias.is_pinned,
      never_inbox: alias.never_inbox ?? false,
      delivery_folder_token: alias.delivery_folder_token ?? null,
      delivery_label_token: alias.delivery_label_token ?? null,
      profile_picture: alias.profile_picture,
      downgrade_grace_expires_at: alias.downgrade_grace_expires_at,
      created_at: alias.created_at,
      updated_at: alias.updated_at,
    };
  }

  try {
    const local_part = await decrypt_alias_field(
      alias.encrypted_local_part,
      alias.local_part_nonce,
    );

    let display_name: string | undefined;

    if (alias.encrypted_display_name && alias.display_name_nonce) {
      try {
        display_name = await decrypt_alias_field(
          alias.encrypted_display_name,
          alias.display_name_nonce,
        );
      } catch {}
    }

    let note: string | undefined;

    if (alias.encrypted_note && alias.note_nonce) {
      try {
        note = await decrypt_alias_field(
          alias.encrypted_note,
          alias.note_nonce,
        );
      } catch {}
    }

    let websites: string[] | undefined;

    if (alias.encrypted_websites && alias.websites_nonce) {
      try {
        const payload = await decrypt_alias_field(
          alias.encrypted_websites,
          alias.websites_nonce,
        );
        const parsed = parse_websites_payload(payload);

        if (parsed.length > 0) websites = parsed;
      } catch {}
    }

    return {
      id: alias.id,
      local_part,
      display_name,
      note,
      websites,
      alias_address_hash: alias.alias_address_hash,
      domain: alias.domain,
      full_address: `${local_part}@${alias.domain}`,
      is_enabled: alias.is_enabled,
      is_random: alias.is_random,
      is_pinned: alias.is_pinned,
      never_inbox: alias.never_inbox ?? false,
      delivery_folder_token: alias.delivery_folder_token ?? null,
      delivery_label_token: alias.delivery_label_token ?? null,
      profile_picture: alias.profile_picture,
      downgrade_grace_expires_at: alias.downgrade_grace_expires_at,
      created_at: alias.created_at,
      updated_at: alias.updated_at,
    };
  } catch {
    return {
      id: alias.id,
      local_part: "",
      alias_address_hash: alias.alias_address_hash,
      domain: alias.domain,
      full_address: `@${alias.domain}`,
      is_enabled: alias.is_enabled,
      is_random: alias.is_random,
      is_pinned: alias.is_pinned,
      never_inbox: alias.never_inbox ?? false,
      delivery_folder_token: alias.delivery_folder_token ?? null,
      delivery_label_token: alias.delivery_label_token ?? null,
      decryption_failed: true,
      profile_picture: alias.profile_picture,
      downgrade_grace_expires_at: alias.downgrade_grace_expires_at,
      created_at: alias.created_at,
      updated_at: alias.updated_at,
    };
  }
}

export const DECRYPT_BATCH_SIZE = 100;

export async function decrypt_aliases(
  aliases: EmailAlias[],
): Promise<DecryptedEmailAlias[]> {
  const decrypted: DecryptedEmailAlias[] = [];

  for (let i = 0; i < aliases.length; i += DECRYPT_BATCH_SIZE) {
    const batch = aliases.slice(i, i + DECRYPT_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((alias) => decrypt_alias(alias)),
    );

    for (const result of results) {
      if (result.status === "fulfilled") decrypted.push(result.value);
    }

    if (i + DECRYPT_BATCH_SIZE < aliases.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return decrypted;
}

