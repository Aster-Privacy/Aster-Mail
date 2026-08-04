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
export const SEND_LOCK_STALL_MS = 60000;

export const SEND_REPEAT_GUARD_MS = 2000;

export interface SendLock {
  held: boolean;
  started_at: number;
}

export function can_acquire_send_lock(lock: SendLock, now: number): boolean {
  if (!lock.held) return true;

  return now - lock.started_at >= SEND_LOCK_STALL_MS;
}

export function is_repeat_send(last_send_at: number, now: number): boolean {
  if (last_send_at <= 0) return false;

  return now - last_send_at < SEND_REPEAT_GUARD_MS;
}
