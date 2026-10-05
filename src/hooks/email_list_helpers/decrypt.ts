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

import { vault_identity_key_materials } from "@/services/crypto/identity_key_materials";
import {
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_from_memory,
  on_keys_ready,
  on_vault_cleared,
  wait_for_keys_ready,
} from "@/services/crypto/memory_key_store";
import { on_account_keys_added } from "@/services/crypto/account_key_events";
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
import { load_openpgp } from "@/services/crypto/openpgp_loader";

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

const ENVELOPE_CACHE_MAX = 2000;
const ENVELOPE_CACHE_TAIL = 64;
const FAILED_ENVELOPE_MAX = 2000;
const FAILED_ENVELOPE_TTL_MS = 5 * 60 * 1000;

interface EnvelopeAttempt {
  envelope: DecryptedEnvelope | null;
  exhausted: boolean;
}

const UNRESOLVED_ATTEMPT: EnvelopeAttempt = {
  envelope: null,
  exhausted: false,
};
const EXHAUSTED_ATTEMPT: EnvelopeAttempt = { envelope: null, exhausted: true };

function opened_attempt(envelope: DecryptedEnvelope): EnvelopeAttempt {
  return { envelope, exhausted: false };
}

const envelope_cache = new Map<string, Promise<EnvelopeAttempt>>();
const failed_envelopes = new Map<string, number>();
const pending_generations = new WeakMap<Promise<EnvelopeAttempt>, number>();
let key_generation = 0;
let envelope_cache_armed = false;

function envelope_cache_key(
  encrypted: string,
  nonce: string,
  mail_item_id?: string,
): string | null {
  if (!mail_item_id || !encrypted) return null;

  return `${mail_item_id}|${nonce}|${encrypted.length}|${encrypted.slice(-ENVELOPE_CACHE_TAIL)}`;
}

function arm_envelope_cache(): void {
  if (envelope_cache_armed) return;
  envelope_cache_armed = true;
  on_vault_cleared(() => {
    envelope_cache.clear();
    forget_failed_envelopes();
  });
  on_keys_ready(() => {
    forget_failed_envelopes();
  });
  on_account_keys_added(() => {
    forget_failed_envelopes();
  });
}

function forget_failed_envelopes(): void {
  failed_envelopes.clear();
  key_generation += 1;
}

function failed_recently(key: string): boolean {
  const expires_at = failed_envelopes.get(key);

  if (expires_at === undefined) return false;
  if (expires_at > Date.now()) return true;
  failed_envelopes.delete(key);

  return false;
}

function remember_failure(key: string): void {
  failed_envelopes.delete(key);
  failed_envelopes.set(key, Date.now() + FAILED_ENVELOPE_TTL_MS);
  while (failed_envelopes.size > FAILED_ENVELOPE_MAX) {
    const oldest = failed_envelopes.keys().next().value;

    if (oldest === undefined) break;
    failed_envelopes.delete(oldest);
  }
}

export function clear_envelope_cache(): void {
  envelope_cache.clear();
  forget_failed_envelopes();
}

export async function decrypt_envelope(
  encrypted: string,
  nonce: string,
  mail_item_id?: string,
): Promise<DecryptedEnvelope | null> {
  const key = envelope_cache_key(encrypted, nonce, mail_item_id);

  if (key === null) {
    const { envelope } = await open_envelope(encrypted, nonce, mail_item_id);

    register_envelope_attachment_keys(mail_item_id, envelope);

    return envelope;
  }

  arm_envelope_cache();
  if (failed_recently(key)) return null;

  let pending = envelope_cache.get(key);

  if (pending) {
    envelope_cache.delete(key);
    envelope_cache.set(key, pending);
  } else {
    pending = open_envelope(encrypted, nonce, mail_item_id);
    pending_generations.set(pending, key_generation);
    envelope_cache.set(key, pending);
    while (envelope_cache.size > ENVELOPE_CACHE_MAX) {
      const oldest = envelope_cache.keys().next().value;

      if (oldest === undefined) break;
      envelope_cache.delete(oldest);
    }
  }

  let attempt: EnvelopeAttempt;

  try {
    attempt = await pending;
  } catch (caught) {
    if (envelope_cache.get(key) === pending) envelope_cache.delete(key);
    throw caught;
  }

  const { envelope } = attempt;

  if (!envelope) {
    if (envelope_cache.get(key) === pending) envelope_cache.delete(key);
    if (
      attempt.exhausted &&
      pending_generations.get(pending) === key_generation
    ) {
      remember_failure(key);
    }

    return null;
  }

  register_envelope_attachment_keys(mail_item_id, envelope);

  return { ...envelope };
}

