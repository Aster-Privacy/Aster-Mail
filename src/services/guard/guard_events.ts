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
import type { GuardHeldInfo } from "@/services/api/client/helpers";

import { GUARD_PUSH_SW_MESSAGE } from "@/lib/guard_push";
import { GUARD_HELD_EVENT } from "@/services/api/client/helpers";

export const GUARD_EVENT_NAMES = [
  "sign_in_request",
  "change_held",
  "change_applied",
  "change_cancelled",
  "panic",
  "rescue_started",
  "rescue_vetoed",
  "guard_enabled",
  "prompts_paused",
  "sign_in_approved",
  "sign_in_denied",
  "sign_in_expired",
  "device_added",
  "device_removed",
  "rescue_completed",
  "guard_disabled",
] as const;

export type GuardEventName = (typeof GUARD_EVENT_NAMES)[number];

export interface GuardEvent {
  event: GuardEventName;
  id: string;
  account_id: string;
}

export const GUARD_CHANNEL_NAME = "aster_guard";
export const GUARD_SW_MESSAGE = GUARD_PUSH_SW_MESSAGE;
export const GUARD_DEDUPE_MS = 60_000;

type GuardListener = (event: GuardEvent) => void;

interface ChannelLike {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

export interface GuardEventDeps {
  now: () => number;
  open_channel: () => ChannelLike | null;
  is_known_account: (account_id: string) => Promise<boolean>;
}

function default_open_channel(): ChannelLike | null {
  if (typeof BroadcastChannel === "undefined") return null;

  try {
    return new BroadcastChannel(GUARD_CHANNEL_NAME);
  } catch {
    return null;
  }
}

async function default_is_known_account(account_id: string): Promise<boolean> {
  try {
    const { account_exists } = await import("@/services/account_manager");

    return await account_exists(account_id);
  } catch {
    return false;
  }
}

const default_deps: GuardEventDeps = {
  now: () => Date.now(),
  open_channel: default_open_channel,
  is_known_account: default_is_known_account,
};

const listeners = new Set<GuardListener>();
const seen = new Map<string, number>();
let deps: GuardEventDeps = default_deps;
let channel: ChannelLike | null = null;
let current_account_id: string | null = null;

function is_event_name(value: unknown): value is GuardEventName {
  return (
    typeof value === "string" &&
    (GUARD_EVENT_NAMES as readonly string[]).includes(value)
  );
}

export function parse_guard_event(raw: unknown): GuardEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  if (obj.type !== "guard") return null;
  if (!is_event_name(obj.event)) return null;
  if (typeof obj.id !== "string" || obj.id.length === 0) return null;
  if (typeof obj.account_id !== "string" || obj.account_id.length === 0) {
    return null;
  }

  return { event: obj.event, id: obj.id, account_id: obj.account_id };
}

function first_sighting(event: GuardEvent): boolean {
  const now = deps.now();

  for (const [key, at] of seen) {
    if (now - at >= GUARD_DEDUPE_MS) seen.delete(key);
  }
  const key = `${event.event}:${event.id}`;

  if (seen.has(key)) return false;
  seen.set(key, now);

  return true;
}

function deliver(event: GuardEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      return;
    }
  });
}

function ensure_channel(): ChannelLike | null {
  if (channel) return channel;
  channel = deps.open_channel();
  if (channel) {
    channel.onmessage = (message: MessageEvent) => {
      const event = parse_guard_event(message.data);

      if (event && first_sighting(event)) deliver(event);
    };
  }

  return channel;
}

export function on_guard_event(cb: GuardListener): () => void {
  listeners.add(cb);
  ensure_channel();

  return () => {
    listeners.delete(cb);
  };
}

export function emit_guard_event(event: GuardEvent): boolean {
  if (!first_sighting(event)) return false;
  deliver(event);
  try {
    ensure_channel()?.postMessage({ type: "guard", ...event });
  } catch {
    return true;
  }

  return true;
}

export async function receive_guard_frame(raw: unknown): Promise<boolean> {
  const event = parse_guard_event(raw);

  if (!event) return false;
  if (
    event.account_id !== current_account_id &&
    !(await deps.is_known_account(event.account_id))
  ) {
    return false;
  }

  return emit_guard_event(event);
}

export function set_guard_event_account(account_id: string | null): void {
  current_account_id = account_id;
}

export function guard_held_to_event(
  info: GuardHeldInfo,
  account_id: string,
): GuardEvent {
  return { event: "change_held", id: info.id, account_id };
}

export function start_guard_event_bridge(): () => void {
  const on_held = (event: Event) => {
    const info = (event as CustomEvent<GuardHeldInfo>).detail;

    if (!info?.id || !current_account_id) return;
    emit_guard_event(guard_held_to_event(info, current_account_id));
  };
  const on_sw_message = (event: MessageEvent) => {
    const data = event.data as { type?: unknown; payload?: unknown } | null;

    if (data?.type === GUARD_SW_MESSAGE) void receive_guard_frame(data.payload);
  };
  const sw =
    typeof navigator !== "undefined" && "serviceWorker" in navigator
      ? navigator.serviceWorker
      : null;

  window.addEventListener(GUARD_HELD_EVENT, on_held);
  sw?.addEventListener("message", on_sw_message);
  ensure_channel();

  return () => {
    window.removeEventListener(GUARD_HELD_EVENT, on_held);
    sw?.removeEventListener("message", on_sw_message);
  };
}

export function reset_guard_events_for_tests(
  next: Partial<GuardEventDeps> = {},
): void {
  listeners.clear();
  seen.clear();
  channel?.close();
  channel = null;
  current_account_id = null;
  deps = { ...default_deps, ...next };
}
