const SESSION_SYNC_CHANNEL = "aster_session_sync";
const SESSION_VERSION_COOKIE = "aster_session_version";
const CROSS_ORIGIN_CHECK_INTERVAL_MS = 2000;

type SessionSyncMessage =
  | { type: "session_expired" }
  | { type: "logout" }
  | { type: "logout_all" }
  | { type: "login" };

let broadcast_channel: BroadcastChannel | null = null;
let cross_origin_interval_id: number | null = null;
let last_known_version: string | null = null;
let cross_origin_callback: (() => void) | null = null;

function get_session_version_cookie(): string | null {
  if (typeof document === "undefined") return null;

  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    const eq_index = trimmed.indexOf("=");
    if (eq_index <= 0) continue;

    const name = trimmed.substring(0, eq_index);
    const value = trimmed.substring(eq_index + 1);

    if (name === SESSION_VERSION_COOKIE && value) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

function set_session_version_cookie(version: string): void {
  if (typeof document === "undefined") return;
  const sanitized = version.replace(/[^a-z0-9_]/gi, "");
  document.cookie = `${SESSION_VERSION_COOKIE}=${sanitized}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

function check_cross_origin_session(): void {
  const current_version = get_session_version_cookie();

  if (current_version !== last_known_version) {
    const is_logout =
      current_version === null || current_version.startsWith("logout_");
    const was_logged_in = last_known_version !== null;

    last_known_version = current_version;

    if ((is_logout && was_logged_in) || current_version?.startsWith("login_")) {
      cross_origin_callback?.();
    }
  }
}

function start_cross_origin_sync(on_change: () => void): () => void {
  cross_origin_callback = on_change;
  last_known_version = get_session_version_cookie();

  if (cross_origin_interval_id === null) {
    cross_origin_interval_id = window.setInterval(
      check_cross_origin_session,
      CROSS_ORIGIN_CHECK_INTERVAL_MS,
    );
  }

  return () => {
    if (cross_origin_interval_id !== null) {
      clearInterval(cross_origin_interval_id);
      cross_origin_interval_id = null;
    }
    cross_origin_callback = null;
  };
}

function get_channel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  if (!broadcast_channel) {
    broadcast_channel = new BroadcastChannel(SESSION_SYNC_CHANNEL);
  }

  return broadcast_channel;
}

export function broadcast_session_expired(): void {
  const channel = get_channel();

  if (channel) {
    const message: SessionSyncMessage = { type: "session_expired" };

    channel.postMessage(message);
  }

  set_session_version_cookie(`logout_${Date.now()}`);
}

export function broadcast_logout(): void {
  const channel = get_channel();

  if (channel) {
    const message: SessionSyncMessage = { type: "logout" };

    channel.postMessage(message);
  }

  set_session_version_cookie(`logout_${Date.now()}`);
  last_known_version = get_session_version_cookie();
}

export function broadcast_logout_all(): void {
  const channel = get_channel();

  if (channel) {
    const message: SessionSyncMessage = { type: "logout_all" };

    channel.postMessage(message);
  }

  set_session_version_cookie(`logout_${Date.now()}`);
  last_known_version = get_session_version_cookie();
}

export function broadcast_login(): void {
  const channel = get_channel();

  if (channel) {
    const message: SessionSyncMessage = { type: "login" };

    channel.postMessage(message);
  }

  set_session_version_cookie(`login_${Date.now()}`);
  last_known_version = get_session_version_cookie();
}

export function subscribe_to_session_sync(
  on_session_expired: () => void,
  on_logout: () => void,
  on_logout_all: () => void,
  on_login?: () => void,
): () => void {
  const channel = get_channel();

  const handler = (event: MessageEvent<SessionSyncMessage>) => {
    switch (event.data.type) {
      case "session_expired":
        on_session_expired();
        break;
      case "logout":
        on_logout();
        break;
      case "logout_all":
        on_logout_all();
        break;
      case "login":
        on_login?.();
        break;
    }
  };

  if (channel) {
    channel.addEventListener("message", handler);
  }

  const unsubscribe_cross_origin = start_cross_origin_sync(() => {
    on_login?.();
  });

  return () => {
    if (channel) {
      channel.removeEventListener("message", handler);
    }
    unsubscribe_cross_origin();
  };
}

export function close_session_sync(): void {
  if (broadcast_channel) {
    broadcast_channel.close();
    broadcast_channel = null;
  }
  if (cross_origin_interval_id !== null) {
    clearInterval(cross_origin_interval_id);
    cross_origin_interval_id = null;
  }
}
