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
import type { EncryptedVault } from "../key_manager";

import type { ServerVaultSnapshot } from "../vault_cas_write";

import { decrypt_vault } from "../key_manager";
import {
  get_vault_from_memory,
  store_vault_in_memory,
} from "../memory_key_store";
import {
  is_vault_write_lock_timeout,
  with_vault_write_lock_bounded,
} from "../vault_write_lock";
import {
  fetch_latest_vault,
  fetch_server_vault_snapshot,
  MAX_VAULT_CONFLICT_RETRIES,
  persist_local_vault,
  write_vault_merged,
} from "../vault_cas_write";
import { zero_uint8_array } from "../secure_memory";
import { derive_server_known_raws } from "../legacy_ios_envelope";
import {
  get_session_server_known_ids,
  note_server_known_raws,
  strip_server_known_keks,
} from "../server_known_keys";
import { is_rolled_back_vault } from "../vault_generation";
import { mark_keks_for_retirement } from "../retired_storage_keks";
import {
  collect_prior_storage_keys,
  derive_password_storage_keys,
  install_random_storage_key,
  is_weak_storage_vault,
} from "../storage_write_key";

import { get_current_account } from "@/services/account_manager";

export const VAULT_LOCK_WAIT_MS = 10_000;
export const STORAGE_STEP_UNSUPPORTED = "unsupported";
export const STORAGE_STEP_UNREADABLE = "vault_unreadable";

export {
  fetch_server_vault_snapshot,
  MAX_VAULT_CONFLICT_RETRIES,
  VAULT_PATH,
} from "../vault_cas_write";
export type { ServerVaultSnapshot } from "../vault_cas_write";

export type StorageVaultOutcome =
  | { status: "rotated"; vault: EncryptedVault }
  | { status: "adopted"; vault: EncryptedVault }
  | { status: "current"; vault: EncryptedVault }
  | { status: "skipped"; reason: string };

export type StorageRekeyFinish = "done" | "superseded" | "failed";

type CasWrite =
  | { status: "written"; vault: EncryptedVault }
  | { status: "conflict" }
  | { status: "failed" };

async function current_user_id(): Promise<string | null> {
  const account = await get_current_account();

  return account?.user?.id ?? null;
}

async function decrypt_snapshot(
  snapshot: ServerVaultSnapshot,
  passphrase: string,
  user_id: string,
): Promise<EncryptedVault | null> {
  try {
    const vault = await decrypt_vault(
      snapshot.encrypted_vault,
      snapshot.vault_nonce,
      passphrase,
    );

    return is_rolled_back_vault(user_id, vault) ? null : vault;
  } catch {
    return null;
  }
}

function needs_cleanup(vault: EncryptedVault): boolean {
  if (strip_server_known_keks(vault).removed.length > 0) return true;

  const persisted = new Set(vault.server_known_kek_ids ?? []);

  return get_session_server_known_ids().some((id) => !persisted.has(id));
}

async function note_server_known_storage_keys(passphrase: string) {
  const raws = await derive_server_known_raws(passphrase);

  try {
    note_server_known_raws(raws);
  } finally {
    raws.forEach((raw) => zero_uint8_array(raw));
  }
}

async function adopt_server_vault(
  vault: EncryptedVault,
  snapshot: ServerVaultSnapshot,
  passphrase: string,
  user_id: string,
): Promise<void> {
  const memory = get_vault_from_memory();

  if (
    memory &&
    memory.data_kek === vault.data_kek &&
    memory.data_kek_random === vault.data_kek_random &&
    memory.storage_rekey?.state === vault.storage_rekey?.state
  ) {
    return;
  }

  persist_local_vault(user_id, snapshot.encrypted_vault, snapshot.vault_nonce);
  await store_vault_in_memory(vault, passphrase, user_id);
}

async function write_vault_with_cas(
  next: EncryptedVault,
  base: EncryptedVault,
  snapshot: ServerVaultSnapshot,
  passphrase: string,
  user_id: string,
): Promise<CasWrite> {
  const result = await write_vault_merged({
    next,
    base,
    snapshot,
    passphrase,
    user_id,
    owns_storage_key: true,
    max_conflict_retries: 0,
  });

  if (result.status === "written") {
    return { status: "written", vault: result.vault };
  }
  if (result.status === "failed") return { status: "failed" };

  return { status: "conflict" };
}

