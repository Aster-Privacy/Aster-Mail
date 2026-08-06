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
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

import { api_client } from "../api/client";
import {
  save_pq_secrets_bulk,
  delete_pq_secret,
  is_pq_upload_rate_limited,
  list_pq_secret_ids,
} from "./pq_prekey_store";

const PQ_PREKEY_BATCH_SIZE = 20;
const REPLENISHMENT_DEBOUNCE_MS = 5000;
const PENDING_ROLLBACK_MAX = 200;
const ROLLBACK_DRAIN_BATCH = 20;
const ROLLBACK_FAILURE_STREAK = 3;
const ROLLBACK_BACKOFF_MS = 300000;

let last_replenishment_time = 0;
let replenishment_in_progress = false;
let rollback_retry_after = 0;

interface PrekeyData {
  key_id: number;
  public_key: string;
}

interface UploadPrekeysRequest {
  one_time_prekeys: PrekeyData[];
  pq_prekeys?: PrekeyData[];
}

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function random_key_id(): number {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const view = new DataView(bytes.buffer);
  const value = view.getUint32(0, false) & 0x7fffffff;

  return value === 0 ? 1 : value;
}

function allocate_key_ids(count: number, taken: Set<number>): number[] {
  const ids: number[] = [];

  while (ids.length < count) {
    const id = random_key_id();

    if (taken.has(id)) {
      continue;
    }

    taken.add(id);
    ids.push(id);
  }

  return ids;
}

async function load_taken_key_ids(): Promise<Set<number>> {
  try {
    return new Set(await list_pq_secret_ids());
  } catch {
    return new Set();
  }
}

async function pending_rollback_storage_key(): Promise<string | null> {
  try {
    const { get_current_account_id } = await import(
      "@/services/account_manager"
    );
    const uid = await get_current_account_id();

    return uid ? `aster_pq_pending_rollback:${uid}` : null;
  } catch {
    return null;
  }
}

async function queue_pending_rollback(ids: number[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const key = await pending_rollback_storage_key();
  if (!key) {
    return;
  }

  try {
    const existing: number[] = JSON.parse(localStorage.getItem(key) || "[]");
    const merged = Array.from(new Set([...existing, ...ids]));

    localStorage.setItem(
      key,
      JSON.stringify(merged.slice(-PENDING_ROLLBACK_MAX)),
    );
  } catch {
    return;
  }
}

async function delete_secrets_until_failing(ids: number[]): Promise<number[]> {
  const failed: number[] = [];
  let failure_streak = 0;

  for (let i = 0; i < ids.length; i++) {
    const ok = await delete_pq_secret(ids[i]);

    if (ok) {
      failure_streak = 0;
      continue;
    }

    failed.push(ids[i]);
    failure_streak += 1;

    if (failure_streak >= ROLLBACK_FAILURE_STREAK) {
      rollback_retry_after = Date.now() + ROLLBACK_BACKOFF_MS;
      failed.push(...ids.slice(i + 1));
      break;
    }
  }

  return failed;
}

async function drain_pending_rollbacks(): Promise<void> {
  if (is_pq_upload_rate_limited() || Date.now() < rollback_retry_after) {
    return;
  }

  const key = await pending_rollback_storage_key();
  if (!key) {
    return;
  }

  let ids: number[] = [];
  try {
    ids = JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    localStorage.removeItem(key);

    return;
  }

  if (ids.length === 0) {
    return;
  }

  const failed = await delete_secrets_until_failing(
    ids.slice(0, ROLLBACK_DRAIN_BATCH),
  );
  const remaining = [...failed, ...ids.slice(ROLLBACK_DRAIN_BATCH)];

  if (remaining.length > 0) {
    localStorage.setItem(
      key,
      JSON.stringify(remaining.slice(-PENDING_ROLLBACK_MAX)),
    );
  } else {
    localStorage.removeItem(key);
  }
}

async function rollback_persisted_secrets(ids: number[]): Promise<void> {
  if (is_pq_upload_rate_limited() || Date.now() < rollback_retry_after) {
    await queue_pending_rollback(ids);

    return;
  }

  await queue_pending_rollback(await delete_secrets_until_failing(ids));
}

function generate_ml_kem_keypairs(count: number): {
  public_keys: Uint8Array[];
  secret_keys: Uint8Array[];
} {
  const public_keys: Uint8Array[] = [];
  const secret_keys: Uint8Array[] = [];

  for (let i = 0; i < count; i++) {
    const keypair = ml_kem768.keygen();

    public_keys.push(keypair.publicKey);
    secret_keys.push(keypair.secretKey);
  }

  return { public_keys, secret_keys };
}

function build_prekey_batch(
  count: number,
  taken: Set<number>,
): { prekeys: PrekeyData[]; secret_keys: Uint8Array[] } {
  const key_ids = allocate_key_ids(count, taken);
  const { public_keys, secret_keys } = generate_ml_kem_keypairs(count);

  const prekeys: PrekeyData[] = public_keys.map((pk, i) => ({
    key_id: key_ids[i],
    public_key: array_to_base64(pk),
  }));

  return { prekeys, secret_keys };
}

export function generate_pq_prekeys(
  count: number = PQ_PREKEY_BATCH_SIZE,
  taken: Set<number> = new Set(),
): {
  prekeys: PrekeyData[];
  secret_keys: Uint8Array[];
} {
  return build_prekey_batch(count, taken);
}

export async function upload_prekeys(
  pq_prekeys: PrekeyData[],
): Promise<boolean> {
  const request: UploadPrekeysRequest = {
    one_time_prekeys: [],
  };

  if (pq_prekeys.length > 0) {
    request.pq_prekeys = pq_prekeys;
  }

  const response = await api_client.post("/crypto/v1/keys/prekeys", request);

  return !response.error;
}

export async function generate_and_upload_prekeys(
  force: boolean = false,
): Promise<boolean> {
  if (is_pq_upload_rate_limited()) {
    return false;
  }

  if (force) {
    const deadline = Date.now() + 30000;

    while (replenishment_in_progress && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
  } else if (replenishment_in_progress) {
    return false;
  }

  const now = Date.now();

  if (!force && now - last_replenishment_time < REPLENISHMENT_DEBOUNCE_MS) {
    return false;
  }

  replenishment_in_progress = true;
  last_replenishment_time = now;

  try {
    await drain_pending_rollbacks();

    const taken = await load_taken_key_ids();
    const pq = generate_pq_prekeys(PQ_PREKEY_BATCH_SIZE, taken);

    const persisted_pq_ids: number[] = [];

    let persistence_ok = true;

    try {
      await save_pq_secrets_bulk(
        pq.prekeys.map((p, i) => ({
          key_id: p.key_id,
          secret: pq.secret_keys[i],
        })),
      );
      for (const p of pq.prekeys) {
        persisted_pq_ids.push(p.key_id);
      }
    } catch {
      persistence_ok = false;
    }

    if (!persistence_ok) {
      await rollback_persisted_secrets(persisted_pq_ids);

      return false;
    }

    const success = await upload_prekeys(pq.prekeys);

    if (!success) {
      await rollback_persisted_secrets(persisted_pq_ids);
    }

    return success;
  } finally {
    replenishment_in_progress = false;
  }
}

export async function check_and_replenish_prekeys(): Promise<void> {
  try {
    await generate_and_upload_prekeys();
  } catch {
    /* best-effort */
  }
}

export async function wipe_published_pq_prekeys(): Promise<boolean> {
  try {
    const response = await api_client.delete("/crypto/v1/keys/pq-prekeys/all");

    return !response.error;
  } catch {
    return false;
  }
}
