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
import { api_client } from "@/services/api/client";
import { generate_and_upload_prekeys } from "@/services/crypto/prekey_service";
import {
  list_pq_secret_ids,
  fetch_server_pq_key_ids,
  load_pq_secret,
} from "@/services/crypto/pq_prekey_store";
import { has_vault_in_memory } from "@/services/crypto/memory_key_store";
import {
  read_reconciler_limits,
  write_reconciler_limits,
  type ReconcilerLimits,
} from "@/services/crypto/pq_reconciler_limits";

const RECONCILER_DISABLED_FLAG = "astermail_pq_reconciler_disabled";
const RECONCILER_RAN_AT_PREFIX = "astermail_pq_reconciler_at_";
const RECONCILER_LOCK_FLAG = "astermail_pq_reconciler_lock";
const SELF_HEAL_AT_PREFIX = "astermail_pq_self_heal_at_";
const SELF_HEAL_KEYS_PREFIX = "astermail_pq_self_heal_keys_";
const LOCK_TIMEOUT_MS = 30000;
const RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SELF_HEAL_INTERVAL_MS = 10 * 60 * 1000;
const SELF_HEAL_KEY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SELF_HEAL_KEYS_MAX = 256;
const RECONCILE_PROBE_COUNT = 5;

let self_heal_in_progress = false;

