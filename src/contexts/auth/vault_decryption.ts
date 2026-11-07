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

import { decrypt_vault, encrypt_vault } from "@/services/crypto/key_manager";
import {
  store_vault_in_memory,
  get_vault_from_memory,
  has_vault_in_memory,
  has_vault_in_memory_for,
  get_last_vault_owner_id,
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_account_epoch,
  on_vault_cleared,
  on_vault_stored,
} from "@/services/crypto/memory_key_store";
import { create_level2_storage } from "@/contexts/auth/level2_storage";
import {
  envelope_v2_write_key,
  wipe_envelope_v2_keys,
} from "@/services/crypto/envelope_v2";
import {
  run_vault_work_factor_once,
  type CurrentVaultView,
  type VaultWorkFactorDeps,
} from "@/services/crypto/vault_work_factor";
import {
  VAULT_PATH,
  persist_local_vault,
} from "@/services/crypto/vault_cas_write";
import { collect_vault_key_fingerprints } from "@/services/crypto/vault_key_fingerprints";
import {
  reset_locked_folder_rekey,
  trigger_locked_folder_rekey,
  type LockedFolderRekeyDeps,
} from "@/services/crypto/locked_folder_rekey";
import { on_locked_folder_listing } from "@/services/locked_folder_listing";
import {
  get_unlock_token,
  on_folder_unlock_change,
} from "@/services/folder_unlock_store";
import {
  is_level2_admitted,
  request_level2_admission,
  reset_level2_state,
} from "@/services/crypto/vault_level2";
import {
  reset_attachment_meta_rekey_cache,
  start_envelope_v2_rekey,
  stop_envelope_v2_rekey,
  type EnvelopeV2RekeyDeps,
} from "@/services/crypto/envelope_v2_rekey";
import {
  list_encrypted_mail_items,
  list_locked_folder_page,
  update_mail_item,
} from "@/services/api/mail";
import {
  batch_attachment_meta,
  update_attachment_meta,
} from "@/services/api/attachments";
import { load_storage_write_key_bytes } from "@/services/crypto/storage_write_key";
import {
  auto_rekey_if_needed,
  reset_rekey_flag,
} from "@/services/crypto/auto_rekey";
import { adopt_master_key_if_needed } from "@/services/crypto/mk_adoption";
import {
  prepare_storage_key_gate,
  run_storage_key_maintenance,
} from "@/services/crypto/storage_rotation/background";
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

      if (ok && (verified === null || verified >= PQ_MIN_THRESHOLD)) {
        return;
      }

      await new Promise((r) => setTimeout(r, 500));
    }
  } catch {
    /* best-effort */
  }
}

import {
  emit_aliases_changed,
  emit_contacts_changed,
} from "@/hooks/mail_events";
import { compute_password_strength_tier } from "@/services/password_strength_score";
import { backfill_password_strength_tier } from "@/services/api/account";
import { ignore_error } from "@/lib/ignore_error";
import { is_draft_busy } from "@/services/draft_activity";

let vault_decryption_lock: Promise<void> | null = null;

const envelope_v2_rekey_deps: EnvelopeV2RekeyDeps = {
  list: list_encrypted_mail_items,
  update: update_mail_item,
  get_vault: get_vault_from_memory,
  get_passphrase_bytes,
  storage: () => {
    try {
      return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      return null;
    }
  },
  now: () => Date.now(),
  is_draft_busy: (item_id) => is_draft_busy(item_id),
  batch_meta: (mail_ids) => batch_attachment_meta(mail_ids),
  update_meta: (attachment_id, data) =>
    update_attachment_meta(attachment_id, data),
};

const locked_folder_rekey_deps: LockedFolderRekeyDeps = {
  update: envelope_v2_rekey_deps.update,
  get_vault: envelope_v2_rekey_deps.get_vault,
  get_passphrase_bytes: envelope_v2_rekey_deps.get_passphrase_bytes,
  is_draft_busy: envelope_v2_rekey_deps.is_draft_busy,
  storage: envelope_v2_rekey_deps.storage,
  now: envelope_v2_rekey_deps.now,
  batch_meta: envelope_v2_rekey_deps.batch_meta,
  update_meta: envelope_v2_rekey_deps.update_meta,
  list_page: (folder_token, offset, limit, trashed) =>
    list_locked_folder_page(folder_token, offset, limit, trashed),
  is_unlocked: (folder_token) => get_unlock_token(folder_token) !== null,
  get_user_id: () => get_last_vault_owner_id(),
};

