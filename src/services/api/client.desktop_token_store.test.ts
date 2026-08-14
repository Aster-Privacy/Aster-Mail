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
import { describe, it, expect, vi, beforeEach } from "vitest";

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

const keychain = new Map<string, string>();

const invoke = vi.fn(
  async (command: string, args?: Record<string, unknown>) => {
    if (command === "device_auth_store_set") {
      keychain.set(args?.slot as string, args?.value as string);

      return null;
    }
    if (command === "device_auth_store_get") {
      return keychain.get(args?.slot as string) ?? null;
    }
    if (command === "device_auth_store_clear") {
      keychain.clear();

      return null;
    }

    return null;
  },
);

const { TAURI_TOKEN_KEY, TAURI_CSRF_KEY } = await import("./client/helpers");
const { ApiClient } = await import("./client/api_client");

const ACCESS_SLOT = "access_token";
const CSRF_SLOT = "csrf";

function install_desktop_bridge(): void {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    invoke,
    transformCallback: (callback: unknown) => callback,
  };
}

describe("desktop session token storage", () => {
  beforeEach(() => {
    install_desktop_bridge();
    keychain.clear();
    localStorage.clear();
    invoke.mockClear();
  });

  it("writes the access token and csrf to the keychain instead of localStorage", async () => {
    const client = new ApiClient();

    client.set_dev_token("access.token.value");
    client.set_csrf("csrf-value");
    await vi.waitFor(() => {
      expect(keychain.get(ACCESS_SLOT)).toBe("access.token.value");
      expect(keychain.get(CSRF_SLOT)).toBe("csrf-value");
    });

    expect(localStorage.getItem(TAURI_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(TAURI_CSRF_KEY)).toBeNull();
  });

  it("adopts a token left in localStorage by an older build and then deletes it", async () => {
    localStorage.setItem(TAURI_TOKEN_KEY, "legacy.access.token");
    localStorage.setItem(TAURI_CSRF_KEY, "legacy-csrf");

    const client = new ApiClient();

    await vi.waitFor(() => {
      expect(keychain.get(ACCESS_SLOT)).toBe("legacy.access.token");
      expect(keychain.get(CSRF_SLOT)).toBe("legacy-csrf");
    });

    expect(localStorage.getItem(TAURI_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(TAURI_CSRF_KEY)).toBeNull();
    expect(client.get_access_token()).toBe("legacy.access.token");
  });

  it("restores the token from the keychain on the next launch", async () => {
    keychain.set(ACCESS_SLOT, "persisted.access.token");
    keychain.set(CSRF_SLOT, "persisted-csrf");

    const client = new ApiClient();

    await vi.waitFor(() => {
      expect(client.get_access_token()).toBe("persisted.access.token");
    });
  });

  it("clears the keychain when the session is cleared", async () => {
    keychain.set(ACCESS_SLOT, "persisted.access.token");
    keychain.set(CSRF_SLOT, "persisted-csrf");

    const client = new ApiClient();

    client.clear_dev_token();
    await vi.waitFor(() => {
      expect(keychain.size).toBe(0);
    });
  });

  it("keeps a token stored during hydration instead of restoring the stale one", async () => {
    keychain.set(ACCESS_SLOT, "stale.access.token");

    const client = new ApiClient();

    client.set_dev_token("fresh.access.token");
    await vi.waitFor(() => {
      expect(keychain.get(ACCESS_SLOT)).toBe("fresh.access.token");
    });

    expect(client.get_access_token()).toBe("fresh.access.token");
  });

  it("never touches the keychain outside the desktop app", async () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;

    const client = new ApiClient();

    client.set_dev_token("web.access.token");
    client.set_csrf("web-csrf");
    await vi.waitFor(() => {
      expect(client.get_access_token()).toBe("web.access.token");
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(keychain.size).toBe(0);
  });
});
