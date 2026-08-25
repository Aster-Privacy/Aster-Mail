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
  type UserPreferences,
} from "@/services/api/preferences";

const server_writes: UserPreferences[] = [];

const server_state: { loaded: boolean; data: UserPreferences } = {
  loaded: true,
  data: DEFAULT_PREFERENCES,
};

vi.mock("@/services/api/preferences", async (import_original) => {
  const actual =
    await import_original<typeof import("@/services/api/preferences")>();

  return {
    ...actual,
    get_preferences: vi.fn(async () => ({
      data: server_state.data,
      loaded_from_server: server_state.loaded,
    })),
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

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    vault: { identity_key: "identity-key" },
    is_completing_registration: false,
  }),
}));

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({ set_theme_preference: vi.fn() }),
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
  connection_store: { get_method: () => "direct" },
}));

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

vi.mock("@/components/email/hooks/preload_cache", () => ({
  set_preload_email_font_px: vi.fn(),
  set_preload_email_font_stack: vi.fn(),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Captured = {
  preferences: UserPreferences;
  update_preference: ReturnType<typeof use_preferences>["update_preference"];
};

function Capture({ on_render }: { on_render: (c: Captured) => void }) {
  const { preferences, update_preference } = use_preferences();

  on_render({ preferences, update_preference });

  return null;
}

describe("preferences pick up changes made on another device", () => {
  let container: HTMLDivElement;
  let root: Root;
  let captured: Captured;

  beforeEach(() => {
    server_writes.length = 0;
    server_state.loaded = true;
    server_state.data = { ...DEFAULT_PREFERENCES, muted_folder_tokens: [] };
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
          <Capture on_render={(c) => (captured = c)} />
        </PreferencesProvider>,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
  };

  it("adopts a folder muted on another device when the tab regains focus", async () => {
    await mount();

    expect(captured.preferences.muted_folder_tokens).toEqual([]);

    server_state.data = {
      ...DEFAULT_PREFERENCES,
      muted_folder_tokens: ["token-from-phone"],
    };

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11000);
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(captured.preferences.muted_folder_tokens).toEqual([
      "token-from-phone",
    ]);
  });

  it("adopts a folder unmuted on another device while the tab stays open", async () => {
    server_state.data = {
      ...DEFAULT_PREFERENCES,
      muted_folder_tokens: ["token-from-phone"],
    };
    await mount();

    expect(captured.preferences.muted_folder_tokens).toEqual([
      "token-from-phone",
    ]);

    server_state.data = { ...DEFAULT_PREFERENCES, muted_folder_tokens: [] };

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25000);
    });

    expect(captured.preferences.muted_folder_tokens).toEqual([]);
  });

  it("does not overwrite a local change that has not been saved yet", async () => {
    await mount();

    server_state.data = {
      ...DEFAULT_PREFERENCES,
      muted_folder_tokens: ["token-from-phone"],
    };

    await act(async () => {
      captured.update_preference("muted_folder_tokens", ["token-from-web"]);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25000);
    });

    expect(server_writes.length).toBeGreaterThan(0);
    expect(
      server_writes[server_writes.length - 1].muted_folder_tokens,
    ).toContain("token-from-web");
  });
});
