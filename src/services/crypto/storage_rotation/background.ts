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
import type { ResealApi } from "./reseal_io";
import type { ResealRunResult } from "./run";

import { local_progress_store } from "./reseal_io";
import { needs_storage_reseal, run_storage_reseal } from "./run";
import {
  ensure_random_storage_key,
  mark_storage_rekey_done,
  server_storage_key_matches,
} from "./vault_step";
import { get_vault_from_memory } from "../memory_key_store";

import { get_current_account } from "@/services/account_manager";
import { api_client } from "@/services/api/client";
import { ignore_error } from "@/lib/ignore_error";

export const RESEAL_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];

const reseal_api: ResealApi = {
  get: (path) => api_client.get(path, { skip_cache: true, skip_dedup: true }),
  post: (path, body) => api_client.post(path, body),
  put: (path, body) => api_client.put(path, body),
};

let in_flight: Promise<ResealRunResult | null> | null = null;
let retry_timer: ReturnType<typeof setTimeout> | null = null;

function clear_retry(): void {
  if (retry_timer) clearTimeout(retry_timer);
  retry_timer = null;
}

async function run_once(passphrase: string): Promise<ResealRunResult | null> {
  const vault = get_vault_from_memory();
  const account = await get_current_account();
  const user_id = account?.user?.id;

  if (!vault || !user_id || !needs_storage_reseal(vault)) return null;

  const data_kek = vault.data_kek;

  if (!data_kek) return null;

  return run_storage_reseal({
    vault,
    api: reseal_api,
    store: local_progress_store(user_id),
    finish: (expected) => mark_storage_rekey_done(passphrase, expected),
    still_current: () => server_storage_key_matches(passphrase, data_kek),
    is_cancelled: () => get_vault_from_memory()?.data_kek !== data_kek,
  });
}

function schedule_retry(passphrase: string, attempt: number): void {
  if (attempt >= RESEAL_RETRY_DELAYS_MS.length) return;
  clear_retry();
  retry_timer = setTimeout(() => {
    retry_timer = null;
    void start_storage_reseal(passphrase, attempt + 1);
  }, RESEAL_RETRY_DELAYS_MS[attempt]);
}

export function start_storage_reseal(
  passphrase: string,
  attempt = 0,
): Promise<ResealRunResult | null> {
  if (in_flight) return in_flight;

  const data_kek = get_vault_from_memory()?.data_kek;

  in_flight = run_once(passphrase)
    .catch((caught) => {
      ignore_error("services/crypto/storage_rotation:start", caught);

      return null;
    })
    .then((result) => {
      in_flight = null;
      if (
        result?.status === "interrupted" &&
        get_vault_from_memory()?.data_kek === data_kek
      ) {
        schedule_retry(passphrase, attempt);
      }

      return result;
    });

  return in_flight;
}

export type StorageMaintenance = "reseal_started" | "not_needed";

export async function run_storage_key_maintenance(
  passphrase: string,
): Promise<StorageMaintenance> {
  const outcome = await ensure_random_storage_key(passphrase);

  if (outcome.status === "skipped") return "not_needed";
  if (!needs_storage_reseal(get_vault_from_memory())) return "not_needed";

  void start_storage_reseal(passphrase);

  return "reseal_started";
}

export function cancel_storage_reseal_retry(): void {
  clear_retry();
}
