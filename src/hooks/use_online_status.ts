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
import { useState, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

interface OnlineStatusState {
  is_online: boolean;
  was_offline: boolean;
}

const subscribers = new Set<(is_online: boolean) => void>();
let current_status = typeof navigator !== "undefined" ? navigator.onLine : true;
let was_ever_offline = false;
let listeners_attached = false;
let native_listener_cleanup: (() => void) | null = null;

function broadcast(is_online: boolean): void {
  current_status = is_online;
  if (!is_online) {
    was_ever_offline = true;
  }
  subscribers.forEach((fn) => fn(is_online));
}

function handle_online(): void {
  broadcast(true);
}

function handle_offline(): void {
  broadcast(false);
}

async function attach_listeners(): Promise<void> {
  if (listeners_attached || typeof window === "undefined") return;
  listeners_attached = true;

  window.addEventListener("online", handle_online);
  window.addEventListener("offline", handle_offline);

  if (Capacitor.isNativePlatform()) {
    try {
      const { Network } = await import("@capacitor/network");
      const status = await Network.getStatus();

      broadcast(status.connected);

      const handle = await Network.addListener("networkStatusChange", (s) =>
        broadcast(s.connected),
      );

      native_listener_cleanup = () => handle.remove();
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
    }
  }
}

function detach_listeners(): void {
  if (!listeners_attached || typeof window === "undefined") return;
  window.removeEventListener("online", handle_online);
  window.removeEventListener("offline", handle_offline);
  if (native_listener_cleanup) {
    native_listener_cleanup();
    native_listener_cleanup = null;
  }
  listeners_attached = false;
}

export function use_online_status(): OnlineStatusState {
  const [state, set_state] = useState<OnlineStatusState>({
    is_online: current_status,
    was_offline: was_ever_offline,
  });

  useEffect(() => {
    const handler = (is_online: boolean) => {
      set_state({
        is_online,
        was_offline: was_ever_offline,
      });
    };

    subscribers.add(handler);

    if (subscribers.size === 1) {
      attach_listeners();
    }

    set_state({
      is_online: current_status,
      was_offline: was_ever_offline,
    });

    return () => {
      subscribers.delete(handler);
      if (subscribers.size === 0) {
        detach_listeners();
      }
    };
  }, []);

  return state;
}

export function get_online_status(): boolean {
  return current_status;
}

export function use_offline_ready(): {
  is_ready: boolean;
  check_ready: () => Promise<boolean>;
} {
  const [is_ready, set_is_ready] = useState(false);

  const check_ready = useCallback(async (): Promise<boolean> => {
    if (!("serviceWorker" in navigator)) {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const ready = registration.active !== null;

      set_is_ready(ready);

      return ready;
    } catch {
      set_is_ready(false);

      return false;
    }
  }, []);

  useEffect(() => {
    check_ready();
  }, [check_ready]);

  return { is_ready, check_ready };
}