async function rotate_locked(passphrase: string): Promise<StorageVaultOutcome> {
  const user_id = await current_user_id();

  if (!user_id) return { status: "skipped", reason: "no_account" };

  await note_server_known_storage_keys(passphrase);

  for (let attempt = 0; attempt <= MAX_VAULT_CONFLICT_RETRIES; attempt++) {
    const fetched = await fetch_latest_vault();

    if (fetched.kind !== "ok") {
      return { status: "skipped", reason: "vault_unavailable" };
    }

    if (!fetched.snapshot.vault_sha256) {
      return { status: "skipped", reason: STORAGE_STEP_UNSUPPORTED };
    }

    const snapshot: ServerVaultSnapshot = {
      ...fetched.snapshot,
      vault_sha256: fetched.snapshot.vault_sha256,
    };
    const vault = await decrypt_snapshot(snapshot, passphrase, user_id);

    if (!vault) return { status: "skipped", reason: STORAGE_STEP_UNREADABLE };

    const weak = await is_weak_storage_vault(vault, passphrase);

    if (!weak && !needs_cleanup(vault)) {
      await adopt_server_vault(vault, snapshot, passphrase, user_id);

      return { status: attempt > 0 ? "adopted" : "current", vault };
    }

    const next: EncryptedVault = { ...vault };

    if (weak) {
      const prior_keys = await collect_prior_storage_keys(vault, passphrase);
      const password_keys = await derive_password_storage_keys(
        vault,
        passphrase,
      );

      try {
        install_random_storage_key(next, prior_keys);
        next.pending_retire_kek_ids = mark_keks_for_retirement(
          next.pending_retire_kek_ids,
          password_keys,
          next.data_kek,
        );
      } finally {
        prior_keys.forEach((raw) => zero_uint8_array(raw));
        password_keys.forEach((raw) => zero_uint8_array(raw));
      }
    }

    const outcome = await write_vault_with_cas(
      next,
      vault,
      snapshot,
      passphrase,
      user_id,
    );

    if (outcome.status === "written") {
      return { status: weak ? "rotated" : "adopted", vault: outcome.vault };
    }
    if (outcome.status === "failed") {
      return { status: "skipped", reason: "write_failed" };
    }
  }

  return { status: "skipped", reason: "conflict_retries_exhausted" };
}

export function ensure_random_storage_key(
  passphrase: string,
): Promise<StorageVaultOutcome> {
  return with_vault_write_lock_bounded(
    () => rotate_locked(passphrase),
    VAULT_LOCK_WAIT_MS,
  ).catch((error: unknown): StorageVaultOutcome => {
    if (is_vault_write_lock_timeout(error)) {
      return { status: "skipped", reason: "vault_lock_timeout" };
    }
    throw error;
  });
}

async function finish_locked(
  passphrase: string,
  expected_data_kek: string,
): Promise<StorageRekeyFinish> {
  const user_id = await current_user_id();

  if (!user_id) return "failed";

  for (let attempt = 0; attempt <= MAX_VAULT_CONFLICT_RETRIES; attempt++) {
    const snapshot = await fetch_server_vault_snapshot();

    if (!snapshot) return "failed";

    const vault = await decrypt_snapshot(snapshot, passphrase, user_id);

    if (!vault) return "failed";

    if (vault.data_kek !== expected_data_kek) {
      await adopt_server_vault(vault, snapshot, passphrase, user_id);

      return "superseded";
    }

    if (vault.storage_rekey?.state !== "pending") {
      await adopt_server_vault(vault, snapshot, passphrase, user_id);

      return "done";
    }

    const next: EncryptedVault = {
      ...vault,
      storage_rekey: {
        state: "done",
        started_at: vault.storage_rekey.started_at,
        done_at: new Date().toISOString(),
      },
    };
    const outcome = await write_vault_with_cas(
      next,
      vault,
      snapshot,
      passphrase,
      user_id,
    );

    if (outcome.status === "written") return "done";
    if (outcome.status === "failed") return "failed";
  }

  return "failed";
}

export async function server_storage_key_matches(
  passphrase: string,
  expected_data_kek: string,
): Promise<boolean> {
  const snapshot = await fetch_server_vault_snapshot();
  const user_id = await current_user_id();

  if (!snapshot || !user_id) return false;

  const vault = await decrypt_snapshot(snapshot, passphrase, user_id);

  return vault?.data_kek === expected_data_kek && vault.data_kek_random === true;
}

export function mark_storage_rekey_done(
  passphrase: string,
  expected_data_kek: string,
): Promise<StorageRekeyFinish> {
  return with_vault_write_lock_bounded(
    () => finish_locked(passphrase, expected_data_kek),
    VAULT_LOCK_WAIT_MS,
  ).catch((error: unknown): StorageRekeyFinish => {
    if (is_vault_write_lock_timeout(error)) return "failed";
    throw error;
  });
}
