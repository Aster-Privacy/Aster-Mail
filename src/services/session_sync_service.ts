const SESSION_SYNC_CHANNEL = "aster_session_sync";

type SessionSyncMessage =
  | { type: "session_expired" }
  | { type: "logout" }
  | { type: "logout_all" };

let broadcast_channel: BroadcastChannel | null = null;

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
}

export function broadcast_logout(): void {
  const channel = get_channel();

  if (channel) {
    const message: SessionSyncMessage = { type: "logout" };

    channel.postMessage(message);
  }
}

export function broadcast_logout_all(): void {
  const channel = get_channel();

  if (channel) {
    const message: SessionSyncMessage = { type: "logout_all" };

    channel.postMessage(message);
  }
}

export function subscribe_to_session_sync(
  on_session_expired: () => void,
  on_logout: () => void,
  on_logout_all: () => void,
): () => void {
  const channel = get_channel();

  if (!channel) {
    return () => {};
  }

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
    }
  };

  channel.addEventListener("message", handler);

  return () => {
    channel.removeEventListener("message", handler);
  };
}

export function close_session_sync(): void {
  if (broadcast_channel) {
    broadcast_channel.close();
    broadcast_channel = null;
  }
}
