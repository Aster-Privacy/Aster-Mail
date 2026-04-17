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
const SESSION_TIMEOUT_KEY = "astermail_session_timeout_config";
const LAST_ACTIVITY_KEY_PREFIX = "astermail_last_activity_";

const DEFAULT_TIMEOUT_MINUTES = 30;
const MIN_TIMEOUT_MINUTES = 5;
const ACTIVITY_THROTTLE_MS = 30000;
const DEFAULT_ENABLED = false;

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
  "focus",
  "pointerdown",
  "wheel",
];

interface SessionTimeoutConfig {
  enabled: boolean;
  timeout_minutes: number;
}

let timeout_timer: number | null = null;
let current_config: SessionTimeoutConfig = {
  enabled: DEFAULT_ENABLED,
  timeout_minutes: DEFAULT_TIMEOUT_MINUTES,
};
let current_account_id: string | null = null;
let on_timeout_callback: (() => void) | null = null;
let activity_listener_attached = false;
let storage_listener_attached = false;
let last_activity_update: number = 0;

function get_timeout_ms(): number {
  return current_config.timeout_minutes * 60 * 1000;
}

function get_last_activity_key(account_id?: string): string {
  return (
    LAST_ACTIVITY_KEY_PREFIX + (account_id || current_account_id || "default")
  );
}

function read_last_activity(): number | null {
  try {
    const stored = localStorage.getItem(get_last_activity_key());

    if (stored) {
      const timestamp = parseInt(stored, 10);

      if (!isNaN(timestamp) && timestamp > 0) {
        return timestamp;
      }
    }
  } catch {}

  return null;
}

function write_last_activity(timestamp: number): void {
  try {
    localStorage.setItem(get_last_activity_key(), timestamp.toString());
  } catch {}
}

function clear_timer(): void {
  if (timeout_timer !== null) {
    window.clearTimeout(timeout_timer);
    timeout_timer = null;
  }
}

function schedule_timer(delay_ms: number): void {
  clear_timer();
  if (delay_ms <= 0) {
    trigger_timeout();

    return;
  }
  timeout_timer = window.setTimeout(trigger_timeout, delay_ms);
}

function schedule_from_last_activity(): void {
  if (!current_config.enabled || !current_account_id) {
    clear_timer();

    return;
  }

  const last_activity = read_last_activity();

  if (!last_activity) {
    const now = Date.now();

    write_last_activity(now);
    schedule_timer(get_timeout_ms());

    return;
  }

  const elapsed = Date.now() - last_activity;
  const timeout = get_timeout_ms();

  if (elapsed >= timeout) {
    trigger_timeout();
  } else {
    schedule_timer(timeout - elapsed);
  }
}

function trigger_timeout(): void {
  clear_timer();

  if (!current_config.enabled || !current_account_id) {
    return;
  }

  const last_activity = read_last_activity();

  if (last_activity) {
    const elapsed = Date.now() - last_activity;
    const timeout = get_timeout_ms();

    if (elapsed < timeout) {
      schedule_timer(timeout - elapsed);

      return;
    }
  }

  detach_activity_listeners();
  detach_storage_listener();

  if (on_timeout_callback) {
    on_timeout_callback();
  }
  window.dispatchEvent(new CustomEvent("astermail:session-timeout"));
}

function update_last_activity(): void {
  if (!current_config.enabled || !current_account_id) {
    return;
  }

  const now = Date.now();

  if (now - last_activity_update < ACTIVITY_THROTTLE_MS) {
    return;
  }

  last_activity_update = now;
  write_last_activity(now);
  schedule_timer(get_timeout_ms());
}

function handle_activity(): void {
  update_last_activity();
}

function handle_visibility_change(): void {
  if (!current_config.enabled || !current_account_id) {
    return;
  }

  if (document.visibilityState === "visible") {
    last_activity_update = 0;
    update_last_activity();
  }
}

function handle_storage_event(event: StorageEvent): void {
  if (!current_config.enabled || !current_account_id) {
    return;
  }

  if (event["key"] === get_last_activity_key() && event.newValue) {
    const timestamp = parseInt(event.newValue, 10);

    if (!isNaN(timestamp) && timestamp > 0) {
      last_activity_update = timestamp;
      const elapsed = Date.now() - timestamp;
      const timeout = get_timeout_ms();

      if (elapsed < timeout) {
        schedule_timer(timeout - elapsed);
      }
    }
  }

  if (event["key"] === SESSION_TIMEOUT_KEY && event.newValue) {
    try {
      const config = JSON.parse(event.newValue) as SessionTimeoutConfig;

      current_config = {
        enabled: config.enabled,
        timeout_minutes: Math.max(
          MIN_TIMEOUT_MINUTES,
          config.timeout_minutes || DEFAULT_TIMEOUT_MINUTES,
        ),
      };
      if (current_config.enabled && current_account_id) {
        schedule_from_last_activity();
      } else if (!current_config.enabled) {
        clear_timer();
      }
    } catch {}
  }
}

