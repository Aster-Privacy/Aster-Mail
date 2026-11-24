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

import { get_sync_format_readiness } from "@/services/api/sync_format_readiness";
import { ignore_error } from "@/lib/ignore_error";

let recording: Promise<void> | null = null;

export function vault_requires_bound_state(): boolean {
  return get_vault_from_memory()?.ratchet_state_v2 === true;
}

async function record_bound_state_in_vault(): Promise<void> {
  const vault = get_vault_from_memory();

  if (!vault || vault.ratchet_state_v2 === true) return;

  try {
    const { write_vault_merged } = await import("./vault_cas_write");

    await write_vault_merged({
      next: { ...vault, ratchet_state_v2: true },
      base: vault,
    });
  } catch (caught) {
    ignore_error("services/crypto/ratchet_sync_format", caught);
  }
}

export async function ratchet_sync_writes_bound(
  server_copy_bound: boolean,
): Promise<boolean> {
  if (vault_requires_bound_state() || server_copy_bound) return true;

  const readiness = await get_sync_format_readiness();

  if (!readiness.ratchet_sync_bound) return false;

  if (!recording) {
    recording = record_bound_state_in_vault().finally(() => {
      recording = null;
    });
  }

  return true;
}
