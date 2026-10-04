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
const account_keys_added_listeners: Set<() => void> = new Set();

export function on_account_keys_added(callback: () => void): () => void {
  account_keys_added_listeners.add(callback);

  return () => {
    account_keys_added_listeners.delete(callback);
  };
}

export function notify_account_keys_added(): void {
  account_keys_added_listeners.forEach((callback) => {
    try {
      callback();
    } catch {
      return;
    }
  });
}
