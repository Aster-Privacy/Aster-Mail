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

export interface GuardPushStrings {
  guard_sign_in?: unknown;
  guard_activity?: unknown;
}

export interface GuardPushPayload {
  type: "guard";
  event: string;
  id: string;
  account_id: string;
}

export function read_guard_push(data: unknown): GuardPushPayload | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  if (obj.type !== "guard") return null;
  if (typeof obj.event !== "string" || !obj.event) return null;
  if (typeof obj.id !== "string" || !obj.id) return null;
  if (typeof obj.account_id !== "string" || !obj.account_id) return null;

  return {
    type: "guard",
    event: obj.event,
    id: obj.id,
    account_id: obj.account_id,
  };
}

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

const GUARD_SILENT_EVENTS = new Set(["sign_in_denied", "sign_in_expired"]);

export function guard_push_resolved_tag(
  payload: GuardPushPayload,
): string | null {
  if (!GUARD_RESOLVING_EVENTS.has(payload.event)) return null;

  return guard_push_tag({ ...payload, event: "sign_in_request" });
}

export function guard_push_is_silent(payload: GuardPushPayload): boolean {
  return GUARD_SILENT_EVENTS.has(payload.event);
}
