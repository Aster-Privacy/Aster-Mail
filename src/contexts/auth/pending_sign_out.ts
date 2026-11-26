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
import { purge_all_local_data } from "./purge_local_data";
import { with_timeout } from "./auth_helpers";
import { clear_signed_out_account_caches } from "./signed_out_account_caches";
import {
  clear_stored_encrypted_vault,
  clear_session_passphrase,
} from "./session_passphrase";

import { api_client } from "@/services/api/client";
import { clear_vault_from_memory } from "@/services/crypto/memory_key_store";
import { delete_user_device_snapshots } from "@/services/crypto/device_recovery_store";
import { delete_category_index_for_account } from "@/services/category_index";
import {
  clear_app_lock_config,
  clear_session_unlock,
} from "@/services/app_lock_store";
import {
  stop_session_timeout,
  clear_session_timeout_data,
} from "@/services/session_timeout_service";
import {
  remove_account as storage_remove_account,
  switch_account as storage_switch_account,
} from "@/services/account_manager";
import {
  safe_local_get,
  safe_local_remove,
  safe_local_set,
} from "@/lib/safe_storage";

export const PENDING_SIGN_OUT_KEY = "aster_pending_sign_out";

export type PendingSignOut =
  | { kind: "all" }
  | { kind: "account"; account_id: string; survivor_id: string };

export function mark_sign_out_pending(pending: PendingSignOut): void {
  safe_local_set(PENDING_SIGN_OUT_KEY, JSON.stringify(pending));
}

export function clear_pending_sign_out(): void {
  safe_local_remove(PENDING_SIGN_OUT_KEY);
}

function is_id(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function read_pending_sign_out(): PendingSignOut | null {
  const raw = safe_local_get(PENDING_SIGN_OUT_KEY);

  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null) return { kind: "all" };
    const record = parsed as Record<string, unknown>;

    if (
      record.kind === "account" &&
      is_id(record.account_id) &&
      is_id(record.survivor_id)
    ) {
      return {
        kind: "account",
        account_id: record.account_id,
        survivor_id: record.survivor_id,
      };
    }
  } catch {
    return { kind: "all" };
  }

  return { kind: "all" };
}

export async function wipe_signed_out_account(
  account_id: string,
  survivor_id: string,
): Promise<void> {
  stop_session_timeout();
  clear_vault_from_memory();
  await with_timeout(clear_signed_out_account_caches(account_id), 3000);
  await with_timeout(delete_user_device_snapshots(account_id), 2000);
  await with_timeout(delete_category_index_for_account(account_id), 2000);
  clear_stored_encrypted_vault(account_id);
  await with_timeout(clear_session_passphrase(account_id), 2000);
  clear_session_timeout_data(account_id);
  clear_app_lock_config(account_id);
  clear_session_unlock(account_id);
  api_client.clear_dev_token();

  await with_timeout(api_client.clear_session_cookies(), 2000);

  await with_timeout(storage_remove_account(account_id), 2000);
  await with_timeout(storage_switch_account(survivor_id), 2000);
  api_client.clear_in_memory_token();
}

export async function run_pending_sign_out(
  pending: PendingSignOut,
): Promise<void> {
  try {
    if (pending.kind === "account") {
      await wipe_signed_out_account(pending.account_id, pending.survivor_id);
    } else {
      await purge_all_local_data();
    }
  } finally {
    clear_pending_sign_out();
  }
}

export async function finish_pending_sign_out(): Promise<boolean> {
  const pending = read_pending_sign_out();

  if (!pending) return false;
  await run_pending_sign_out(pending);

  return true;
}
