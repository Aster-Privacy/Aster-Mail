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

import { is_on_auth_route } from "@/stores/upgrade_store";

export interface AliasCapUpsellState {
  is_open: boolean;
  used: number | null;
  limit: number | null;
  open_seq: number;
}

const initial_state: AliasCapUpsellState = {
  is_open: false,
  used: null,
  limit: null,
  open_seq: 0,
};

let current: AliasCapUpsellState = initial_state;
let open_seq = 0;
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

export function get_alias_cap_upsell_snapshot(): AliasCapUpsellState {
  return current;
}

export function show_alias_cap_upsell(opts?: {
  used?: number | null;
  limit?: number | null;
}) {
  if (is_on_auth_route()) return;

  open_seq += 1;
  current = {
    is_open: true,
    used: opts?.used ?? null,
    limit: opts?.limit ?? null,
    open_seq,
  };
  notify();
}

export function close_alias_cap_upsell() {
  if (!current.is_open) return;

  current = { ...current, is_open: false };
  notify();
}

export function use_alias_cap_upsell_state(): AliasCapUpsellState {
  return useSyncExternalStore(
    subscribe,
    get_alias_cap_upsell_snapshot,
    get_alias_cap_upsell_snapshot,
  );
}
