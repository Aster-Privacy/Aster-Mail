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
import type { DecryptedEnvelope } from "@/types/email";

import {
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_from_memory,
  wait_for_keys_ready,
} from "@/services/crypto/memory_key_store";
import { decrypt_pgp_message_parallel } from "@/workers/pgp_decrypt_pool";
import {
  adopt_refreshed_vault,
  fetch_refreshed_vault,
} from "@/services/crypto/vault_refresh";
import {
  decrypt_envelope_with_bytes,
  decrypt_envelope_with_identity_key,
  base64_to_array,
  first_base64_byte,
  normalize_envelope_from,
} from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { register_envelope_attachment_keys } from "@/services/crypto/inbound_attachment_keys";
import { decrypt_legacy_ios_envelope } from "@/services/crypto/legacy_ios_envelope";

export async function try_decrypt_with_identity_key(
  encrypted: string | Uint8Array,
  nonce_bytes: Uint8Array,
  identity_key: string,
): Promise<DecryptedEnvelope | null> {
  return decrypt_envelope_with_identity_key(
    identity_key,
    typeof encrypted === "string" ? base64_to_array(encrypted) : encrypted,
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
  const envelope = await open_envelope(encrypted, nonce, mail_item_id);

  register_envelope_attachment_keys(mail_item_id, envelope);

  return envelope;
}

async function open_envelope(
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

      let vault = get_vault_from_memory();
      let pass = get_passphrase_from_memory();

      if (!vault?.identity_key || !pass) {
        await wait_for_keys_ready();
        vault = get_vault_from_memory();
        pass = get_passphrase_from_memory();
      }

      if (!vault?.identity_key || !pass) return null;

      const passphrase = pass;
      const decrypt_pgp_with_keys = async (keys: string[]) => {
        const decrypted = await decrypt_pgp_message_parallel(
          text,
          keys,
          passphrase,
        );

        return JSON.parse(decrypted) as DecryptedEnvelope;
      };
      const pgp_keys = [vault.identity_key, ...(vault.previous_keys ?? [])];

      try {
        return await decrypt_pgp_with_keys(pgp_keys);
      } catch (pgp_error) {
        const refreshed = await fetch_refreshed_vault();

        if (refreshed?.vault.identity_key) {
          const tried = new Set(pgp_keys);
          const refreshed_keys = [
            refreshed.vault.identity_key,
            ...(refreshed.vault.previous_keys ?? []),
          ].filter((key) => !tried.has(key));

          if (refreshed_keys.length > 0) {
            const healed = await decrypt_pgp_with_keys(refreshed_keys);

            await adopt_refreshed_vault(refreshed);

            return healed;
          }
        }

        throw pgp_error;
      }
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

    const first_byte = first_base64_byte(encrypted);

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

    const encrypted_bytes = base64_to_array(encrypted);

    const try_identity_keys = async (identity_keys: string[]) => {
      for (const identity_key of identity_keys) {
        const decrypted = await try_decrypt_with_identity_key(
          encrypted_bytes,
          nonce_bytes,
          identity_key,
        );

        if (decrypted) return decrypted;
      }

      return null;
    };

    const identity_keys = vault?.identity_key
      ? [vault.identity_key, ...(vault.previous_keys ?? [])]
      : [];
    const result = await try_identity_keys(identity_keys);

    if (result) return result;

    const refreshed = await fetch_refreshed_vault();

    if (refreshed) {
      const tried = new Set(identity_keys);
      const refreshed_keys = [
        ...(refreshed.vault.identity_key ? [refreshed.vault.identity_key] : []),
        ...(refreshed.vault.previous_keys ?? []),
      ].filter((key) => !tried.has(key));

      if (refreshed_keys.length > 0) {
        const healed = await try_identity_keys(refreshed_keys);

        if (healed) {
          await adopt_refreshed_vault(refreshed);

          return healed;
        }
      }
    }

    const legacy_plaintext = await decrypt_legacy_ios_envelope(
      encrypted_bytes,
      nonce_bytes,
    );

    if (legacy_plaintext) {
      const parsed = JSON.parse(new TextDecoder().decode(legacy_plaintext));
      const legacy_from = normalize_envelope_from(parsed.from);

      if (legacy_from) parsed.from = legacy_from;

      return parsed as DecryptedEnvelope;
    }

    return null;
  } catch {
    zero_uint8_array(passphrase);

    return null;
  }
}