function is_dev(): boolean {
  try {
    return Boolean(
      (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV,
    );
  } catch {
    return false;
  }
}

function is_enabled(): boolean {
  try {
    return localStorage.getItem(RECONCILER_DISABLED_FLAG) !== "1";
  } catch {
    return false;
  }
}

async function current_uid(): Promise<string | null> {
  try {
    const { get_current_account_id } =
      await import("@/services/account_manager");

    return await get_current_account_id();
  } catch {
    return null;
  }
}

function drop_legacy_limits(uid: string | null): void {
  try {
    for (const prefix of [
      RECONCILER_RAN_AT_PREFIX,
      SELF_HEAL_AT_PREFIX,
      SELF_HEAL_KEYS_PREFIX,
    ]) {
      localStorage.removeItem(prefix + (uid ?? ""));
    }
  } catch {
    return;
  }
}

function within(ts: number, interval_ms: number): boolean {
  const age = Date.now() - ts;

  return ts > 0 && age >= -interval_ms && age < interval_ms;
}

async function load_limits(
  uid: string | null,
): Promise<ReconcilerLimits | null> {
  drop_legacy_limits(uid);

  try {
    return await read_reconciler_limits(uid);
  } catch {
    return null;
  }
}

async function save_limits(
  uid: string | null,
  limits: ReconcilerLimits,
): Promise<void> {
  try {
    await write_reconciler_limits(uid, limits);
  } catch {
    return;
  }
}

async function mark_ran(uid: string | null): Promise<void> {
  const limits = await load_limits(uid);

  if (!limits) return;
  await save_limits(uid, { ...limits, ran_at: Date.now() });
}

function try_acquire_lock(): boolean {
  try {
    const now = Date.now();
    const existing = localStorage.getItem(RECONCILER_LOCK_FLAG);

    if (existing) {
      const ts = parseInt(existing, 10);

      if (!Number.isNaN(ts) && now - ts < LOCK_TIMEOUT_MS) {
        return false;
      }
    }

    localStorage.setItem(RECONCILER_LOCK_FLAG, String(now));

    return true;
  } catch {
    return false;
  }
}

function release_lock(): void {
  try {
    localStorage.removeItem(RECONCILER_LOCK_FLAG);
  } catch {
    /* best-effort */
  }
}

async function fetch_server_pq_count(): Promise<number | null> {
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

async function read_local_pq_secret_ids(): Promise<number[]> {
  try {
    return await list_pq_secret_ids();
  } catch {
    return [];
  }
}

export function select_unknown_server_ids(
  server_ids: Set<number>,
  local_ids: number[],
): number[] {
  const local = new Set(local_ids);

  return [...server_ids].filter((key_id) => !local.has(key_id));
}

async function server_secrets_readable(
  unknown_ids: number[],
): Promise<boolean> {
  try {
    for (const key_id of unknown_ids.slice(0, RECONCILE_PROBE_COUNT)) {
      const secret = await load_pq_secret(key_id);

      if (!secret) return false;
      secret.fill(0);
    }

    return true;
  } catch {
    return false;
  }
}

async function rotate_pq_pool(): Promise<boolean> {
  return generate_and_upload_prekeys(true);
}

export async function reconcile_pq_secrets_with_server(): Promise<void> {
  if (!is_enabled()) return;
  if (!has_vault_in_memory()) return;

  const uid = await current_uid();
  const limits = await load_limits(uid);

  if (!limits || within(limits.ran_at, RECONCILE_INTERVAL_MS)) return;
  if (!try_acquire_lock()) return;

  try {
    const server_count = await fetch_server_pq_count();

    if (server_count === null) return;

    const local_ids = await read_local_pq_secret_ids();
    const local_count = local_ids.length;

    if (server_count <= local_count) {
      await mark_ran(uid);

      return;
    }

    const server_ids = await fetch_server_pq_key_ids();

    if (server_ids) {
      const unknown_ids = select_unknown_server_ids(server_ids, local_ids);

      if (
        unknown_ids.length === 0 ||
        (await server_secrets_readable(unknown_ids))
      ) {
        await mark_ran(uid);

        if (is_dev()) {
          console.info(
            "[pq_reconciler] server secrets readable, no rotation: unknown=%d",
            unknown_ids.length,
          );
        }

        return;
      }
    }

    if (is_dev()) {
      console.info(
        "[pq_reconciler] start: server=%d local=%d delta=%d",
        server_count,
        local_count,
        server_count - local_count,
      );
    }

    const ok = await rotate_pq_pool();

    if (!ok) {
      if (is_dev()) {
        console.info("[pq_reconciler] regeneration failed");
      }

      return;
    }

    await mark_ran(uid);

    if (is_dev()) {
      console.info("[pq_reconciler] complete: fresh pq prekeys uploaded");
    }
  } catch (error) {
    if (is_dev()) {
      console.info("[pq_reconciler] aborted", error);
    }
  } finally {
    release_lock();
  }
}

function fresh_self_heal_keys(
  limits: ReconcilerLimits,
): Record<string, number> {
  const fresh: Record<string, number> = {};

  for (const [key_id, ts] of Object.entries(limits.self_heal_keys)) {
    const age = Date.now() - ts;

    if (age >= 0 && age < SELF_HEAL_KEY_TTL_MS) fresh[key_id] = ts;
  }

  return fresh;
}

async function remember_self_heal_key(
  uid: string | null,
  key_id: number,
): Promise<void> {
  const limits = await load_limits(uid);

  if (!limits) return;

  const entries = Object.entries(fresh_self_heal_keys(limits));

  entries.push([String(key_id), Date.now()]);
  entries.sort((a, b) => a[1] - b[1]);

  await save_limits(uid, {
    ...limits,
    self_heal_keys: Object.fromEntries(entries.slice(-SELF_HEAL_KEYS_MAX)),
  });
}

export async function handle_missing_pq_secret(key_id?: number): Promise<void> {
  if (!is_enabled()) return;
  if (self_heal_in_progress) return;
  if (!has_vault_in_memory()) return;

  self_heal_in_progress = true;

  try {
    const uid = await current_uid();

    const limits = await load_limits(uid);

    if (!limits) return;
    if (
      key_id !== undefined &&
      fresh_self_heal_keys(limits)[String(key_id)] !== undefined
    ) {
      return;
    }
    if (within(limits.self_heal_at, SELF_HEAL_INTERVAL_MS)) return;

    await save_limits(uid, { ...limits, self_heal_at: Date.now() });

    const ok = await rotate_pq_pool();

    if (ok && key_id !== undefined) await remember_self_heal_key(uid, key_id);

    if (is_dev()) {
      console.info("[pq_reconciler] self-heal after missing secret: %s", ok);
    }
  } catch (error) {
    if (is_dev()) {
      console.info("[pq_reconciler] self-heal failed", error);
    }
  } finally {
    self_heal_in_progress = false;
  }
}
