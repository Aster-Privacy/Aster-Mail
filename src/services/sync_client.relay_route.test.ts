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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  method: "direct",
  relay_url: null as string | null,
  listeners: [] as Array<() => void>,
  fetch_connection_info: vi.fn(async () => {}),
}));

vi.mock("@/services/category_index", () => ({
  sync_recent: vi.fn(async () => {}),
}));

vi.mock("./api/client", () => ({
  api_client: {
    get_access_token: () => "token",
    refresh_session: async () => {},
    is_authenticated: () => true,
  },
}));

vi.mock("./crypto/prekey_service", () => ({
  check_and_replenish_prekeys: vi.fn(),
}));

vi.mock("./routing/connection_store", () => ({
  connection_store: {
    get_method: () => hoisted.method,
    get_cdn_relay_url: () => hoisted.relay_url,
    fetch_connection_info: hoisted.fetch_connection_info,
    subscribe: (listener: () => void) => {
      hoisted.listeners.push(listener);

      return () => {};
    },
  },
}));

vi.mock("./routing/tauri_proxy_transport", () => ({
  is_tauri_env: () => false,
  tauri_proxy_fetch: vi.fn(),
}));

vi.mock("./crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(),
}));

vi.mock("@/lib/onion_host", () => ({
  is_onion_host: () => false,
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
  LOCKDOWN_CHANGED_EVENT: "astermail:lockdown-changed",
}));

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static opened: FakeSocket[] = [];

  readonly url: string;
  readyState = FakeSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeSocket.opened.push(this);
  }

  send(): void {}

  close(): void {
    this.closed = true;
    this.readyState = FakeSocket.CLOSED;
  }
}

vi.stubGlobal("WebSocket", FakeSocket);

import { sync_client } from "./sync_client";

function notify_route_listeners(): void {
  for (const listener of hoisted.listeners) listener();
}

describe("sync socket routing", () => {
  beforeEach(() => {
    hoisted.method = "direct";
    hoisted.relay_url = null;
    hoisted.fetch_connection_info.mockReset();
    hoisted.fetch_connection_info.mockResolvedValue(undefined);
    FakeSocket.opened = [];
    vi.stubEnv("VITE_API_URL", "https://app.astermail.org/api");
    notify_route_listeners();
  });

  afterEach(() => {
    sync_client.disconnect();
    vi.unstubAllEnvs();
  });

  it("opens the sync socket through the relay in relay mode", () => {
    hoisted.method = "cdn_relay";
    hoisted.relay_url = "https://relay.astermail.org";

    sync_client.connect().catch(() => {});

    return vi.waitFor(() => {
      expect(FakeSocket.opened.map((s) => s.url)).toEqual([
        "wss://relay.astermail.org/ws",
      ]);
    });
  });

  it("never falls back to a direct socket when the relay url is missing", async () => {
    hoisted.method = "cdn_relay";

    await expect(sync_client.connect()).rejects.toThrow(
      /refusing a direct sync connection/,
    );
    expect(hoisted.fetch_connection_info).toHaveBeenCalledTimes(1);
    expect(FakeSocket.opened).toHaveLength(0);
  });

  it("uses the relay once connection info provides it", async () => {
    hoisted.method = "cdn_relay";
    hoisted.fetch_connection_info.mockImplementation(async () => {
      hoisted.relay_url = "https://api.astermail.org";
    });

    sync_client.connect().catch(() => {});

    await vi.waitFor(() => {
      expect(FakeSocket.opened.map((s) => s.url)).toEqual([
        "wss://api.astermail.org/ws",
      ]);
    });
  });

  it("moves an open socket onto the relay when the user switches to it", async () => {
    sync_client.connect().catch(() => {});
    await vi.waitFor(() => expect(FakeSocket.opened).toHaveLength(1));
    const direct = FakeSocket.opened[0];

    expect(direct.url).toBe("wss://app.astermail.org/ws");

    hoisted.method = "cdn_relay";
    hoisted.relay_url = "https://relay.astermail.org";
    notify_route_listeners();

    await vi.waitFor(() => expect(FakeSocket.opened).toHaveLength(2));
    expect(direct.closed).toBe(true);
    expect(FakeSocket.opened[1].url).toBe("wss://relay.astermail.org/ws");
  });

  it("does not reconnect when the route is unchanged", async () => {
    sync_client.connect().catch(() => {});
    await vi.waitFor(() => expect(FakeSocket.opened).toHaveLength(1));

    notify_route_listeners();
    notify_route_listeners();
    await Promise.resolve();

    expect(FakeSocket.opened).toHaveLength(1);
    expect(FakeSocket.opened[0].closed).toBe(false);
  });
});
