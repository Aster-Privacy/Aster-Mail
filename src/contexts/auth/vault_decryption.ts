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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { decrypt_vault } from "@/services/crypto/key_manager";
import {
  store_vault_in_memory,
  get_vault_from_memory,
  has_vault_in_memory,
  has_vault_in_memory_for,
} from "@/services/crypto/memory_key_store";
import { auto_rekey_if_needed, reset_rekey_flag } from "@/services/crypto/auto_rekey";
import { adopt_master_key_if_needed } from "@/services/crypto/mk_adoption";
import { check_and_run_recovery_reencryption } from "@/services/crypto/recovery_reencrypt";
import { ensure_ratchet_keys } from "@/services/crypto/ensure_ratchet_keys";
import { ensure_pgp_key_published } from "@/services/crypto/ensure_pgp_key_published";
import {
  sync_all_ratchet_states,
  derive_ratchet_encryption_key,
} from "@/services/crypto/ratchet_sync";
import { backfill_pq_secrets_to_server } from "@/services/crypto/pq_prekey_store";
import { reconcile_pq_secrets_with_server } from "@/services/crypto/pq_secret_reconciler";
import { sync_escrow_to_cache } from "@/services/crypto/message_escrow";
import { generate_and_upload_prekeys } from "@/services/crypto/prekey_service";
import { api_client } from "@/services/api/client";

const PQ_MIN_THRESHOLD = 5;

async function fetch_pq_prekey_count(): Promise<number | null> {
  try {
    const response = await api_client.get<{
      one_time_prekeys: number;
      pq_prekeys: number;
    }>("/crypto/v1/keys/prekeys/count");

    if (response.error || !response.data) return null;

    return response.data.pq_prekeys;
  } catch {
    return null;
  }
}

async function ensure_pq_prekeys_available(): Promise<void> {
  try {
    const count = await fetch_pq_prekey_count();

    if (count !== null && count >= PQ_MIN_THRESHOLD) {
      return;
    }

    let attempt = 0;

    while (attempt < 3) {
      attempt += 1;

      const ok = await generate_and_upload_prekeys(true);
      const verified = await fetch_pq_prekey_count();

      if (ok && verified !== null && verified >= PQ_MIN_THRESHOLD) {
        return;
      }

      await new Promise((r) => setTimeout(r, 500));
    }
  } catch {
    /* best-effort */
  }
}

import { get_derived_encryption_key } from "@/services/crypto/memory_key_store";
import { emit_aliases_changed, emit_contacts_changed } from "@/hooks/mail_events";
import { compute_password_strength_tier } from "@/services/password_strength_score";
import { backfill_password_strength_tier } from "@/services/api/account";

import { ignore_error } from "@/lib/ignore_error";

let vault_decryption_lock: Promise<void> | null = null;

export async function decrypt_vault_with_lock(
  encrypted_vault: string,
  vault_nonce: string,
  passphrase: string,
  owner_user_id?: string,
): Promise<EncryptedVault | null> {
  const reusable = (): boolean =>
    owner_user_id
      ? has_vault_in_memory_for(owner_user_id)
      : has_vault_in_memory();

  if (reusable()) {
    return get_vault_from_memory();
  }

  if (vault_decryption_lock) {
    await vault_decryption_lock;
    if (reusable()) {
      return get_vault_from_memory();
    }
  }

  let resolve_lock: (() => void) | undefined;

  vault_decryption_lock = new Promise<void>((resolve) => {
    resolve_lock = resolve;
  });

  try {
    if (reusable()) {
      return get_vault_from_memory();
    }

    const vault = await decrypt_vault(encrypted_vault, vault_nonce, passphrase);

    reset_rekey_flag();
    await store_vault_in_memory(vault, passphrase, owner_user_id);

    backfill_password_strength_tier(
      compute_password_strength_tier(passphrase),
    ).catch((caught) => ignore_error("contexts/auth/vault_decryption:reusable", caught));

    try {
      await adopt_master_key_if_needed(vault, passphrase);
    } catch (caught) {
      ignore_error("contexts/auth/vault_decryption:reusable", caught);
    }

    auto_rekey_if_needed()
      .then((did_rekey) => {
        if (did_rekey) {
          emit_aliases_changed();
          emit_contacts_changed();
        }
      })
      .catch((caught) => ignore_error("contexts/auth/vault_decryption:reusable", caught));

    check_and_run_recovery_reencryption(vault, passphrase).catch((caught) => ignore_error("contexts/auth/vault_decryption:reusable", caught));

    ensure_pgp_key_published().catch((caught) => ignore_error("contexts/auth/vault_decryption:reusable", caught));

    ensure_ratchet_keys()
      .then(async () => {
        await ensure_pq_prekeys_available();

        const master_key = get_derived_encryption_key();

        if (!master_key) return;

        try {
          const sync_key = await derive_ratchet_encryption_key(master_key);

          await sync_all_ratchet_states(sync_key);
        } catch {
          /* best-effort */
        } finally {
          master_key.fill(0);
        }

        await backfill_pq_secrets_to_server();
        await reconcile_pq_secrets_with_server();
        sync_escrow_to_cache().catch((caught) => ignore_error("contexts/auth/vault_decryption:reusable", caught));
      })
      .catch((caught) => ignore_error("contexts/auth/vault_decryption:reusable", caught));

    return vault;
  } finally {
    resolve_lock?.();
    vault_decryption_lock = null;
  }
}
