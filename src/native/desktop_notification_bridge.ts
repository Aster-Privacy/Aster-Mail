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
const NOTIFICATION_ACTIVATED_EVENT = "aster://notification-activated";

type NotificationOpenListener = (email_id: string) => void;

let active_listener: NotificationOpenListener | null = null;
let queued_email_id: string | null = null;

function is_desktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function deliver_notification_open(email_id: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(email_id)) return;

  if (active_listener) {
    active_listener(email_id);

    return;
  }

  queued_email_id = email_id;
}

export function subscribe_notification_opens(
  listener: NotificationOpenListener,
): () => void {
  active_listener = listener;

  const waiting = queued_email_id;

  queued_email_id = null;
  if (waiting) listener(waiting);
  if (is_desktop()) void drain_pending_open().catch(() => undefined);

  return () => {
    if (active_listener === listener) active_listener = null;
  };
}

export function reset_notification_bridge(): void {
  active_listener = null;
  queued_email_id = null;
}

async function drain_pending_open(): Promise<void> {
  if (!active_listener) return;

  const { invoke } = await import("@tauri-apps/api/core");
  const email_id = await invoke<string | null>(
    "take_pending_notification_open",
  );

  if (email_id) deliver_notification_open(email_id);
}

export async function start_desktop_notification_bridge(): Promise<void> {
  if (!is_desktop()) return;
  try {
    const { listen } = await import("@tauri-apps/api/event");

    await listen(NOTIFICATION_ACTIVATED_EVENT, () => {
      void drain_pending_open().catch(() => undefined);
    });
    await drain_pending_open();
  } catch {
    if (import.meta.env.DEV) {
      console.error("desktop notification bridge unavailable");
    }
  }
}
