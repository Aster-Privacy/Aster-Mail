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

const env = vi.hoisted(() => ({ native: false, plugin: true }));

const vault = vi.hoisted(() => {
  const credentials = new Map<string, string>();
  const preferences = new Map<string, string>();
  const plugin = {
    getCredentials: async ({ server }: { server: string }) => {
      const password = credentials.get(server);

      if (password === undefined) throw new Error("missing");

      return { username: "aster_session", password };
    },
    setCredentials: async ({
      password,
      server,
    }: {
      username: string;
      password: string;
      server: string;
    }) => {
      credentials.set(server, password);
    },
    deleteCredentials: async ({ server }: { server: string }) => {
      credentials.delete(server);
    },
  };
  const preferences_api = {
    get: async ({ key }: { key: string }) => ({
      value: preferences.get(key) ?? null,
    }),
    set: async ({ key, value }: { key: string; value: string }) => {
      preferences.set(key, value);
    },
    remove: async ({ key }: { key: string }) => {
      preferences.delete(key);
    },
    clear: async () => {
      preferences.clear();
    },
  };

  return { credentials, preferences, plugin, preferences_api };
});

vi.mock("@capacitor/preferences", () => ({
  Preferences: vault.preferences_api,
}));

vi.mock("@capacitor/core", async (import_original) => {
  const actual = await import_original<typeof import("@capacitor/core")>();

  return {
    ...actual,
    Capacitor: {
      ...actual.Capacitor,
      isNativePlatform: () => env.native,
      getPlatform: () => (env.native ? "android" : "web"),
      isPluginAvailable: (name: string) =>
        env.native && env.plugin && name === "NativeBiometric",
    },
  };
});

vi.mock("capacitor-native-biometric", () => ({
  NativeBiometric: vault.plugin,
}));

vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch: vi.fn(),
  get_effective_base_url: (default_base_url: string) => default_base_url,
  get_effective_timeout: (default_timeout: number) => default_timeout,
  get_effective_retry_count: () => 0,
  get_effective_retry_delay: () => 1,
}));

vi.mock("@/services/account_manager", () => ({
  update_account_tokens: async () => true,
  get_current_account_id: async () => null,
  get_account_tokens: async () => ({ access_token: null, refresh_token: null }),
}));

const { NATIVE_TOKEN_KEY, NATIVE_REFRESH_TOKEN_KEY } =
  await import("./client/helpers");
const { ApiClient } = await import("./client/api_client");

describe("native session tokens in the api client", () => {
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    env.native = false;
    env.plugin = true;
    vault.credentials.clear();
    vault.preferences.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores native tokens in the secure store and never in preferences", async () => {
    env.native = true;
    const set_spy = vi.spyOn(vault.preferences_api, "set");
    const client = new ApiClient();

    client.set_dev_token("native.access", "native.refresh");
    await vi.waitFor(() => {
      expect([...vault.credentials.values()].sort()).toEqual([
        "native.access",
        "native.refresh",
      ]);
    });

    const token_writes = set_spy.mock.calls.filter(
      ([options]) =>
        options.key === NATIVE_TOKEN_KEY ||
        options.key === NATIVE_REFRESH_TOKEN_KEY,
    );

    expect(token_writes).toEqual([]);
    expect(vault.preferences.has(NATIVE_TOKEN_KEY)).toBe(false);
    expect(vault.preferences.has(NATIVE_REFRESH_TOKEN_KEY)).toBe(false);
  });

  it("removes native tokens from the secure store when the session is cleared", async () => {
    env.native = true;
    const client = new ApiClient();

    client.set_dev_token("native.access", "native.refresh");
    await vi.waitFor(() => {
      expect(vault.credentials.size).toBe(2);
    });
    client.clear_dev_token();
    await vi.waitFor(() => {
      expect(vault.credentials.size).toBe(0);
    });
  });

  it("leaves the web build away from preferences and the secure store", async () => {
    const get_spy = vi.spyOn(vault.preferences_api, "get");
    const set_spy = vi.spyOn(vault.preferences_api, "set");
    const client = new ApiClient();

    client.set_dev_token("web.access", "web.refresh");
    client.clear_dev_token();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(get_spy).not.toHaveBeenCalled();
    expect(set_spy).not.toHaveBeenCalled();
    expect(vault.credentials.size).toBe(0);
  });
});
