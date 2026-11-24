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
import { useSyncExternalStore } from "react";

import { forget_totp_required } from "@/services/api/step_up_cache";

export type SuspensionState = "unknown" | "active" | "suspended";

export const SUSPENDED_PATH = "/suspended";
export const SUSPENDED_SCOPE = "suspended";
export const ACCOUNT_SUSPENDED_EVENT = "aster:account-suspended";

const HINT_KEY = "aster_session_scope";

const listeners = new Set<() => void>();

function read_hint(): boolean {
  try {
    return sessionStorage.getItem(HINT_KEY) === SUSPENDED_SCOPE;
  } catch {
    return false;
  }
}

function write_hint(suspended: boolean): void {
  try {
    if (suspended) {
      sessionStorage.setItem(HINT_KEY, SUSPENDED_SCOPE);
    } else {
      sessionStorage.removeItem(HINT_KEY);
    }
  } catch {
    return;
  }
}

let current_state: SuspensionState = read_hint() ? "suspended" : "unknown";

function emit(): void {
  for (const listener of listeners) listener();
}

export function get_suspension_state(): SuspensionState {
  return current_state;
}

export function set_suspension_state(next: SuspensionState): void {
  if (next !== "unknown") write_hint(next === "suspended");
  if (current_state === next) return;
  current_state = next;
  emit();
}

export function reset_suspension_state(): void {
  write_hint(false);
  if (current_state === "unknown") return;
  current_state = "unknown";
  emit();
}

export function apply_sign_in_scope(response: {
  session_scope?: string | null;
  is_suspended?: boolean;
}): void {
  forget_totp_required();
  const suspended =
    response.session_scope === SUSPENDED_SCOPE || response.is_suspended === true;

  set_suspension_state(suspended ? "suspended" : "active");
}

export function is_suspended_path(pathname: string): boolean {
  return pathname === SUSPENDED_PATH || pathname === `${SUSPENDED_PATH}/`;
}

export function subscribe_suspension_state(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function use_suspension_state(): SuspensionState {
  return useSyncExternalStore(
    subscribe_suspension_state,
    get_suspension_state,
    () => "unknown",
  );
}

if (typeof window !== "undefined") {
  window.addEventListener(ACCOUNT_SUSPENDED_EVENT, () =>
    set_suspension_state("suspended"),
  );
}
