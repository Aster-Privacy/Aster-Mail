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
export const GUARD_PUSH_SW_MESSAGE = "aster_guard_event";
export const GUARD_PUSH_URL = "/inbox";
export const GUARD_PUSH_FALLBACK_SIGN_IN =
  "A new device wants to sign in to your account. Open Aster Mail to review it.";
export const GUARD_PUSH_FALLBACK_ACTIVITY =
  "Your account has new Aster Guard activity. Open Aster Mail to review it.";
export const GUARD_PUSH_FALLBACK_ENDED =
  "A sign-in request on your account ended.";

export interface GuardPushStrings {
  guard_sign_in?: unknown;
  guard_activity?: unknown;
  guard_ended?: unknown;
}

export interface GuardPushPayload {
  type: "guard";
  event: string;
  id: string;
  account_id: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_PATTERN = /^[a-z_]{1,40}$/;

function is_uuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function read_guard_push(data: unknown): GuardPushPayload | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  if (obj.type !== "guard") return null;
  if (typeof obj.event !== "string" || !EVENT_PATTERN.test(obj.event)) {
    return null;
  }
  if (!is_uuid(obj.id)) return null;
  if (!is_uuid(obj.account_id)) return null;

  return {
    type: "guard",
    event: obj.event,
    id: obj.id,
    account_id: obj.account_id,
  };
}

const GUARD_ENDED_EVENTS = new Set(["sign_in_denied", "sign_in_expired"]);

function pick(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

export function guard_push_body(
  payload: GuardPushPayload,
  stored: GuardPushStrings | null,
): string {
  if (payload.event === "sign_in_request") {
    return pick(stored?.guard_sign_in, GUARD_PUSH_FALLBACK_SIGN_IN);
  }
  if (GUARD_ENDED_EVENTS.has(payload.event)) {
    return pick(stored?.guard_ended, GUARD_PUSH_FALLBACK_ENDED);
  }

  return pick(stored?.guard_activity, GUARD_PUSH_FALLBACK_ACTIVITY);
}

export function guard_push_tag(payload: GuardPushPayload): string {
  return `guard_${payload.event}_${payload.id}`;
}

const GUARD_RESOLVING_EVENTS = new Set([
  "sign_in_approved",
  "sign_in_denied",
  "sign_in_expired",
]);

export function guard_push_resolved_tag(
  payload: GuardPushPayload,
): string | null {
  if (!GUARD_RESOLVING_EVENTS.has(payload.event)) return null;

  return guard_push_tag({ ...payload, event: "sign_in_request" });
}

export function guard_push_is_ended(payload: GuardPushPayload): boolean {
  return GUARD_ENDED_EVENTS.has(payload.event);
}

export function guard_push_notification_tag(payload: GuardPushPayload): string {
  return guard_push_is_ended(payload)
    ? guard_push_tag({ ...payload, event: "sign_in_request" })
    : guard_push_tag(payload);
}

export interface GuardWindowState {
  focused?: boolean;
  visibilityState?: DocumentVisibilityState;
}

export function guard_window_is_watching(
  windows: readonly GuardWindowState[],
): boolean {
  return windows.some(
    (window) => window.focused === true && window.visibilityState === "visible",
  );
}

export interface GuardPushLedger {
  should_notify: (payload: GuardPushPayload) => boolean;
}

const GUARD_LEDGER_LIMIT = 200;

export function create_guard_push_ledger(): GuardPushLedger {
  const seen = new Map<string, true>();

  const remember = (key: string) => {
    seen.delete(key);
    seen.set(key, true);
    while (seen.size > GUARD_LEDGER_LIMIT) {
      const oldest = seen.keys().next().value;

      if (oldest === undefined) break;
      seen.delete(oldest);
    }
  };

  return {
    should_notify: (payload) => {
      const key = `${payload.account_id}:${payload.id}`;

      if (GUARD_RESOLVING_EVENTS.has(payload.event)) {
        remember(key);

        return false;
      }
      if (payload.event !== "sign_in_request") {
        const event_key = `${key}:${payload.event}`;

        if (seen.has(event_key)) return false;
        remember(event_key);

        return true;
      }
      if (seen.has(key)) return false;
      remember(key);

      return true;
    },
  };
}
