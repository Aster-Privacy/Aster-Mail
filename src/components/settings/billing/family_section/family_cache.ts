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
import type { FamilyGroupResponse } from "@/services/api/family";

import { get_family_group } from "@/services/api/family";
import {
  safe_local_get,
  safe_local_keys,
  safe_local_remove,
  safe_local_set,
} from "@/lib/safe_storage";

export const FAMILY_CACHE_PREFIX = "aster:family_cache:";

const FAMILY_CACHE_VERSION = 1;

interface FamilySnapshot {
  version: number;
  saved_at: number;
  group: FamilyGroupResponse;
}

let memory_cache: { user_id: string; group: FamilyGroupResponse } | null =
  null;
let pending_request: Promise<FamilyGroupResponse | null> | null = null;

function cache_key(user_id: string): string {
  return `${FAMILY_CACHE_PREFIX}${user_id}`;
}

export function read_family_cache(
  user_id: string | null | undefined,
): FamilyGroupResponse | null {
  if (!user_id) return null;
  if (memory_cache?.user_id === user_id) return memory_cache.group;
  const raw = safe_local_get(cache_key(user_id));

  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FamilySnapshot>;

    if (parsed.version !== FAMILY_CACHE_VERSION || !parsed.group) return null;
    memory_cache = { user_id, group: parsed.group };

    return parsed.group;
  } catch {
    return null;
  }
}

export function write_family_cache(
  user_id: string | null | undefined,
  group: FamilyGroupResponse,
): void {
  if (!user_id) return;
  memory_cache = { user_id, group };
  const payload: FamilySnapshot = {
    version: FAMILY_CACHE_VERSION,
    saved_at: Date.now(),
    group,
  };

  safe_local_set(cache_key(user_id), JSON.stringify(payload));
}

export function clear_family_cache(): void {
  memory_cache = null;
  for (const key of safe_local_keys()) {
    if (key.startsWith(FAMILY_CACHE_PREFIX)) safe_local_remove(key);
  }
}

export function fetch_family_group(
  user_id: string | null | undefined,
): Promise<FamilyGroupResponse | null> {
  if (pending_request) return pending_request;
  const request = get_family_group()
    .then((res) => {
      if (res.data) write_family_cache(user_id, res.data);

      return res.data ?? null;
    })
    .finally(() => {
      if (pending_request === request) pending_request = null;
    });

  pending_request = request;

  return request;
}

export function prefetch_family_data(user_id: string | null): void {
  if (!user_id || pending_request) return;
  if (memory_cache?.user_id === user_id) return;
  void fetch_family_group(user_id).catch(() => null);
}
