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
import type { DecryptedEnvelope } from "@/types/email";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";

import {
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import { decrypt_message_verified } from "@/services/crypto/key_manager";
import {
  decrypt_envelope_with_bytes,
  base64_to_array,
  normalize_parsed_envelope,
} from "@/services/crypto/envelope";
import { resolve_sender_verification_keys } from "@/services/crypto/sender_verification";
import { zero_uint8_array } from "@/services/crypto/secure_memory";

const HASH_ALG = ["SHA", "256"].join("-");
const ENVELOPE_KEY_VERSIONS = ["astermail-envelope-v1", "astermail-import-v1"];

export async function decrypt_mail_envelope<
  T extends { from: { name: string; email: string } } = DecryptedEnvelope,
>(encrypted_envelope: string, envelope_nonce: string): Promise<T | null> {
  const nonce_bytes = envelope_nonce
    ? base64_to_array(envelope_nonce)
    : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted_envelope);
      const text = new TextDecoder().decode(encrypted_bytes);

      if (!text.startsWith("-----BEGIN PGP")) {
        return normalize_parsed_envelope(JSON.parse(text)) as T;
      }

      const vault = get_vault_from_memory();
      const pass = get_passphrase_from_memory();

      if (vault?.identity_key && pass) {
        const first_pass = await decrypt_message_verified(
          text,
          vault.identity_key,
          pass,
        );
        const parsed = normalize_parsed_envelope(
          JSON.parse(first_pass.plaintext),
        ) as T & { from?: { email?: string }; sender_verification?: string };

        if (first_pass.has_signature && parsed?.from?.email) {
          const sender_keys = await resolve_sender_verification_keys(
            parsed.from.email,
          );

          if (sender_keys.length > 0) {
            const verified_pass = await decrypt_message_verified(
              text,
              vault.identity_key,
              pass,
              sender_keys,
            );

            parsed.sender_verification = verified_pass.verification;
          } else {
            parsed.sender_verification = "no_keys";
          }
        } else {
          parsed.sender_verification = first_pass.has_signature
            ? "no_keys"
            : "unsigned";
        }

        return parsed as T;
      }

      return null;
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);

      return null;
    }
  }

  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) return null;

  try {
    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<T>(
        encrypted_envelope,
        passphrase_bytes,
      );

      zero_uint8_array(passphrase_bytes);

      return result;
    }

    zero_uint8_array(passphrase_bytes);

    const vault = get_vault_from_memory();

    if (!vault?.identity_key) return null;

    const enc_bytes = base64_to_array(encrypted_envelope);

    for (const version of ENVELOPE_KEY_VERSIONS) {
      try {
        const key_hash = await crypto.subtle.digest(
          HASH_ALG,
          new TextEncoder().encode(vault.identity_key + version),
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

        return normalize_parsed_envelope(parsed) as T;
      } catch {
        continue;
      }
    }

    if (vault.previous_keys?.length) {
      for (const previous_key of vault.previous_keys) {
        for (const version of ENVELOPE_KEY_VERSIONS) {
          try {
            const key_hash = await crypto.subtle.digest(
              HASH_ALG,
              new TextEncoder().encode(previous_key + version),
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

            return normalize_parsed_envelope(parsed) as T;
          } catch {
            continue;
          }
        }
      }
    }

    return null;
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    zero_uint8_array(passphrase_bytes);

    return null;
  }
}
