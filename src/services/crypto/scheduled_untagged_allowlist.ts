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
import type { ScheduledUntaggedSnapshot } from "./key_manager_core";

import {
  get_last_vault_owner_id,
  get_vault_from_memory,
  has_vault_in_memory_for,
} from "./memory_key_store";
import {
  MAX_SNAPSHOT_IDS,
  create_untagged_snapshot,
  has_untagged_snapshot,
  read_untagged_snapshot,
} from "./scheduled_untagged_snapshot";
import { write_vault_merged } from "./vault_cas_write";
import { with_vault_write_lock_bounded } from "./vault_write_lock";
import { VAULT_LOCK_WAIT_MS } from "./storage_rotation/vault_step";

export interface UntaggedSnapshotDeps {
  list_ids: () => Promise<string[] | null>;
  now?: () => number;
}

let pending_snapshot: Promise<ScheduledUntaggedSnapshot | null> | null = null;

export function ensure_untagged_snapshot(
  deps: UntaggedSnapshotDeps,
): Promise<ScheduledUntaggedSnapshot | null> {
  const current = get_vault_from_memory();

  if (has_untagged_snapshot(current)) {
    return Promise.resolve(read_untagged_snapshot(current) ?? null);
  }
  if (pending_snapshot) return pending_snapshot;

  pending_snapshot = take_untagged_snapshot(deps).finally(() => {
    pending_snapshot = null;
  });

  return pending_snapshot;
}

async function take_untagged_snapshot(
  deps: UntaggedSnapshotDeps,
): Promise<ScheduledUntaggedSnapshot | null> {
  const user_id = get_last_vault_owner_id();

  if (!user_id) return null;

  return with_vault_write_lock_bounded(async () => {
    const vault = get_vault_from_memory();

    if (!vault || !has_vault_in_memory_for(user_id)) return null;

    const now = (deps.now ?? Date.now)();
    const recorded = read_untagged_snapshot(vault, now);

    if (has_untagged_snapshot(vault)) return recorded ?? null;

    const ids = recorded ? recorded.ids : await deps.list_ids();

    if (!ids || ids.length > MAX_SNAPSHOT_IDS) return null;

    const snapshot = create_untagged_snapshot(ids, now);
    const result = await write_vault_merged({
      next: { ...vault, scheduled_untagged: snapshot },
      user_id,
    });

    if (result.status !== "written") return null;

    return read_untagged_snapshot(result.vault, now) ?? snapshot;
  }, VAULT_LOCK_WAIT_MS).catch(() => null);
}
