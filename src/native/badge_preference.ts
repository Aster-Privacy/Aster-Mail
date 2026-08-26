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
let badge_count_enabled = true;

const listeners = new Set<() => void>();

export function is_badge_count_enabled(): boolean {
  return badge_count_enabled;
}

export function set_badge_count_enabled(value: boolean): void {
  if (badge_count_enabled === value) return;

  badge_count_enabled = value;
  listeners.forEach((listener) => listener());
}

export function on_badge_count_change(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
