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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { PreferencesProvider, use_preferences } from "./preferences_context";

import {
  DEFAULT_PREFERENCES,
  get_preferences,
  type UserPreferences,
} from "@/services/api/preferences";

const server_writes: UserPreferences[] = [];

const server_state: {
  loaded: boolean;
  data: UserPreferences;
  marker: string | null;
} = {
  loaded: true,
  data: DEFAULT_PREFERENCES,
  marker: "blob-1",
};

vi.mock("@/services/api/preferences", async (import_original) => {
  const actual =
    await import_original<typeof import("@/services/api/preferences")>();

  return {
    ...actual,
    get_preferences: vi.fn(
      async (_vault: unknown, _skip: unknown, marker?: string | null) => {
        if (server_state.marker && marker === server_state.marker) {
          return {
            data: actual.DEFAULT_PREFERENCES,
            loaded_from_server: true,
            unchanged: true,
            blob_marker: marker,
          };
        }

        return {
          data: server_state.data,
          loaded_from_server: server_state.loaded,
          blob_marker: server_state.marker,
        };
      },
    ),
    save_preferences: vi.fn(async (prefs: UserPreferences) => {
      server_writes.push({ ...prefs });

      return { data: { success: true } };
    }),
    prepare_preferences_payload: vi.fn(async (prefs: UserPreferences) => ({
      encrypted: JSON.stringify(prefs),
      nonce: "nonce",
    })),
    cache_preferences_locally: vi.fn(),
    clear_preferences_cache: vi.fn(),
    get_cached_preferences: vi.fn(() => null),
    cache_sidebar_state: vi.fn(),
    get_cached_sidebar_state: vi.fn(() => false),
    sync_quiet_hours_to_server: vi.fn(),
    save_dev_mode: vi.fn(),
  };
});

const socket_state = { connected: false };

vi.mock("@/services/sync_client", async (import_original) => {
  const actual =
    await import_original<typeof import("@/services/sync_client")>();

  return {
    ...actual,
    sync_client: { is_connected: () => socket_state.connected },
  };
});

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    vault: { identity_key: "identity-key" },
    is_completing_registration: false,
  }),
}));

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({
    set_theme_preference: () => {
      theme_calls.count += 1;
    },
  }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ set_language: vi.fn() }),
}));

vi.mock("@/lib/i18n/languages", () => ({
  get_supported_languages: () => [{ code: "en" }],
  get_display_name: () => "English",
}));

vi.mock("@/services/api/csrf", () => ({
  get_csrf_token_from_cookie: () => "csrf-token",
}));

vi.mock("@/services/routing/routing_provider", () => ({
  get_effective_base_url: () => "/api",
}));

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: { get_method: () => "direct", subscribe: () => () => {} },
}));

const theme_calls = { count: 0 };

vi.mock("@/native/haptic_feedback", () => ({ sync_haptic_state: vi.fn() }));

vi.mock("@/services/notification_service", () => ({
  load_notification_preferences: vi.fn(async () => {}),
  request_notification_permission: vi.fn(),
}));

vi.mock("@/services/session_timeout_service", () => ({
  configure_session_timeout: vi.fn(),
}));

vi.mock("@/services/low_network_state", () => ({
  set_low_network_mode: vi.fn(),
}));

vi.mock("@/lib/version_check", () => ({ stop_version_check: vi.fn() }));

vi.mock("@/components/email/hooks/preload_cache_store", () => ({
  set_preload_email_font_px: vi.fn(),
  set_preload_email_font_stack: vi.fn(),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const render_count = { value: 0 };

function Consumer() {
  use_preferences();
  render_count.value += 1;

  return null;
}

describe("background preferences poll with no server change", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    server_writes.length = 0;
    server_state.loaded = true;
    server_state.marker = "blob-1";
    server_state.data = { ...DEFAULT_PREFERENCES, theme: "dark" };
    render_count.value = 0;
    theme_calls.count = 0;
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true }) as Response),
    );
  });

  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const mount = async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(
        <PreferencesProvider>
          <Consumer />
        </PreferencesProvider>,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
  };

  const run_polls = async (count: number) => {
    for (let i = 0; i < count; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(21000);
      });
    }
  };

  it("skips set_preferences and visual work when the blob is unchanged", async () => {
    await mount();

    const renders_after_load = render_count.value;
    const theme_after_load = theme_calls.count;

    vi.mocked(get_preferences).mockClear();
    await run_polls(3);

    const calls = vi.mocked(get_preferences).mock.calls;

    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls.every((call) => call[2] === "blob-1")).toBe(true);
    expect(render_count.value).toBe(renders_after_load);
    expect(theme_calls.count).toBe(theme_after_load);
  });

  it("skips set_preferences when a changed blob decrypts to the same values", async () => {
    await mount();

    const renders_after_load = render_count.value;
    const theme_after_load = theme_calls.count;

    server_state.marker = null;
    server_state.data = { ...server_state.data };
    await run_polls(3);

    expect(render_count.value).toBe(renders_after_load);
    expect(theme_calls.count).toBe(theme_after_load);
  });

  it("applies a real change from another device", async () => {
    await mount();

    const renders_after_load = render_count.value;

    server_state.marker = "blob-2";
    server_state.data = { ...server_state.data, compact_mode: true };
    await run_polls(1);

    expect(render_count.value).toBeGreaterThan(renders_after_load);
  });
});
