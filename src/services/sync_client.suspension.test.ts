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

import {
  ACCOUNT_SUSPENDED_EVENT,
  reset_suspension_state,
  set_suspension_state,
} from "@/lib/suspension_state";

describe("sync socket for a suspended account", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.opened = [];
    vi.stubEnv("VITE_API_URL", "https://app.astermail.org/api");
    reset_suspension_state();
  });

  afterEach(() => {
    sync_client.disconnect();
    reset_suspension_state();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("never opens a socket once the account is known to be suspended", async () => {
    set_suspension_state("suspended");

    await expect(sync_client.connect()).rejects.toThrow(/suspended/);
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(FakeSocket.opened).toHaveLength(0);
  });

  it("stops retrying when a suspension arrives after the socket was refused", async () => {
    const pending = sync_client.connect().catch(() => {});

    await vi.waitFor(() => expect(FakeSocket.opened).toHaveLength(1));
    const refused = FakeSocket.opened[0];

    refused.onerror?.();
    refused.readyState = FakeSocket.CLOSED;
    refused.onclose?.();
    await pending;

    window.dispatchEvent(new CustomEvent(ACCOUNT_SUSPENDED_EVENT));
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(FakeSocket.opened).toHaveLength(1);
  });

  it("closes a live socket when the account becomes suspended", async () => {
    sync_client.connect().catch(() => {});
    await vi.waitFor(() => expect(FakeSocket.opened).toHaveLength(1));
    const live = FakeSocket.opened[0];

    set_suspension_state("suspended");
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(live.closed).toBe(true);
    expect(FakeSocket.opened).toHaveLength(1);
  });

  it("reconnects once the suspension is lifted", async () => {
    set_suspension_state("suspended");
    await expect(sync_client.connect()).rejects.toThrow(/suspended/);

    set_suspension_state("active");

    await vi.waitFor(() => expect(FakeSocket.opened).toHaveLength(1));
    expect(FakeSocket.opened[0].url).toBe("wss://app.astermail.org/ws");
  });

  it("keeps reconnecting with backoff for an account in good standing", async () => {
    const pending = sync_client.connect().catch(() => {});

    await vi.waitFor(() => expect(FakeSocket.opened).toHaveLength(1));
    const dropped = FakeSocket.opened[0];

    dropped.onerror?.();
    dropped.readyState = FakeSocket.CLOSED;
    dropped.onclose?.();
    await pending;
    await vi.advanceTimersByTimeAsync(60_000);

    expect(FakeSocket.opened.length).toBeGreaterThan(1);
  });
});
