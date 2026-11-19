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
import { api_client } from "./client";

export const RATCHET_SYNC_VERSION_BOUND = 3;
export const RECOVERY_BACKUP_VERSION_BOUND = 2;

const READINESS_TTL_MS = 5 * 60 * 1000;

export interface SyncFormatReadiness {
  ratchet_sync_bound: boolean;
  recovery_backup_bound: boolean;
}

const NOT_READY: SyncFormatReadiness = {
  ratchet_sync_bound: false,
  recovery_backup_bound: false,
};

let readiness_cache: {
  readiness: SyncFormatReadiness;
  fetched_at: number;
} | null = null;

export function reset_sync_format_readiness_cache(): void {
  readiness_cache = null;
}

export async function get_sync_format_readiness(): Promise<SyncFormatReadiness> {
  if (
    readiness_cache &&
    Date.now() - readiness_cache.fetched_at < READINESS_TTL_MS
  ) {
    return readiness_cache.readiness;
  }

  try {
    const response = await api_client.get<{
      ratchet_sync_v3_ready?: unknown;
      recovery_backup_v2_ready?: unknown;
    }>("/crypto/v1/ratchet/sync-format-readiness", { cache_ttl: 0 });

    if (response.error || !response.data) return NOT_READY;

    const readiness = {
      ratchet_sync_bound: response.data.ratchet_sync_v3_ready === true,
      recovery_backup_bound: response.data.recovery_backup_v2_ready === true,
    };

    readiness_cache = { readiness, fetched_at: Date.now() };

    return readiness;
  } catch {
    return NOT_READY;
  }
}