function vault_work_factor_deps(user_id: string): VaultWorkFactorDeps {
  return {
    fetch_vault: () =>
      api_client.get<CurrentVaultView>(VAULT_PATH, {
        skip_cache: true,
        skip_dedup: true,
      }),
    put_vault: (body) => api_client.put<unknown>(VAULT_PATH, body),
    get_passphrase: () => get_passphrase_from_memory(),
    decrypt: (encrypted_vault, vault_nonce, passphrase, iterations) =>
      decrypt_vault(encrypted_vault, vault_nonce, passphrase, iterations),
    encrypt: (vault, passphrase, iterations) =>
      encrypt_vault(vault, passphrase, iterations),
    key_fingerprints: (vault) => collect_vault_key_fingerprints(vault),
    on_written: async (vault, sealed, passphrase) => {
      persist_local_vault(user_id, sealed.encrypted_vault, sealed.vault_nonce);
      await store_vault_in_memory(vault, passphrase, user_id);
    },
    storage: () => {
      try {
        return typeof localStorage === "undefined" ? null : localStorage;
      } catch {
        return null;
      }
    },
  };
}

on_locked_folder_listing((folder_token) => {
  void trigger_locked_folder_rekey(folder_token, locked_folder_rekey_deps);
});

on_folder_unlock_change((folder_token) => {
  reset_locked_folder_rekey(folder_token);
});

async function current_data_kek_tag(): Promise<string | null> {
  const kek = envelope_v2_write_key(get_vault_from_memory());

  if (!kek) return null;

  try {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", kek));

    return Array.from(digest, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } finally {
    wipe_envelope_v2_keys([kek]);
  }
}

const level2_storage = create_level2_storage({
  request_admission: () => request_level2_admission(api_client),
  reset_admission_state: reset_level2_state,
  is_admitted: is_level2_admitted,
  start_rekey: (user_id) =>
    start_envelope_v2_rekey(user_id, envelope_v2_rekey_deps),
  stop_rekey: stop_envelope_v2_rekey,
  run_work_factor: (user_id) =>
    run_vault_work_factor_once(user_id, vault_work_factor_deps(user_id)),
  reset_locked_folder_rekey: () => reset_locked_folder_rekey(),
  reset_attachment_meta_cache: reset_attachment_meta_rekey_cache,
  vault_epoch: get_vault_account_epoch,
  has_vault_for: has_vault_in_memory_for,
  data_kek_tag: current_data_kek_tag,
  on_error: (scope, caught) =>
    ignore_error(`contexts/auth/vault_decryption:${scope}`, caught),
});

on_vault_cleared((event) => level2_storage.handle_cleared(event));

on_vault_stored((event) => {
  level2_storage
    .handle_stored(event)
    .catch((caught) =>
      ignore_error("contexts/auth/vault_decryption:level2_stored", caught),
    );
});

export function ensure_level2_storage(
  owner_user_id?: string | null,
): void {
  level2_storage.ensure(owner_user_id ?? get_last_vault_owner_id());
}

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
    prepare_storage_key_gate();
    await store_vault_in_memory(vault, passphrase, owner_user_id);
    ensure_level2_storage(owner_user_id);

    backfill_password_strength_tier(
      compute_password_strength_tier(passphrase),
    ).catch((caught) =>
      ignore_error("contexts/auth/vault_decryption:reusable", caught),
    );

    try {
      await adopt_master_key_if_needed(vault, passphrase);
    } catch (caught) {
      ignore_error("contexts/auth/vault_decryption:reusable", caught);
    }

    run_storage_key_maintenance(passphrase)
      .then(async (maintenance) => {
        if (maintenance === "reseal_started") return;

        const did_rekey = await auto_rekey_if_needed();

        if (did_rekey) {
          emit_aliases_changed();
          emit_contacts_changed();
        }
      })
      .catch((caught) =>
        ignore_error("contexts/auth/vault_decryption:reusable", caught),
      );

    check_and_run_recovery_reencryption(vault, passphrase).catch((caught) =>
      ignore_error("contexts/auth/vault_decryption:reusable", caught),
    );

    ensure_pgp_key_published().catch((caught) =>
      ignore_error("contexts/auth/vault_decryption:reusable", caught),
    );

    ensure_ratchet_keys()
      .then(async () => {
        await ensure_pq_prekeys_available();

        const master_key = await load_storage_write_key_bytes();

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
        sync_escrow_to_cache().catch((caught) =>
          ignore_error("contexts/auth/vault_decryption:reusable", caught),
        );
      })
      .catch((caught) =>
        ignore_error("contexts/auth/vault_decryption:reusable", caught),
      );

    return vault;
  } finally {
    resolve_lock?.();
    vault_decryption_lock = null;
  }
}
