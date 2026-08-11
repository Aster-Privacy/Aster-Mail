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

import type { DecryptedEnvelope, } from "@/types/email";


import {
  reencrypt_mail_item_envelope,
} from "@/services/api/mail";
import {
  decrypt_envelope_with_bytes,
  decrypt_envelope_with_identity_key,
  encrypt_envelope_with_identity_key,
  base64_to_array,
} from "@/services/crypto/envelope";
import {
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_from_memory,
  wait_for_keys_ready,
} from "@/services/crypto/memory_key_store";
import { decrypt_pgp_message_parallel } from "@/workers/pgp_decrypt_pool";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { register_envelope_attachment_keys } from "@/services/crypto/inbound_attachment_keys";
import {
  normalize_envelope_from,
} from "@/services/crypto/envelope_normalize";

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

export const legacy_migration_attempted = new Set<string>();
export let legacy_migration_inflight = 0;
export const LEGACY_MIGRATION_MAX_INFLIGHT = 4;
export const legacy_migration_queue: Array<() => void> = [];
export let legacy_migration_disabled = true;
let legacy_migration_succeeded = false;

export function reset_legacy_migration_state(): void {
  legacy_migration_attempted.clear();
  legacy_migration_queue.length = 0;
  legacy_migration_inflight = 0;
  legacy_migration_disabled = false;
  legacy_migration_succeeded = false;
}

export function schedule_legacy_envelope_migration(
  item_id: string,
  item_type: string,
  envelope: DecryptedEnvelope,
): void {
  if (item_type !== "received") return;
  if (legacy_migration_disabled) return;
  if (legacy_migration_attempted.has(item_id)) return;

  const has_body =
    !!envelope.body_text || !!envelope.body_html || !!envelope.html_body;

  if (!has_body) return;

  legacy_migration_attempted.add(item_id);

  const envelope_snapshot = JSON.stringify(envelope);

  const run = async () => {
    legacy_migration_inflight++;

    try {
      const vault = get_vault_from_memory();

      if (!vault?.identity_key) return;

      const snapshot = JSON.parse(envelope_snapshot) as DecryptedEnvelope;

      if (!snapshot.body_text && !snapshot.body_html && !snapshot.html_body) {
        return;
      }

      const { encrypted, nonce } = await encrypt_envelope_with_identity_key(
        snapshot,
        vault.identity_key,
      );

      const response = await reencrypt_mail_item_envelope(item_id, {
        encrypted_envelope: encrypted,
        envelope_nonce: nonce,
      });

      if (response.data) legacy_migration_succeeded = true;
      else if (!legacy_migration_succeeded) legacy_migration_disabled = true;
    } catch {
      if (!legacy_migration_succeeded) legacy_migration_disabled = true;
    } finally {
      if (legacy_migration_disabled) legacy_migration_queue.length = 0;

      legacy_migration_inflight--;
      const next = legacy_migration_queue.shift();

      if (next) next();
    }
  };

  if (legacy_migration_inflight < LEGACY_MIGRATION_MAX_INFLIGHT) {
    run();
  } else {
    legacy_migration_queue.push(run);
  }
}

export async function decrypt_envelope_for_search(
  encrypted: string,
  nonce: string,
  item_id: string,
  item_type: string,
): Promise<DecryptedEnvelope | null> {
  const envelope = await open_search_envelope(
    encrypted,
    nonce,
    item_id,
    item_type,
  );

  register_envelope_attachment_keys(item_id, envelope);

  return envelope;
}

async function open_search_envelope(
  encrypted: string,
  nonce: string,
  item_id: string,
  item_type: string,
): Promise<DecryptedEnvelope | null> {
  const nonce_bytes = nonce ? base64_to_array(nonce) : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted);
      const text = new TextDecoder().decode(encrypted_bytes);

      if (!text.startsWith("-----BEGIN PGP")) {
        const parsed = JSON.parse(text) as DecryptedEnvelope;

        schedule_legacy_envelope_migration(item_id, item_type, parsed);

        return parsed;
      }

      const vault = get_vault_from_memory();
      const pass = get_passphrase_from_memory();

      if (vault?.identity_key && pass) {
        const decrypted = await decrypt_pgp_message_parallel(
          text,
          [vault.identity_key, ...(vault.previous_keys ?? [])],
          pass,
        );
        const parsed = JSON.parse(decrypted) as DecryptedEnvelope;

        schedule_legacy_envelope_migration(item_id, item_type, parsed);

        return parsed;
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

      if (result)
        schedule_legacy_envelope_migration(item_id, item_type, result);

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
        item_id,
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

