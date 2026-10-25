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

const state = vi.hoisted(() => ({
  method: "direct",
  relay_url: null as string | null,
}));

vi.mock("./connection_store", () => ({
  connection_store: {
    get_method: () => state.method,
    get_cdn_relay_url: () => state.relay_url,
  },
}));

vi.mock("./tauri_proxy_transport", () => ({
  is_tauri_env: () => false,
  tauri_proxy_fetch: vi.fn(),
}));

import { resolve_sync_socket_url } from "./sync_socket_url";

describe("sync socket url", () => {
  beforeEach(() => {
    state.method = "direct";
    state.relay_url = null;
    vi.stubEnv("VITE_API_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("connects through the CDN relay in relay mode", () => {
    state.method = "cdn_relay";
    state.relay_url = "https://relay.astermail.org";

    expect(resolve_sync_socket_url()).toBe("wss://relay.astermail.org/ws");
  });

  it("ignores a trailing slash on the relay url", () => {
    state.method = "cdn_relay";
    state.relay_url = "https://relay.astermail.org/";

    expect(resolve_sync_socket_url()).toBe("wss://relay.astermail.org/ws");
  });

  it("refuses a direct connection when the relay url is missing", () => {
    state.method = "cdn_relay";

    expect(resolve_sync_socket_url()).toBeNull();
  });

  it("refuses a relay outside the allowed hosts", () => {
    state.method = "cdn_relay";
    state.relay_url = "https://relay.example.com";

    expect(resolve_sync_socket_url()).toBeNull();

    state.relay_url = "http://relay.astermail.org";

    expect(resolve_sync_socket_url()).toBeNull();
  });

  it("uses the configured api host in direct mode", () => {
    vi.stubEnv("VITE_API_URL", "https://app.astermail.org/api");

    expect(resolve_sync_socket_url()).toBe("wss://app.astermail.org/ws");
  });

  it("uses the desktop api host in the desktop app", () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });

    expect(resolve_sync_socket_url()).toBe("wss://app.astermail.org/ws");
  });

  it("falls back to the page host", () => {
    expect(resolve_sync_socket_url()).toBe(`ws://${window.location.host}/ws`);
  });
});
