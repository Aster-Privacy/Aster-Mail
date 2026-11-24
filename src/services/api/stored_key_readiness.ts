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

const READINESS_TTL_MS = 5 * 60 * 1000;

let readiness_cache: { ready: boolean; fetched_at: number } | null = null;

export function reset_stored_key_readiness_cache(): void {
  readiness_cache = null;
}

export async function get_stored_key_readiness(): Promise<boolean> {
  if (
    readiness_cache &&
    Date.now() - readiness_cache.fetched_at < READINESS_TTL_MS
  ) {
    return readiness_cache.ready;
  }

  try {
    const response = await api_client.get<{ stored_keys_ready?: unknown }>(
      "/crypto/v1/ratchet/stored-key-readiness",
      { cache_ttl: 0 },
    );

    if (response.error || !response.data) return false;

    const ready = response.data.stored_keys_ready === true;

    readiness_cache = { ready, fetched_at: Date.now() };

    return ready;
  } catch {
    return false;
  }
}
