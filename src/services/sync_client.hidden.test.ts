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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  sync_recent: vi.fn(async (_notify?: boolean) => {}),
}));

vi.mock("@/services/low_network_state", () => ({
  is_low_network: () => false,
}));

vi.mock("@/hooks/email_list_cache", () => ({
  mark_view_stale: vi.fn(),
}));

vi.mock("@/services/category_index", () => ({
  sync_recent: (...a: unknown[]) => hoisted.sync_recent(...(a as [boolean])),
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
  connection_store: { get_method: () => "direct", subscribe: () => () => {} },
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

import { sync_client, FIRST_RECONNECT_SPREAD_MS } from "./sync_client";
class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }

  open_and_authenticate(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
    this.onmessage?.({ data: JSON.stringify({ type: "auth_success" }) });
  }
}

function client_internals() {
  return sync_client as unknown as {
    should_reconnect: boolean;
    reconnect_attempt: number;
    last_catch_up_at: number;
    reconnect_timeout: ReturnType<typeof setTimeout> | null;
    socket: FakeSocket | null;
  };
}

function set_visibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

describe("sync_client while the window is hidden", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    hoisted.sync_recent.mockClear();
    vi.stubGlobal("WebSocket", FakeSocket);
    set_visibility("visible");
  });

  afterEach(() => {
    sync_client.disconnect();
    set_visibility("visible");
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function connect_first_time(): Promise<FakeSocket> {
    const connecting = sync_client.connect();

    await Promise.resolve();
    const socket = FakeSocket.instances.at(-1)!;

    socket.open_and_authenticate();
    await connecting;

    return socket;
  }

  it("catches up after a reconnect that completes while hidden", async () => {
    const first = await connect_first_time();

    set_visibility("hidden");
    first.close();
    client_internals().last_catch_up_at = Date.now() - 120_000;

    sync_client.reconnect_now();
    await Promise.resolve();
    FakeSocket.instances.at(-1)!.open_and_authenticate();

    expect(hoisted.sync_recent).toHaveBeenCalledWith(true);
  });

  it("does not repeat a hidden catch-up within a minute", async () => {
    await connect_first_time();
    set_visibility("hidden");
    client_internals().last_catch_up_at = Date.now() - 120_000;

    sync_client.catch_up_now();
    sync_client.catch_up_now();
    vi.advanceTimersByTime(30_000);
    sync_client.catch_up_now();

    expect(hoisted.sync_recent).toHaveBeenCalledTimes(1);
  });

  it("polls every five minutes while hidden and the socket is down", async () => {
    const socket = await connect_first_time();

    set_visibility("hidden");
    socket.close();
    client_internals().last_catch_up_at = Date.now();

    vi.advanceTimersByTime(240_000);
    expect(hoisted.sync_recent).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000);
    expect(hoisted.sync_recent).toHaveBeenCalledTimes(1);
  });

  it("polls every fifteen minutes while hidden and the socket is live", async () => {
    const socket = await connect_first_time();

    set_visibility("hidden");
    client_internals().last_catch_up_at = Date.now();

    for (let minute = 0; minute < 14; minute += 1) {
      vi.advanceTimersByTime(60_000);
      socket.onmessage?.({ data: JSON.stringify({ type: "pong" }) });
    }
    expect(hoisted.sync_recent).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000);
    expect(hoisted.sync_recent).toHaveBeenCalledTimes(1);
  });

  it("reconnects after a suspend even though the socket still looks open", async () => {
    const socket = await connect_first_time();

    set_visibility("hidden");
    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
    vi.advanceTimersByTime(60_000);

    expect(socket.readyState).toBe(FakeSocket.CLOSED);
    expect(FakeSocket.instances.length).toBeGreaterThan(1);

    await Promise.resolve();
    FakeSocket.instances.at(-1)!.open_and_authenticate();

    expect(hoisted.sync_recent).toHaveBeenCalledWith(true);
  });

  it("recovers a socket that never finishes closing", async () => {
    const socket = await connect_first_time();

    set_visibility("hidden");
    socket.onclose = null;
    socket.readyState = FakeSocket.CLOSING;

    vi.advanceTimersByTime(60_000);
    expect(client_internals().reconnect_timeout).not.toBeNull();

    vi.advanceTimersByTime(3_000 + FIRST_RECONNECT_SPREAD_MS);
    await Promise.resolve();

    const replacement = FakeSocket.instances.at(-1)!;

    expect(replacement).not.toBe(socket);
    expect(replacement.readyState).toBe(FakeSocket.CONNECTING);
  });
});
