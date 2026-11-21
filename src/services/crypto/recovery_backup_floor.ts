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
const FLOOR_KEY_PREFIX = "aster_recovery_backup_floor:";

export interface RecoveryBackupBinding {
  user_id: string;
  generation: number;
}

export class RecoveryBackupStaleError extends Error {
  constructor() {
    super("recovery backup is older than one this device has seen");
    this.name = "RecoveryBackupStaleError";
  }
}

function floor_key(user_id: string): string {
  return `${FLOOR_KEY_PREFIX}${user_id}`;
}

export function read_recovery_backup_floor(user_id: string): number {
  if (!user_id) return 0;

  try {
    const raw = globalThis.localStorage?.getItem(floor_key(user_id));
    const value = raw ? Number(raw) : 0;

    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function raise_recovery_backup_floor(
  user_id: string,
  generation: number,
): void {
  if (!user_id || !Number.isSafeInteger(generation) || generation <= 0) {
    return;
  }

  if (generation <= read_recovery_backup_floor(user_id)) return;

  try {
    globalThis.localStorage?.setItem(floor_key(user_id), String(generation));
  } catch {
    return;
  }
}

export function next_recovery_backup_binding(
  user_id: string,
  known_generation = 0,
): RecoveryBackupBinding {
  const known =
    Number.isSafeInteger(known_generation) && known_generation > 0
      ? known_generation
      : 0;

  return {
    user_id,
    generation: Math.max(read_recovery_backup_floor(user_id), known) + 1,
  };
}