async function open_envelope(
  encrypted: string,
  nonce: string,
  mail_item_id?: string,
): Promise<EnvelopeAttempt> {
  const nonce_bytes = nonce ? base64_to_array(nonce) : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted);
      const text = new TextDecoder().decode(encrypted_bytes);

      if (!text.startsWith("-----BEGIN PGP")) {
        return opened_attempt(JSON.parse(text) as DecryptedEnvelope);
      }

      let vault = get_vault_from_memory();
      let pass = get_passphrase_from_memory();

      if (!vault?.identity_key || !pass) {
        await wait_for_keys_ready();
        vault = get_vault_from_memory();
        pass = get_passphrase_from_memory();
      }

      if (!vault?.identity_key || !pass) return UNRESOLVED_ATTEMPT;

      await load_openpgp();

      const passphrase = pass;
      const decrypt_pgp_with_keys = async (keys: string[]) => {
        try {
          const decrypted = await decrypt_pgp_message_parallel(
            text,
            keys,
            passphrase,
          );

          return JSON.parse(decrypted) as DecryptedEnvelope;
        } catch {
          return null;
        }
      };
      const pgp_keys = [vault.identity_key, ...(vault.previous_keys ?? [])];
      const from_vault = await decrypt_pgp_with_keys(pgp_keys);

      if (from_vault) return opened_attempt(from_vault);

      const refreshed = await fetch_refreshed_vault();

      if (!refreshed) return UNRESOLVED_ATTEMPT;

      if (refreshed.vault.identity_key) {
        const tried = new Set(pgp_keys);
        const refreshed_keys = [
          refreshed.vault.identity_key,
          ...(refreshed.vault.previous_keys ?? []),
        ].filter((key) => !tried.has(key));

        if (refreshed_keys.length > 0) {
          const healed = await decrypt_pgp_with_keys(refreshed_keys);

          if (healed) {
            await adopt_refreshed_vault(refreshed);

            return opened_attempt(healed);
          }
        }
      }

      return EXHAUSTED_ATTEMPT;
    } catch {
      return UNRESOLVED_ATTEMPT;
    }
  }

  const passphrase = get_passphrase_bytes();

  if (!passphrase) return UNRESOLVED_ATTEMPT;

  try {
    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<DecryptedEnvelope>(
        encrypted,
        passphrase,
      );

      zero_uint8_array(passphrase);

      return result ? opened_attempt(result) : EXHAUSTED_ATTEMPT;
    }

    zero_uint8_array(passphrase);

    const first_byte = first_base64_byte(encrypted);

    if (
      nonce_bytes.length === 12 &&
      (first_byte === 2 || first_byte === 3 || first_byte === 4)
    ) {
      const { decrypt_mail_envelope } =
        await import("@/components/email/shared/decrypt_envelope");
      const ecies_result = await decrypt_mail_envelope<DecryptedEnvelope>(
        encrypted,
        nonce,
        mail_item_id,
      );

      if (ecies_result) return opened_attempt(ecies_result);
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
      ? vault_identity_key_materials(vault)
      : [];
    const result = await try_identity_keys(identity_keys);

    if (result) return opened_attempt(result);

    const refreshed = await fetch_refreshed_vault();

    if (refreshed) {
      const tried = new Set(identity_keys);
      const refreshed_keys = vault_identity_key_materials(
        refreshed.vault,
      ).filter((key) => !tried.has(key));

      if (refreshed_keys.length > 0) {
        const healed = await try_identity_keys(refreshed_keys);

        if (healed) {
          await adopt_refreshed_vault(refreshed);

          return opened_attempt(healed);
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

      return opened_attempt(parsed as DecryptedEnvelope);
    }

    return refreshed ? EXHAUSTED_ATTEMPT : UNRESOLVED_ATTEMPT;
  } catch {
    zero_uint8_array(passphrase);

    return UNRESOLVED_ATTEMPT;
  }
}
