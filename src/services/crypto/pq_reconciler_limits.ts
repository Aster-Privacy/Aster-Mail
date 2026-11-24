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
import { load_storage_write_key_bytes } from "./storage_write_key";
import {
  PQ_RECONCILER_LIMITS_PREFIX,
  scoped_get,
  scoped_set,
} from "./storage_key_names";

import { zero_uint8_array } from "@/services/crypto/secure_memory";

export interface ReconcilerLimits {
  ran_at: number;
  self_heal_at: number;
  self_heal_keys: Record<string, number>;
}

const LIMITS_NAME = "limits";

function empty_limits(): ReconcilerLimits {
  return { ran_at: 0, self_heal_at: 0, self_heal_keys: {} };
}

async function limits_key(): Promise<CryptoKey | null> {
  const raw = await load_storage_write_key_bytes();

  if (!raw) return null;

  try {
    return await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    zero_uint8_array(raw);
  }
}

function finite_time(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalize(stored: unknown): ReconcilerLimits {
  if (!stored || typeof stored !== "object") return empty_limits();

  const record = stored as Record<string, unknown>;
  const keys: Record<string, number> = {};
  const raw_keys = record.self_heal_keys;

  if (raw_keys && typeof raw_keys === "object" && !Array.isArray(raw_keys)) {
    for (const [key_id, ts] of Object.entries(
      raw_keys as Record<string, unknown>,
    )) {
      const time = finite_time(ts);

      if (time > 0) keys[key_id] = time;
    }
  }

  return {
    ran_at: finite_time(record.ran_at),
    self_heal_at: finite_time(record.self_heal_at),
    self_heal_keys: keys,
  };
}

export async function read_reconciler_limits(
  uid: string | null,
): Promise<ReconcilerLimits | null> {
  const key = await limits_key();

  if (!key) return null;

  const stored = await scoped_get<unknown>(
    PQ_RECONCILER_LIMITS_PREFIX,
    uid,
    LIMITS_NAME,
    key,
  );

  return normalize(stored);
}

export async function write_reconciler_limits(
  uid: string | null,
  limits: ReconcilerLimits,
): Promise<boolean> {
  const key = await limits_key();

  if (!key) return false;

  await scoped_set(PQ_RECONCILER_LIMITS_PREFIX, uid, LIMITS_NAME, limits, key);

  return true;
}
