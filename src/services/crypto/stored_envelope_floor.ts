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
const BOUND_ENVELOPE_FLOOR_KEY_PREFIX = "astermail_bound_envelope_floor:";

export function has_bound_envelope_floor(owner_id: string | null): boolean {
  if (!owner_id) return false;

  try {
    return localStorage.getItem(BOUND_ENVELOPE_FLOOR_KEY_PREFIX + owner_id) === "1";
  } catch {
    return false;
  }
}

export function raise_bound_envelope_floor(owner_id: string | null): void {
  if (!owner_id) return;

  try {
    localStorage.setItem(BOUND_ENVELOPE_FLOOR_KEY_PREFIX + owner_id, "1");
  } catch {
    return;
  }
}
