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
const STORAGE_PREFIX = "aster_dev_mode";

function storage_key(account_id: string | null | undefined): string | null {
  return account_id ? `${STORAGE_PREFIX}:${account_id}` : null;
}

export function read_dev_mode_cache(
  account_id: string | null | undefined,
): boolean | null {
  const key = storage_key(account_id);

  if (!key) return null;

  try {
    const value = localStorage.getItem(key);

    if (value === "1") return true;
    if (value === "0") return false;

    return null;
  } catch {
    return null;
  }
}

export function write_dev_mode_cache(
  account_id: string | null | undefined,
  enabled: boolean,
): void {
  const key = storage_key(account_id);

  if (!key) return;

  try {
    localStorage.setItem(key, enabled ? "1" : "0");
  } catch {}
}
