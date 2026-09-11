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
import { useEffect, useSyncExternalStore } from "react";

import { use_auth } from "@/contexts/auth_context";

import {
  accept_special_offer_on_server,
  claim_special_offer,
  dismiss_special_offer_on_server,
  fetch_special_offer_status,
  type SpecialOfferStatus,
} from "@/services/api/offers";

export interface SpecialOfferStatusState {
  status: SpecialOfferStatus | null;
  is_loaded: boolean;
}

let current: SpecialOfferStatusState = { status: null, is_loaded: false };
let in_flight: Promise<void> | null = null;
let generation = 0;
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

function snapshot(): SpecialOfferStatusState {
  return current;
}

function patch(next: Partial<SpecialOfferStatus>) {
  if (!current.status) return;

  current = { ...current, status: { ...current.status, ...next } };
  notify();
}

export function load_special_offer_status(): Promise<void> {
  if (in_flight) return in_flight;

  const request_generation = generation;

  in_flight = fetch_special_offer_status()
    .then((status) => {
      if (request_generation !== generation) return;

      current = { status, is_loaded: true };
      notify();
    })
    .catch(() => {
      if (request_generation !== generation) return;

      current = { status: null, is_loaded: true };
      notify();
    })
    .finally(() => {
      if (request_generation === generation) in_flight = null;
    });

  return in_flight;
}

export function reset_special_offer_status() {
  generation += 1;
  current = { status: null, is_loaded: false };
  in_flight = null;
  notify();
}

export async function claim_special_offer_slot(): Promise<boolean> {
  const granted = await claim_special_offer();

  if (granted) patch({ auto_show: false, shown: true });

  return granted;
}

export async function record_special_offer_dismissed(): Promise<void> {
  patch({ available: false, auto_show: false, dismissed: true, shown: true });
  await dismiss_special_offer_on_server();
}

export async function record_special_offer_accepted(): Promise<void> {
  patch({ auto_show: false, shown: true });
  await accept_special_offer_on_server();
}

export function use_special_offer_status(): SpecialOfferStatusState {
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  const { is_authenticated } = use_auth();

  useEffect(() => {
    if (is_authenticated && !state.is_loaded) void load_special_offer_status();
  }, [is_authenticated, state.is_loaded]);

  return state;
}
