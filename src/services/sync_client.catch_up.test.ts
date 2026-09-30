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

vi.mock("./session_timeout_service", () => ({
  refresh_session_activity: vi.fn(),
}));

vi.mock("./routing/connection_store", () => ({
  connection_store: { get_method: () => "direct" },
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

import { sync_client } from "./sync_client";

import { MAIL_EVENTS } from "@/hooks/mail_events";

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
    socket: FakeSocket | null;
  };
}

describe("sync_client catch-up after a reconnect", () => {
  let soft_refreshes = 0;
  const on_soft_refresh = () => {
    soft_refreshes += 1;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    soft_refreshes = 0;
    hoisted.sync_recent.mockClear();
    vi.stubGlobal("WebSocket", FakeSocket);
    window.addEventListener(MAIL_EVENTS.MAIL_SOFT_REFRESH, on_soft_refresh);
  });

  afterEach(() => {
    sync_client.disconnect();
    window.removeEventListener(MAIL_EVENTS.MAIL_SOFT_REFRESH, on_soft_refresh);
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

  it("does not catch up on the first connection of a session", async () => {
    await connect_first_time();

    expect(hoisted.sync_recent).not.toHaveBeenCalled();
    expect(soft_refreshes).toBe(0);
  });

  it("catches up after a wake reconnect that starts from attempt zero", async () => {
    const first = await connect_first_time();

    first.close();
    client_internals().last_catch_up_at = 0;

    sync_client.on_wake();
    expect(client_internals().reconnect_attempt).toBe(0);
    await Promise.resolve();

    const second = FakeSocket.instances.at(-1)!;

    expect(second).not.toBe(first);
    second.open_and_authenticate();

    expect(hoisted.sync_recent).toHaveBeenCalledWith(true);
    expect(soft_refreshes).toBe(1);
  });

  it("catches up on wake when the socket is live but has been quiet", async () => {
    await connect_first_time();
    client_internals().last_catch_up_at = Date.now() - 61_000;

    sync_client.on_wake();

    expect(hoisted.sync_recent).toHaveBeenCalledTimes(1);
    expect(hoisted.sync_recent).toHaveBeenCalledWith(true);
  });

  it("skips the wake catch-up when a live socket delivered mail recently", async () => {
    await connect_first_time();
    client_internals().last_catch_up_at = Date.now();

    sync_client.on_wake();

    expect(hoisted.sync_recent).not.toHaveBeenCalled();
  });

  it("polls the newest page while the socket is down", async () => {
    const socket = await connect_first_time();

    socket.close();
    client_internals().last_catch_up_at = Date.now() - 120_000;

    vi.advanceTimersByTime(60_000);

    expect(hoisted.sync_recent).toHaveBeenCalledWith(true);
  });

  it("refetches when a push arrives while the page is open", async () => {
    await connect_first_time();

    sync_client.catch_up_now();

    expect(hoisted.sync_recent).toHaveBeenCalledTimes(1);
  });
});
