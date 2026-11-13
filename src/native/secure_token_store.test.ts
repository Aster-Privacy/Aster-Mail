//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, vi, beforeEach } from "vitest";

const env = vi.hoisted(() => ({
  available: true,
  plugin_missing: false,
  protected_values: new Map<string, string>(),
  legacy_values: new Map<string, string>(),
  fail_protected_clear: false,
  fail_legacy_clear: false,
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: () => ({
    isAvailable: async () => {
      if (env.plugin_missing) throw new Error("not implemented");

      return { available: env.available };
    },
    set: async ({ key, value }: { key: string; value: string }) => {
      env.protected_values.set(key, value);
    },
    get: async ({ key }: { key: string }) => ({
      value: env.protected_values.get(key) ?? null,
    }),
    remove: async ({ key }: { key: string }) => {
      env.protected_values.delete(key);
    },
    clear: async () => {
      if (env.fail_protected_clear) throw new Error("clear failed");
      env.protected_values.clear();
    },
  }),
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    set: async ({ key, value }: { key: string; value: string }) => {
      env.legacy_values.set(key, value);
    },
    get: async ({ key }: { key: string }) => ({
      value: env.legacy_values.get(key) ?? null,
    }),
    remove: async ({ key }: { key: string }) => {
      env.legacy_values.delete(key);
    },
    clear: async () => {
      if (env.fail_legacy_clear) throw new Error("clear failed");
      env.legacy_values.clear();
    },
  },
}));

const store = await import("./secure_token_store");

describe("native token storage", () => {
  beforeEach(() => {
    env.available = true;
    env.plugin_missing = false;
    env.fail_protected_clear = false;
    env.fail_legacy_clear = false;
    env.protected_values.clear();
    env.legacy_values.clear();
    store.reset_native_token_store_for_tests();
  });

  it("keeps a new token out of plain preferences", async () => {
    await store.native_token_set("access", "token-1");

    expect(env.protected_values.get("access")).toBe("token-1");
    expect(env.legacy_values.size).toBe(0);
    expect(await store.native_token_get("access")).toBe("token-1");
  });

  it("moves a token an older build left in plain preferences", async () => {
    env.legacy_values.set("refresh", "old-token");

    expect(await store.native_token_get("refresh")).toBe("old-token");
    expect(env.protected_values.get("refresh")).toBe("old-token");
    expect(env.legacy_values.has("refresh")).toBe(false);
    expect(await store.native_token_get("refresh")).toBe("old-token");
  });

  it("prefers the plain copy, which is always the newer one", async () => {
    env.protected_values.set("access", "stale");
    env.legacy_values.set("access", "fresh");

    expect(await store.native_token_get("access")).toBe("fresh");
    expect(env.protected_values.get("access")).toBe("fresh");
  });

  it("removes the plain copy when a token is replaced", async () => {
    env.legacy_values.set("access", "old-token");
    await store.native_token_set("access", "new-token");

    expect(env.legacy_values.has("access")).toBe(false);
    expect(await store.native_token_get("access")).toBe("new-token");
  });

  it("returns null when no token is stored", async () => {
    expect(await store.native_token_get("missing")).toBeNull();
  });

  it("removes a token from both stores", async () => {
    env.protected_values.set("csrf", "a");
    env.legacy_values.set("csrf", "b");
    await store.native_token_remove("csrf");

    expect(env.protected_values.has("csrf")).toBe(false);
    expect(env.legacy_values.has("csrf")).toBe(false);
  });

  it("still signs in on a device without protected storage", async () => {
    env.available = false;
    await store.native_token_set("access", "token-1");

    expect(env.legacy_values.get("access")).toBe("token-1");
    expect(env.protected_values.size).toBe(0);
    expect(await store.native_token_get("access")).toBe("token-1");
  });

  it("falls back when the native plugin is not present", async () => {
    env.plugin_missing = true;
    env.legacy_values.set("access", "token-1");

    expect(await store.native_token_get("access")).toBe("token-1");
    expect(env.legacy_values.get("access")).toBe("token-1");
  });

  it("clears both stores on a wipe", async () => {
    env.protected_values.set("access", "a");
    env.legacy_values.set("other", "b");
    await store.native_token_clear_all();

    expect(env.protected_values.size).toBe(0);
    expect(env.legacy_values.size).toBe(0);
  });

  it("clears the other store when one clear fails, and reports it", async () => {
    env.protected_values.set("access", "a");
    env.legacy_values.set("other", "b");
    env.fail_legacy_clear = true;

    await expect(store.native_token_clear_all()).rejects.toThrow();
    expect(env.protected_values.size).toBe(0);

    env.fail_legacy_clear = false;
    env.fail_protected_clear = true;
    env.protected_values.set("access", "a");

    await expect(store.native_token_clear_all()).rejects.toThrow();
    expect(env.legacy_values.size).toBe(0);
  });
});
