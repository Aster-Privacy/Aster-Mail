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
import type { StorageVaultOutcome } from "./vault_step";

import {
  legacy_sweep_done,
  legacy_sweep_marker,
  legacy_sweep_progress_store,
  mark_legacy_sweep_done,
  run_legacy_key_sweep,
} from "./legacy_sweep";
import { local_progress_store } from "./reseal_io";
import { needs_storage_reseal, run_storage_reseal } from "./run";
import {
  ensure_random_storage_key,
  mark_storage_rekey_done,
  server_storage_key_matches,
  STORAGE_STEP_UNREADABLE,
  STORAGE_STEP_UNSUPPORTED,
} from "./vault_step";
import { get_vault_from_memory } from "../memory_key_store";
import { vault_passphrase } from "../vault_cas_write";
import { derive_password_storage_keys } from "../storage_write_key";
import { zero_uint8_array } from "../secure_memory";
import {
  is_storage_key_held,
  mark_storage_key_verified,
  set_storage_key_runner,
  wake_storage_key_waiters,
} from "../storage_key_gate";

import { get_current_account } from "@/services/account_manager";
import { api_client } from "@/services/api/client";
import { ignore_error } from "@/lib/ignore_error";

export const RESEAL_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];
export const VAULT_STEP_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

let step_in_flight: Promise<StorageVaultOutcome> | null = null;
let step_timer: ReturnType<typeof setTimeout> | null = null;
let step_attempt = 0;
let online_listener: (() => void) | null = null;

function clear_step_timer(): void {
  if (step_timer) clearTimeout(step_timer);
  step_timer = null;
}

function watch_online(): void {
  if (online_listener || typeof window === "undefined") return;
  online_listener = () => {
    clear_step_timer();
    kick_vault_step();
  };
  window.addEventListener("online", online_listener);
}

function unwatch_online(): void {
  if (!online_listener || typeof window === "undefined") return;
  window.removeEventListener("online", online_listener);
  online_listener = null;
}

function schedule_vault_step(): void {
  if (step_timer) return;

  const delay =
    VAULT_STEP_RETRY_DELAYS_MS[
      Math.min(step_attempt, VAULT_STEP_RETRY_DELAYS_MS.length - 1)
    ];

  step_attempt += 1;
  watch_online();
  step_timer = setTimeout(() => {
    step_timer = null;
    kick_vault_step();
  }, delay);
}

function kick_vault_step(): void {
  if (step_in_flight || step_timer) return;

  const passphrase = vault_passphrase();

  if (!passphrase) return;

  void run_vault_step(passphrase);
}

const STEP_RELEASES_GATE = new Set([
  STORAGE_STEP_UNSUPPORTED,
  STORAGE_STEP_UNREADABLE,
]);

export function run_vault_step(
  passphrase: string,
): Promise<StorageVaultOutcome> {
  if (step_in_flight) return step_in_flight;

  clear_step_timer();
  set_storage_key_runner(kick_vault_step);

  step_in_flight = ensure_random_storage_key(passphrase)
    .catch((caught): StorageVaultOutcome => {
      ignore_error("services/crypto/storage_rotation:vault_step", caught);

      return { status: "skipped", reason: "error" };
    })
    .then((outcome) => {
      step_in_flight = null;

      if (outcome.status !== "skipped") {
        mark_storage_key_verified(outcome.vault.data_kek ?? null);
      } else if (STEP_RELEASES_GATE.has(outcome.reason)) {
        mark_storage_key_verified(get_vault_from_memory()?.data_kek ?? null);
      }

      if (is_storage_key_held(get_vault_from_memory())) {
        schedule_vault_step();
      } else {
        step_attempt = 0;
        unwatch_online();
      }
      wake_storage_key_waiters();

      return outcome;
    });

  return step_in_flight;
}

export function prepare_storage_key_gate(): void {
  set_storage_key_runner(kick_vault_step);
}

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
      if (result?.status === "done") void start_legacy_key_sweep(passphrase);

      return result;
    });

  return in_flight;
}

export type StorageMaintenance = "reseal_started" | "not_needed";

export async function run_storage_key_maintenance(
  passphrase: string,
): Promise<StorageMaintenance> {
  const outcome = await run_vault_step(passphrase);

  if (outcome.status === "skipped") return "not_needed";
  if (!needs_storage_reseal(get_vault_from_memory())) {
    void start_legacy_key_sweep(passphrase);

    return "not_needed";
  }

  void start_storage_reseal(passphrase);

  return "reseal_started";
}

let sweep_in_flight: Promise<ResealRunResult | null> | null = null;

async function sweep_once(passphrase: string): Promise<ResealRunResult | null> {
  const vault = get_vault_from_memory();
  const account = await get_current_account();
  const user_id = account?.user?.id;
  const data_kek = vault?.data_kek;

  if (!vault || !user_id || !data_kek || vault.data_kek_random !== true) {
    return null;
  }
  if (needs_storage_reseal(vault)) return null;

  const marker = await legacy_sweep_marker(vault);

  if (legacy_sweep_done(user_id, marker)) return null;

  const password_keys = await derive_password_storage_keys(vault, passphrase);

  try {
    const result = await run_legacy_key_sweep({
      vault,
      api: reseal_api,
      store: legacy_sweep_progress_store(user_id, marker),
      still_current: () => server_storage_key_matches(passphrase, data_kek),
      is_cancelled: () => get_vault_from_memory()?.data_kek !== data_kek,
      key_options: { extra_old_raws: password_keys },
    });

    if (result.status === "done" || result.status === "not_needed") {
      mark_legacy_sweep_done(user_id, marker);
    }

    return result;
  } finally {
    password_keys.forEach(zero_uint8_array);
  }
}

export function start_legacy_key_sweep(
  passphrase: string,
): Promise<ResealRunResult | null> {
  if (sweep_in_flight) return sweep_in_flight;

  sweep_in_flight = sweep_once(passphrase)
    .catch((caught) => {
      ignore_error("services/crypto/storage_rotation:legacy_sweep", caught);

      return null;
    })
    .finally(() => {
      sweep_in_flight = null;
    });

  return sweep_in_flight;
}

export function cancel_storage_reseal_retry(): void {
  clear_retry();
}
