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
import {
  lane_replay_for_sender,
  merge_lane_replay,
  merge_lane_replay_maps,
  type LaneReplayRecord,
} from "./lane_replay";
import { get_vault_from_memory } from "./memory_key_store";
import { with_vault_write_lock } from "./vault_write_lock";

export const BOOTSTRAP_REPLAY_FLUSH_DELAY_MS = 2000;
export const MAX_BOOTSTRAP_REPLAY_FLUSH_ATTEMPTS = 5;

const pending = new Map<string, LaneReplayRecord>();
let timer: ReturnType<typeof setTimeout> | null = null;
let attempts = 0;

export function vault_bootstrap_replay(sender_email: string): LaneReplayRecord {
  return lane_replay_for_sender(
    get_vault_from_memory()?.bootstrap_replay,
    sender_email,
  );
}

function schedule(): void {
  if (timer !== null) return;

  timer = setTimeout(() => {
    timer = null;
    void flush_bootstrap_replay();
  }, BOOTSTRAP_REPLAY_FLUSH_DELAY_MS);
}

function requeue(batch: Map<string, LaneReplayRecord>): void {
  for (const [sender, record] of batch) {
    pending.set(sender, merge_lane_replay(pending.get(sender), record));
  }

  attempts += 1;

  if (attempts < MAX_BOOTSTRAP_REPLAY_FLUSH_ATTEMPTS) schedule();
}

export function queue_bootstrap_replay(
  sender_email: string,
  record: LaneReplayRecord,
): void {
  if (!sender_email) return;

  pending.set(
    sender_email,
    merge_lane_replay(record, pending.get(sender_email)),
  );
  attempts = 0;
  schedule();
}

export function pending_bootstrap_replay(): Map<string, LaneReplayRecord> {
  return new Map(pending);
}

export async function flush_bootstrap_replay(): Promise<boolean> {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }

  if (pending.size === 0) return true;

  const batch = new Map(pending);

  pending.clear();

  try {
    const { write_vault_merged } = await import("./vault_cas_write");
    const written = await with_vault_write_lock(async () => {
      const vault = get_vault_from_memory();

      if (!vault) return false;

      const bootstrap_replay = merge_lane_replay_maps(
        vault.bootstrap_replay,
        Object.fromEntries(batch),
      );
      const result = await write_vault_merged({
        next: { ...vault, bootstrap_replay },
        base: vault,
      });

      return result.status === "written";
    });

    if (written) {
      attempts = 0;
    } else {
      requeue(batch);
    }

    return written;
  } catch {
    requeue(batch);

    return false;
  }
}
