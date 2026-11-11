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

const LEGACY_ACCESS_KEY = "aster_access_token";
const LEGACY_REFRESH_KEY = "aster_refresh_token";

function fake_backends(available: boolean) {
  const secure_values = new Map<string, string>();
  const legacy_values = new Map<string, string>();
  const secure = {
    is_available: vi.fn(async () => available),
    read: vi.fn(async (slot: string) => secure_values.get(slot) ?? null),
    write: vi.fn(async (slot: string, value: string) => {
      secure_values.set(slot, value);
    }),
    remove: vi.fn(async (slot: string) => {
      secure_values.delete(slot);
    }),
  };
  const legacy = {
    get: vi.fn(async (key: string) => legacy_values.get(key) ?? null),
    remove: vi.fn(async (key: string) => {
      legacy_values.delete(key);
    }),
  };

  return { secure, legacy, secure_values, legacy_values };
}

async function load_module() {
  vi.resetModules();

  return await import("./native_token_store");
}

describe("native session token store", () => {
  beforeEach(() => {
    env.native = false;
    env.plugin = true;
    vault.credentials.clear();
    vault.preferences.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes tokens to the secure backend and keeps them in memory", async () => {
    const { create_native_token_store, native_token_slot } =
      await load_module();
    const fakes = fake_backends(true);
    const store = create_native_token_store({
      slot_prefix: "test",
      secure: fakes.secure,
      legacy: fakes.legacy,
    });

    await store.persist("access", "access.value");
    await store.persist("refresh", "refresh.value");

    expect(fakes.secure_values.get(native_token_slot("test", "access"))).toBe(
      "access.value",
    );
    expect(fakes.secure_values.get(native_token_slot("test", "refresh"))).toBe(
      "refresh.value",
    );
    expect(await store.load("access")).toBe("access.value");
    expect(await store.load("refresh")).toBe("refresh.value");
  });

  it("keeps tokens in memory only when no secure backend exists", async () => {
    const { create_native_token_store } = await load_module();
    const fakes = fake_backends(false);
    const store = create_native_token_store({
      slot_prefix: "test",
      secure: fakes.secure,
      legacy: fakes.legacy,
    });

    await store.persist("access", "access.value");

    expect(fakes.secure.write).not.toHaveBeenCalled();
    expect(await store.load("access")).toBe("access.value");

    const restarted = create_native_token_store({
      slot_prefix: "test",
      secure: fakes.secure,
      legacy: fakes.legacy,
    });

    expect(await restarted.load("access")).toBeNull();
  });

  it("moves legacy preference tokens into the secure backend and deletes them", async () => {
    const { create_native_token_store, native_token_slot } =
      await load_module();
    const fakes = fake_backends(true);

    fakes.legacy_values.set(LEGACY_ACCESS_KEY, "legacy.access");
    fakes.legacy_values.set(LEGACY_REFRESH_KEY, "legacy.refresh");
    const store = create_native_token_store({
      slot_prefix: "test",
      secure: fakes.secure,
      legacy: fakes.legacy,
    });

    expect(await store.load("access")).toBe("legacy.access");
    expect(await store.load("refresh")).toBe("legacy.refresh");
    expect(fakes.secure_values.get(native_token_slot("test", "access"))).toBe(
      "legacy.access",
    );
    expect(fakes.secure_values.get(native_token_slot("test", "refresh"))).toBe(
      "legacy.refresh",
    );
    expect(fakes.legacy_values.size).toBe(0);
  });

  it("deletes legacy tokens even when no secure backend exists", async () => {
    const { create_native_token_store } = await load_module();
    const fakes = fake_backends(false);

    fakes.legacy_values.set(LEGACY_REFRESH_KEY, "legacy.refresh");
    const store = create_native_token_store({
      slot_prefix: "test",
      secure: fakes.secure,
      legacy: fakes.legacy,
    });

    expect(await store.load("refresh")).toBe("legacy.refresh");
    expect(fakes.legacy_values.size).toBe(0);
    expect(fakes.secure.write).not.toHaveBeenCalled();
  });

  it("keeps a newer secure token instead of an older legacy copy", async () => {
    const { create_native_token_store, native_token_slot } =
      await load_module();
    const fakes = fake_backends(true);

    fakes.secure_values.set(native_token_slot("test", "access"), "current");
    fakes.legacy_values.set(LEGACY_ACCESS_KEY, "stale");
    const store = create_native_token_store({
      slot_prefix: "test",
      secure: fakes.secure,
      legacy: fakes.legacy,
    });

    expect(await store.load("access")).toBe("current");
    expect(fakes.legacy_values.size).toBe(0);
  });

  it("does not let migration overwrite a token stored in this session", async () => {
    const { create_native_token_store, native_token_slot } =
      await load_module();
    const fakes = fake_backends(true);

    fakes.legacy_values.set(LEGACY_ACCESS_KEY, "stale");
    const store = create_native_token_store({
      slot_prefix: "test",
      secure: fakes.secure,
      legacy: fakes.legacy,
    });
    const loaded = store.load("access");

    await store.persist("access", "fresh");

    expect(await loaded).toBe("stale");
    expect(await store.load("access")).toBe("fresh");
    expect(fakes.secure_values.get(native_token_slot("test", "access"))).toBe(
      "fresh",
    );
    expect(fakes.legacy_values.size).toBe(0);
  });

  it("clears memory, the secure backend, and any legacy copy", async () => {
    const { create_native_token_store } = await load_module();
    const fakes = fake_backends(true);
    const store = create_native_token_store({
      slot_prefix: "test",
      secure: fakes.secure,
      legacy: fakes.legacy,
    });

    await store.persist("access", "a");
    await store.persist("refresh", "r");
    await store.clear_all();

    expect(fakes.secure_values.size).toBe(0);
    expect(await store.load("access")).toBeNull();
    expect(await store.load("refresh")).toBeNull();
    expect(fakes.legacy.remove).toHaveBeenCalledWith(LEGACY_ACCESS_KEY);
    expect(fakes.legacy.remove).toHaveBeenCalledWith(LEGACY_REFRESH_KEY);
  });

  it("never writes tokens to preferences on a native build", async () => {
    env.native = true;
    const set_spy = vi.spyOn(vault.preferences_api, "set");
    const { native_token_store } = await load_module();

    await native_token_store.persist("access", "native.access");
    await native_token_store.persist("refresh", "native.refresh");

    expect(set_spy).not.toHaveBeenCalled();
    expect(vault.preferences.size).toBe(0);
    expect([...vault.credentials.values()].sort()).toEqual([
      "native.access",
      "native.refresh",
    ]);
  });

  it("migrates preference tokens left by an older native build", async () => {
    env.native = true;
    vault.preferences.set(LEGACY_ACCESS_KEY, "old.access");
    vault.preferences.set(LEGACY_REFRESH_KEY, "old.refresh");
    vault.preferences.set("unrelated", "kept");
    const { native_token_store } = await load_module();

    expect(await native_token_store.load("access")).toBe("old.access");
    expect(await native_token_store.load("refresh")).toBe("old.refresh");
    expect(vault.preferences.has(LEGACY_ACCESS_KEY)).toBe(false);
    expect(vault.preferences.has(LEGACY_REFRESH_KEY)).toBe(false);
    expect(vault.preferences.get("unrelated")).toBe("kept");
    expect([...vault.credentials.values()].sort()).toEqual([
      "old.access",
      "old.refresh",
    ]);
  });

  it("keeps tokens in memory when the native build has no secure plugin", async () => {
    env.native = true;
    env.plugin = false;
    vault.preferences.set(LEGACY_ACCESS_KEY, "old.access");
    const { native_token_store } = await load_module();

    expect(await native_token_store.load("access")).toBe("old.access");
    await native_token_store.persist("refresh", "new.refresh");

    expect(vault.preferences.size).toBe(0);
    expect(vault.credentials.size).toBe(0);
    expect(await native_token_store.load("refresh")).toBe("new.refresh");
  });

  it("does not touch preferences or the plugin on the web", async () => {
    const get_spy = vi.spyOn(vault.preferences_api, "get");
    const set_spy = vi.spyOn(vault.preferences_api, "set");
    const { native_token_store } = await load_module();

    expect(await native_token_store.load("access")).toBeNull();

    expect(get_spy).not.toHaveBeenCalled();
    expect(set_spy).not.toHaveBeenCalled();
    expect(vault.credentials.size).toBe(0);
  });
});
