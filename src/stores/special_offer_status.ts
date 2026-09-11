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
  user_id: string | null;
}

const empty_state: SpecialOfferStatusState = {
  status: null,
  is_loaded: false,
  user_id: null,
};

let current: SpecialOfferStatusState = empty_state;
let in_flight: { user_id: string; promise: Promise<void> } | null = null;
let generation = 0;
let latest_request = 0;
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

export function get_special_offer_status_snapshot(): SpecialOfferStatusState {
  return current;
}

export function get_special_offer_generation(): number {
  return generation;
}

export function load_special_offer_status(
  user_id: string,
  force = false,
): Promise<void> {
  if (!force && in_flight && in_flight.user_id === user_id) {
    return in_flight.promise;
  }

  if (!force && current.user_id === user_id && current.is_loaded) {
    return Promise.resolve();
  }

  if (current.user_id !== user_id) {
    generation += 1;
    current = { status: null, is_loaded: false, user_id };
    notify();
  }

  const request_generation = generation;
  const request_id = ++latest_request;
  const is_current = () =>
    request_generation === generation &&
    request_id === latest_request &&
    current.user_id === user_id;

  const promise = fetch_special_offer_status()
    .catch(() => null)
    .then((status) => {
      if (!is_current()) return;

      current = { status, is_loaded: true, user_id };
      notify();
    })
    .finally(() => {
      if (in_flight?.promise === promise) in_flight = null;
    });

  in_flight = { user_id, promise };

  return promise;
}

export function refresh_special_offer_status(): Promise<void> {
  if (!current.user_id) return Promise.resolve();

  return load_special_offer_status(current.user_id, true);
}

export function reset_special_offer_status() {
  generation += 1;
  latest_request += 1;
  in_flight = null;

  if (current === empty_state) return;

  current = empty_state;
  notify();
}

export async function claim_special_offer_slot(): Promise<boolean> {
  const claim_generation = generation;
  let granted = false;

  try {
    granted = await claim_special_offer();
  } catch {
    granted = false;
  }

  if (!granted || claim_generation !== generation) return false;

  patch({ auto_show: false, shown: true });

  return true;
}

export async function record_special_offer_dismissed(): Promise<void> {
  patch({ available: false, auto_show: false, dismissed: true, shown: true });
  await dismiss_special_offer_on_server();
}

export async function record_special_offer_accepted(): Promise<boolean> {
  const accept_generation = generation;
  let accepted = false;

  try {
    accepted = await accept_special_offer_on_server();
  } catch {
    accepted = false;
  }

  if (!accepted || accept_generation !== generation) return false;

  patch({ available: true, auto_show: false, shown: true });

  return true;
}

export function use_special_offer_status(): SpecialOfferStatusState {
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  const { is_authenticated, user } = use_auth();
  const user_id = is_authenticated ? (user?.id ?? null) : null;

  useEffect(() => {
    if (!user_id) {
      reset_special_offer_status();

      return;
    }

    if (state.user_id !== user_id || !state.is_loaded) {
      void load_special_offer_status(user_id);
    }
  }, [user_id, state.user_id, state.is_loaded]);

  if (!user_id || state.user_id !== user_id) return empty_state;

  return state;
}
