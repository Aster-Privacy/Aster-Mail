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
export const STORAGE_REKEY_STATUS_PATH =
  "/core/v1/auth/me/storage-rekey/status";
export const STORAGE_REKEY_STATUS_TTL_MS = 60_000;

export interface StorageRekeyStatus {
  may_start: boolean;
  level2_admitted: boolean;
}

export interface StorageRekeyStatusApi {
  get<T>(path: string): Promise<{ data?: T; error?: string; status?: number }>;
}

interface StatusBody {
  may_start?: unknown;
  level2_admitted?: unknown;
}

let cached: Promise<StorageRekeyStatus | null> | null = null;
let cached_at = 0;
let generation = 0;

async function load_status(
  api: StorageRekeyStatusApi,
): Promise<StorageRekeyStatus | null> {
  try {
    const response = await api.get<StatusBody>(STORAGE_REKEY_STATUS_PATH);
    const body = response.data;

    if (response.error || !body) return null;
    if (
      typeof body.may_start !== "boolean" ||
      typeof body.level2_admitted !== "boolean"
    ) {
      return null;
    }

    return {
      may_start: body.may_start,
      level2_admitted: body.level2_admitted,
    };
  } catch {
    return null;
  }
}

export function fetch_storage_rekey_status(
  api: StorageRekeyStatusApi,
  now: number = Date.now(),
): Promise<StorageRekeyStatus | null> {
  if (cached && now - cached_at < STORAGE_REKEY_STATUS_TTL_MS) return cached;

  const started = generation;
  const request = load_status(api).then((status) => {
    if (status === null && cached === request) cached = null;

    return started === generation ? status : null;
  });

  cached = request;
  cached_at = now;

  return request;
}

export function reset_storage_rekey_status(): void {
  cached = null;
  cached_at = 0;
  generation += 1;
}
