const SESSION_TIMEOUT_KEY = "astermail_session_timeout_config";
const LAST_ACTIVITY_KEY_PREFIX = "astermail_last_activity_";

const DEFAULT_TIMEOUT_MINUTES = 30;
const ACTIVITY_THROTTLE_MS = 30000;

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

interface SessionTimeoutConfig {
  enabled: boolean;
  timeout_minutes: number;
}

let timeout_timer: number | null = null;
let current_config: SessionTimeoutConfig = {
  enabled: true,
  timeout_minutes: DEFAULT_TIMEOUT_MINUTES,
};
let current_account_id: string | null = null;
let activity_listener_attached = false;
let on_timeout_callback: (() => void) | null = null;
let last_activity_update: number = 0;

function get_timeout_ms(): number {
  return current_config.timeout_minutes * 60 * 1000;
}

function get_last_activity_key(account_id?: string): string {
  return (
    LAST_ACTIVITY_KEY_PREFIX + (account_id || current_account_id || "default")
  );
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
  sessionStorage.setItem(get_last_activity_key(), now.toString());
  reset_timeout_timer();
}

function handle_activity(): void {
  update_last_activity();
}

function attach_activity_listeners(): void {
  if (activity_listener_attached) {
    return;
  }
  ACTIVITY_EVENTS.forEach((event) => {
    window.addEventListener(event, handle_activity, { passive: true });
  });
  activity_listener_attached = true;
}

function detach_activity_listeners(): void {
  if (!activity_listener_attached) {
    return;
  }
  ACTIVITY_EVENTS.forEach((event) => {
    window.removeEventListener(event, handle_activity);
  });
  activity_listener_attached = false;
}

function reset_timeout_timer(): void {
  if (timeout_timer !== null) {
    window.clearTimeout(timeout_timer);
    timeout_timer = null;
  }

  if (!current_config.enabled || !current_account_id) {
    return;
  }

  timeout_timer = window.setTimeout(() => {
    trigger_timeout();
  }, get_timeout_ms());
}

function trigger_timeout(): void {
  if (on_timeout_callback) {
    on_timeout_callback();
  }
  window.dispatchEvent(new CustomEvent("astermail:session-timeout"));
}

function load_config_from_storage(): SessionTimeoutConfig {
  try {
    const stored = sessionStorage.getItem(SESSION_TIMEOUT_KEY);

    if (stored) {
      const parsed = JSON.parse(stored);

      return {
        enabled: parsed.enabled ?? true,
        timeout_minutes: parsed.timeout_minutes ?? DEFAULT_TIMEOUT_MINUTES,
      };
    }
  } catch {
    void 0;
  }

  return {
    enabled: true,
    timeout_minutes: DEFAULT_TIMEOUT_MINUTES,
  };
}

export function configure_session_timeout(
  enabled: boolean,
  timeout_minutes: number,
): void {
  const was_enabled = current_config.enabled;

  current_config = {
    enabled,
    timeout_minutes: timeout_minutes || DEFAULT_TIMEOUT_MINUTES,
  };

  try {
    sessionStorage.setItem(SESSION_TIMEOUT_KEY, JSON.stringify(current_config));
  } catch {
    void 0;
  }

  if (enabled && current_account_id) {
    attach_activity_listeners();
    last_activity_update = 0;
    update_last_activity();
  } else if (!enabled) {
    if (timeout_timer !== null) {
      window.clearTimeout(timeout_timer);
      timeout_timer = null;
    }
    if (was_enabled) {
      detach_activity_listeners();
    }
  }
}

export function start_session_timeout(
  account_id: string,
  on_timeout?: () => void,
): void {
  current_account_id = account_id;
  on_timeout_callback = on_timeout || null;

  current_config = load_config_from_storage();

  if (current_config.enabled) {
    attach_activity_listeners();
    last_activity_update = 0;
    update_last_activity();
  }
}

export function stop_session_timeout(): void {
  current_account_id = null;
  on_timeout_callback = null;

  if (timeout_timer !== null) {
    window.clearTimeout(timeout_timer);
    timeout_timer = null;
  }

  detach_activity_listeners();
}

export function check_session_expired(account_id: string): boolean {
  const config = load_config_from_storage();

  if (!config.enabled) {
    return false;
  }

  const last_activity_str = sessionStorage.getItem(
    get_last_activity_key(account_id),
  );

  if (!last_activity_str) {
    return false;
  }

  const last_activity = parseInt(last_activity_str, 10);
  const timeout_ms = config.timeout_minutes * 60 * 1000;

  return Date.now() - last_activity > timeout_ms;
}

export function get_session_timeout_config(): SessionTimeoutConfig {
  return { ...current_config };
}

export function clear_session_timeout_data(account_id: string): void {
  sessionStorage.removeItem(get_last_activity_key(account_id));
}

export function refresh_session_activity(): void {
  if (current_account_id && current_config.enabled) {
    last_activity_update = 0;
    update_last_activity();
  }
}
