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
import { get_vault_from_memory } from "./memory_key_store";
import { raise_sync_counter, read_sync_counter } from "./ratchet_sync_counter";
import { RATCHET_SYNC_FLOOR_PREFIX } from "./storage_key_names";

import { ignore_error } from "@/lib/ignore_error";

const VAULT_FLUSH_DELAY_MS = 2000;
const pending_vault_floors = new Map<string, number>();
let flush_timer: ReturnType<typeof setTimeout> | null = null;

export function read_vault_sync_floor(conversation_id: string): number {
  const value = get_vault_from_memory()?.ratchet_sync_floors?.[conversation_id];

  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : 0;
}

export async function flush_vault_sync_floors(): Promise<void> {
  flush_timer = null;

  const vault = get_vault_from_memory();

  if (!vault || pending_vault_floors.size === 0) return;

  const floors = { ...(vault.ratchet_sync_floors ?? {}) };
  let changed = false;

  for (const [conversation_id, value] of pending_vault_floors) {
    if (value > (floors[conversation_id] ?? 0)) {
      floors[conversation_id] = value;
      changed = true;
    }
  }

  pending_vault_floors.clear();

  if (!changed) return;

  try {
    const { write_vault_merged } = await import("./vault_cas_write");

    await write_vault_merged({
      next: { ...vault, ratchet_sync_floors: floors },
      base: vault,
    });
  } catch (caught) {
    ignore_error("services/crypto/ratchet_sync_floor:vault", caught);
  }
}

function queue_vault_floor(conversation_id: string, sync_version: number) {
  if (!Number.isSafeInteger(sync_version) || sync_version <= 0) return;
  if (sync_version <= read_vault_sync_floor(conversation_id)) return;
  if (sync_version <= (pending_vault_floors.get(conversation_id) ?? 0)) return;

  pending_vault_floors.set(conversation_id, sync_version);

  if (!flush_timer) {
    flush_timer = setTimeout(() => {
      void flush_vault_sync_floors();
    }, VAULT_FLUSH_DELAY_MS);
  }
}

export async function read_sync_floor(
  conversation_id: string,
): Promise<number> {
  return Math.max(
    await read_sync_counter(RATCHET_SYNC_FLOOR_PREFIX, conversation_id),
    read_vault_sync_floor(conversation_id),
  );
}

export function raise_sync_floor(
  conversation_id: string,
  sync_version: number,
): Promise<void> {
  queue_vault_floor(conversation_id, sync_version);

  return raise_sync_counter(
    RATCHET_SYNC_FLOOR_PREFIX,
    conversation_id,
    sync_version,
  );
}
