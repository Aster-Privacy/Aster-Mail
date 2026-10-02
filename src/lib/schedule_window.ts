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
export const MAX_SEALED_SCHEDULE_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

export function latest_schedule_instant(now: number = Date.now()): Date {
  return new Date(now + MAX_SEALED_SCHEDULE_DAYS * DAY_MS);
}

export function exceeds_sealed_schedule_window(
  scheduled_at: Date,
  now: number = Date.now(),
): boolean {
  return scheduled_at.getTime() > latest_schedule_instant(now).getTime();
}
