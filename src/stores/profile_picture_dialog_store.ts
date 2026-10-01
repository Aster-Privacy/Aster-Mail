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
import { useSyncExternalStore } from "react";

let is_open = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function get_snapshot(): boolean {
  return is_open;
}

export function open_profile_picture_dialog() {
  if (is_open) return;

  is_open = true;
  notify();
}

export function close_profile_picture_dialog() {
  if (!is_open) return;

  is_open = false;
  notify();
}

export function use_profile_picture_dialog_open(): boolean {
  return useSyncExternalStore(subscribe, get_snapshot, get_snapshot);
}
