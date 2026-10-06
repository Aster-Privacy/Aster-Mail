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
import { useCallback, useSyncExternalStore } from "react";

import { on_vault_cleared } from "@/services/crypto/memory_key_store";

const MAX_OVERRIDES = 200;

const overrides = new Map<string, boolean>();
const listeners = new Set<() => void>();
let vault_listener_registered = false;

function notify(): void {
  for (const listener of listeners) listener();
}

function register_vault_listener(): void {
  if (vault_listener_registered) return;
  vault_listener_registered = true;
  on_vault_cleared(() => clear_plain_view_overrides());
}

export function get_plain_view_override(id: string): boolean | undefined {
  return overrides.get(id);
}

export function set_plain_view_override(id: string, plain: boolean): void {
  if (!id) return;
  register_vault_listener();
  overrides.delete(id);
  overrides.set(id, plain);

  while (overrides.size > MAX_OVERRIDES) {
    const oldest = overrides.keys().next().value;

    if (oldest === undefined) break;
    overrides.delete(oldest);
  }

  notify();
}

export function clear_plain_view_overrides(): void {
  if (overrides.size === 0) return;
  overrides.clear();
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function use_plain_view_override(id: string): boolean | undefined {
  const get_snapshot = useCallback(() => overrides.get(id), [id]);

  return useSyncExternalStore(subscribe, get_snapshot, get_snapshot);
}
