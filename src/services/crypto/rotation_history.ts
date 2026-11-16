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
import type { EncryptedVault, RatchetKeySet } from "./key_manager_core";

import {
  RATCHET_PREVIOUS_KEYS_LIMIT,
  cap_ratchet_history,
  ratchet_history_bytes,
} from "./key_manager_core";
import { current_ratchet_key_set } from "./ratchet_key_continuity";

export const ROTATION_VAULT_MAX_BYTES = 640 * 1024;

export interface RotationHistoryPlan {
  previous_keys: string[];
  ratchet_previous_keys: RatchetKeySet[];
  removed_identity_keys: number;
  removed_ratchet_keys: number;
  removed_key_count: number;
}

function identity_history_limit(key_history_limit: number): number | null {
  if (!Number.isFinite(key_history_limit) || key_history_limit <= 0) {
    return null;
  }

  return Math.floor(key_history_limit);
}

export function ratchet_history_limit(
  key_history_limit: number,
): number | null {
  const limit = identity_history_limit(key_history_limit);

  if (limit === null) return null;

  return Math.max(limit, RATCHET_PREVIOUS_KEYS_LIMIT);
}

function string_entry_bytes(value: string): number {
  return JSON.stringify(value).length + 1;
}

export function plan_rotation_history(
  vault: EncryptedVault,
  key_history_limit: number,
): RotationHistoryPlan {
  const identity_candidates = [
    vault.identity_key,
    ...(vault.previous_keys ?? []),
  ];
  const identity_limit = identity_history_limit(key_history_limit);
  const previous_keys =
    identity_limit === null
      ? [...identity_candidates]
      : identity_candidates.slice(0, identity_limit);

  const current_set = current_ratchet_key_set(vault);
  const ratchet_candidates = [
    ...(current_set ? [current_set] : []),
    ...(vault.ratchet_previous_keys ?? []),
  ];
  const ratchet_previous_keys = cap_ratchet_history(
    ratchet_candidates,
    ratchet_history_limit(key_history_limit),
  );

  let total_bytes =
    JSON.stringify({ ...vault, previous_keys: [], ratchet_previous_keys: [] })
      .length +
    previous_keys.reduce((sum, key) => sum + string_entry_bytes(key), 0) +
    ratchet_history_bytes(ratchet_previous_keys);

  while (total_bytes > ROTATION_VAULT_MAX_BYTES && previous_keys.length > 1) {
    const dropped = previous_keys.pop();

    if (dropped !== undefined) total_bytes -= string_entry_bytes(dropped);
  }

  const removed_identity_keys =
    identity_candidates.length - previous_keys.length;
  const removed_ratchet_keys =
    ratchet_candidates.length - ratchet_previous_keys.length;

  return {
    previous_keys,
    ratchet_previous_keys,
    removed_identity_keys,
    removed_ratchet_keys,
    removed_key_count: Math.max(removed_identity_keys, removed_ratchet_keys),
  };
}
