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

vi.mock("@/services/low_network_state", () => ({
  is_low_network: () => false,
}));

vi.mock("@/hooks/email_list_cache", () => ({
  mark_view_stale: vi.fn(),
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
import { request_cache } from "@/services/api/request_cache";

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
    last_definitions_refresh_at: number;
  };
}

function set_visibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

describe("sync_client folder and tag definition events", () => {
  const counts = { folders: 0, tags: 0, stale: 0 };
  const on_folders = () => {
    counts.folders += 1;
  };
  const on_tags = () => {
    counts.tags += 1;
  };
  const on_stale = () => {
    counts.stale += 1;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    counts.folders = 0;
    counts.tags = 0;
    counts.stale = 0;
    set_visibility("visible");
    vi.stubGlobal("WebSocket", FakeSocket);
    window.addEventListener(MAIL_EVENTS.FOLDERS_CHANGED, on_folders);
    window.addEventListener(MAIL_EVENTS.TAGS_CHANGED, on_tags);
    window.addEventListener(MAIL_EVENTS.DEFINITIONS_STALE, on_stale);
  });

  afterEach(() => {
    sync_client.disconnect();
    window.removeEventListener(MAIL_EVENTS.FOLDERS_CHANGED, on_folders);
    window.removeEventListener(MAIL_EVENTS.TAGS_CHANGED, on_tags);
    window.removeEventListener(MAIL_EVENTS.DEFINITIONS_STALE, on_stale);
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

  function deliver(socket: FakeSocket, message: unknown): void {
    socket.onmessage?.({ data: JSON.stringify(message) });
  }

  it("announces a folder change pushed by the server", async () => {
    const socket = await connect_first_time();

    deliver(socket, { type: "folders_changed" });

    expect(counts.folders).toBe(1);
    expect(counts.tags).toBe(0);
  });

  it("announces a tag change pushed by the server", async () => {
    const socket = await connect_first_time();

    deliver(socket, { type: "tags_changed" });

    expect(counts.tags).toBe(1);
    expect(counts.folders).toBe(0);
  });

  it("drops the cached folder list when the server reports a folder change", async () => {
    const socket = await connect_first_time();
    const invalidate = vi.spyOn(request_cache, "invalidate");

    deliver(socket, { type: "folders_changed" });

    expect(invalidate).toHaveBeenCalledWith("/mail/v1/labels");
    invalidate.mockRestore();
  });

  it("drops the cached label list when the server reports a label change", async () => {
    const socket = await connect_first_time();
    const invalidate = vi.spyOn(request_cache, "invalidate");

    deliver(socket, { type: "tags_changed" });

    expect(invalidate).toHaveBeenCalledWith("/mail/v1/tags");
    invalidate.mockRestore();
  });

  it("ignores a message type it does not know", async () => {
    const socket = await connect_first_time();

    expect(() =>
      deliver(socket, { type: "definitions_of_the_future" }),
    ).not.toThrow();

    expect(counts.folders).toBe(0);
    expect(counts.tags).toBe(0);
    expect(counts.stale).toBe(0);
  });

  it("does not refresh definitions on the first connection", async () => {
    await connect_first_time();

    expect(counts.stale).toBe(0);
  });

  it("refreshes definitions once the socket reconnects", async () => {
    const first = await connect_first_time();

    first.close();
    sync_client.on_wake();
    await Promise.resolve();
    counts.stale = 0;

    const second = FakeSocket.instances.at(-1)!;

    expect(second).not.toBe(first);
    second.open_and_authenticate();

    expect(counts.stale).toBe(1);
    expect(counts.folders).toBe(0);
    expect(counts.tags).toBe(0);
  });

  it("refreshes definitions on wake at most once per interval", async () => {
    await connect_first_time();

    sync_client.on_wake();
    sync_client.on_wake();

    expect(counts.stale).toBe(1);

    vi.advanceTimersByTime(29_000);
    sync_client.on_wake();

    expect(counts.stale).toBe(1);

    vi.advanceTimersByTime(1_000);
    sync_client.on_wake();

    expect(counts.stale).toBe(2);
  });

  it("does not refresh definitions while the page is hidden", async () => {
    await connect_first_time();
    set_visibility("hidden");

    sync_client.on_wake();

    expect(counts.stale).toBe(0);
    expect(client_internals().last_definitions_refresh_at).toBe(0);
  });

  it("does not refresh definitions after the client disconnects", async () => {
    await connect_first_time();
    sync_client.disconnect();

    sync_client.on_wake();

    expect(counts.stale).toBe(0);
  });
});