function attach_activity_listeners(): void {
  if (activity_listener_attached) {
    return;
  }
  ACTIVITY_EVENTS.forEach((event) => {
    window.addEventListener(event, handle_activity, { passive: true });
  });
  document.addEventListener("visibilitychange", handle_visibility_change);
  activity_listener_attached = true;
}

function detach_activity_listeners(): void {
  if (!activity_listener_attached) {
    return;
  }
  ACTIVITY_EVENTS.forEach((event) => {
    window.removeEventListener(event, handle_activity);
  });
  document.removeEventListener("visibilitychange", handle_visibility_change);
  activity_listener_attached = false;
}

function attach_storage_listener(): void {
  if (storage_listener_attached) {
    return;
  }
  window.addEventListener("storage", handle_storage_event);
  storage_listener_attached = true;
}

function detach_storage_listener(): void {
  if (!storage_listener_attached) {
    return;
  }
  window.removeEventListener("storage", handle_storage_event);
  storage_listener_attached = false;
}

function load_config_from_storage(): void {
  try {
    const stored = localStorage.getItem(SESSION_TIMEOUT_KEY);

    if (stored) {
      const config = JSON.parse(stored) as SessionTimeoutConfig;
      const migrated = localStorage.getItem(
        "astermail_session_timeout_migrated_v2",
      );

      current_config = {
        enabled: migrated ? config.enabled : DEFAULT_ENABLED,
        timeout_minutes: Math.max(
          MIN_TIMEOUT_MINUTES,
          config.timeout_minutes || DEFAULT_TIMEOUT_MINUTES,
        ),
      };

      if (!migrated) {
        localStorage.setItem("astermail_session_timeout_migrated_v2", "1");
        localStorage.setItem(
          SESSION_TIMEOUT_KEY,
          JSON.stringify(current_config),
        );
      }
    }
  } catch {}
}

export function configure_session_timeout(
  enabled: boolean,
  timeout_minutes: number,
): void {
  const validated_timeout = Math.max(
    MIN_TIMEOUT_MINUTES,
    timeout_minutes || DEFAULT_TIMEOUT_MINUTES,
  );

  current_config = {
    enabled,
    timeout_minutes: validated_timeout,
  };

  try {
    localStorage.setItem(SESSION_TIMEOUT_KEY, JSON.stringify(current_config));
  } catch {}

  if (enabled && current_account_id) {
    attach_activity_listeners();
    attach_storage_listener();
    last_activity_update = 0;
    update_last_activity();
  } else if (!enabled) {
    clear_timer();
    detach_activity_listeners();
    detach_storage_listener();
  }
}

export function start_session_timeout(
  account_id: string,
  on_timeout?: () => void,
): void {
  if ("__TAURI_INTERNALS__" in window) {
    return;
  }

  stop_session_timeout();

  current_account_id = account_id;
  on_timeout_callback = on_timeout || null;

  load_config_from_storage();

  if (!current_config.enabled) {
    return;
  }

  const now = Date.now();

  write_last_activity(now);
  last_activity_update = now;

  attach_activity_listeners();
  attach_storage_listener();
  schedule_timer(get_timeout_ms());
}

export function stop_session_timeout(): void {
  clear_timer();
  detach_activity_listeners();
  detach_storage_listener();
  current_account_id = null;
  on_timeout_callback = null;
  last_activity_update = 0;
}

export function check_session_expired(account_id: string): boolean {
  if (!current_config.enabled) {
    return false;
  }

  const key = LAST_ACTIVITY_KEY_PREFIX + account_id;

  try {
    const stored = localStorage.getItem(key);

    if (!stored) {
      return false;
    }
    const timestamp = parseInt(stored, 10);

    if (isNaN(timestamp) || timestamp <= 0) {
      return false;
    }

    return Date.now() - timestamp >= get_timeout_ms();
  } catch {
    return false;
  }
}

export function get_session_timeout_config(): SessionTimeoutConfig {
  return { ...current_config };
}

export function clear_session_timeout_data(account_id: string): void {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY_PREFIX + account_id);
  } catch {}
}

export function refresh_session_activity(): void {
  if (current_account_id && current_config.enabled) {
    last_activity_update = 0;
    update_last_activity();
  }
}
