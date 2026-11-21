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
let sender_logos_enabled = false;
const listeners = new Set<() => void>();

export function are_sender_logos_enabled(): boolean {
  return sender_logos_enabled;
}

export function set_sender_logos_enabled(enabled: boolean): void {
  if (sender_logos_enabled === enabled) return;
  sender_logos_enabled = enabled;
  listeners.forEach((listener) => listener());
}

export function subscribe_sender_logos(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
