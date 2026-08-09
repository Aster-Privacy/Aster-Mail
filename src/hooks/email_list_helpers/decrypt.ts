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
import type {
  
  DecryptedEnvelope,
  
} from "@/types/email";

import {
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_from_memory,
  wait_for_keys_ready,
} from "@/services/crypto/memory_key_store";
import { decrypt_message_with_any_key } from "@/services/crypto/key_manager";
import {
  decrypt_envelope_with_bytes,
  decrypt_envelope_with_identity_key,
  base64_to_array,
  normalize_envelope_from,
  
} from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";

export async function try_decrypt_with_identity_key(
  encrypted: string,
  nonce_bytes: Uint8Array,
  identity_key: string,
): Promise<DecryptedEnvelope | null> {
  return decrypt_envelope_with_identity_key(
    identity_key,
    base64_to_array(encrypted),
    nonce_bytes,
    (plaintext) => {
      const parsed = JSON.parse(new TextDecoder().decode(plaintext));
      const from = normalize_envelope_from(parsed.from);

      if (from) parsed.from = from;

      return parsed;
    },
  );
}

export async function decrypt_envelope(
  encrypted: string,
  nonce: string,
  mail_item_id?: string,
): Promise<DecryptedEnvelope | null> {
  const nonce_bytes = nonce ? base64_to_array(nonce) : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted);
      const text = new TextDecoder().decode(encrypted_bytes);

      if (!text.startsWith("-----BEGIN PGP")) {
        return JSON.parse(text) as DecryptedEnvelope;
      }

      const vault = get_vault_from_memory();
      const pass = get_passphrase_from_memory();

      if (vault?.identity_key && pass) {
        const decrypted = await decrypt_message_with_any_key(
          text,
          [vault.identity_key, ...(vault.previous_keys ?? [])],
          pass,
        );

        return JSON.parse(decrypted) as DecryptedEnvelope;
      }

      return null;
    } catch {
      return null;
    }
  }

  const passphrase = get_passphrase_bytes();

  if (!passphrase) return null;

  try {
    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<DecryptedEnvelope>(
        encrypted,
        passphrase,
      );

      zero_uint8_array(passphrase);

      return result;
    }

    zero_uint8_array(passphrase);

    const first_byte = base64_to_array(encrypted)[0];
    if (
      nonce_bytes.length === 12 &&
      (first_byte === 2 || first_byte === 3 || first_byte === 4)
    ) {
      const { decrypt_mail_envelope } = await import(
        "@/components/email/shared/decrypt_envelope"
      );
      const ecies_result = await decrypt_mail_envelope<DecryptedEnvelope>(
        encrypted,
        nonce,
        mail_item_id,
      );
      if (ecies_result) return ecies_result;
    }

    let vault = get_vault_from_memory();

    if (!vault?.identity_key) {
      await wait_for_keys_ready();
      vault = get_vault_from_memory();
    }

    if (!vault?.identity_key) return null;

    const result = await try_decrypt_with_identity_key(
      encrypted,
      nonce_bytes,
      vault.identity_key,
    );

    if (result) return result;

    if (vault.previous_keys && vault.previous_keys.length > 0) {
      for (const prev_key of vault.previous_keys) {
        const prev_result = await try_decrypt_with_identity_key(
          encrypted,
          nonce_bytes,
          prev_key,
        );

        if (prev_result) return prev_result;
      }
    }

    return null;
  } catch {
    zero_uint8_array(passphrase);

    return null;
  }
}

