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
export const SERVER_CLOCK_THRESHOLD_MS = 30_000;

let offset_ms = 0;
let has_sample = false;

export function note_server_date(
  date_header: string | null | undefined,
  sent_at: number,
  received_at: number,
): void {
  if (!date_header) return;
  const server_ms = Date.parse(date_header);

  if (!Number.isFinite(server_ms)) return;
  if (!(received_at >= sent_at)) return;
  const midpoint = sent_at + (received_at - sent_at) / 2;

  offset_ms = server_ms + 500 - midpoint;
  has_sample = true;
}

export function get_server_time_offset(): number {
  if (!has_sample) return 0;

  return Math.abs(offset_ms) > SERVER_CLOCK_THRESHOLD_MS ? offset_ms : 0;
}

export function server_now(local_now: number = Date.now()): number {
  return local_now + get_server_time_offset();
}

export function set_server_time_offset_for_tests(value: number | null): void {
  offset_ms = value ?? 0;
  has_sample = value !== null;
}
