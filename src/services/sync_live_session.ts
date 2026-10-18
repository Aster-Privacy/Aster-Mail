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
export const LIVE_SESSION_CACHE_MAX_AGE_MS = 60 * 60 * 1000;

let session = 0;
let live_probe: () => boolean = () => false;

export function set_sync_live_probe(probe: () => boolean): void {
  live_probe = probe;
}

export function begin_live_sync_session(): void {
  session += 1;
}

export function get_live_sync_session(): number {
  return session > 0 && live_probe() ? session : 0;
}
