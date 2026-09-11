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

export type SpecialOfferSource = "auto" | "manual";

export interface SpecialOfferState {
  is_open: boolean;
  source: SpecialOfferSource;
  open_seq: number;
}

const initial_state: SpecialOfferState = {
  is_open: false,
  source: "auto",
  open_seq: 0,
};

let current: SpecialOfferState = initial_state;
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

export function get_special_offer_snapshot(): SpecialOfferState {
  return current;
}

export function can_show_special_offer(): boolean {
  return !is_on_auth_route();
}

export function show_special_offer(
  source: SpecialOfferSource = "manual",
): boolean {
  if (!can_show_special_offer()) return false;

  open_seq += 1;
  current = { is_open: true, source, open_seq };
  notify();

  return true;
}

export function close_special_offer() {
  if (!current.is_open) return;

  current = { ...current, is_open: false };
  notify();
}

export function use_special_offer_state(): SpecialOfferState {
  return useSyncExternalStore(
    subscribe,
    get_special_offer_snapshot,
    get_special_offer_snapshot,
  );
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__trigger_special_offer = () =>
    show_special_offer("manual");
}
