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
const MAX_TRACKED_ROTATIONS = 512;
const announced_rotations = new Map<string, string>();

export function claim_rotation_notice(peer: string, key: string): boolean {
  const id = peer.trim().toLowerCase();

  if (!id) return false;
  if (announced_rotations.get(id) === key) return false;

  announced_rotations.delete(id);
  announced_rotations.set(id, key);

  while (announced_rotations.size > MAX_TRACKED_ROTATIONS) {
    const oldest = announced_rotations.keys().next();

    if (oldest.done) break;

    announced_rotations.delete(oldest.value);
  }

  return true;
}

export function reset_rotation_notices(): void {
  announced_rotations.clear();
}
