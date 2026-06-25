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

import {
  PreferencesProvider,
  use_preferences,
} from "./preferences_context";
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@/services/api/preferences";

const server_writes: UserPreferences[] = [];

const cached_prefs: UserPreferences = {
  ...DEFAULT_PREFERENCES,
  show_aster_branding: false,
};

const server_state: { loaded: boolean; data: UserPreferences } = {
  loaded: false,
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
    get_cached_preferences: vi.fn(() => cached_prefs),
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
}));

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Captured = {
  update_preference: ReturnType<typeof use_preferences>["update_preference"];
  has_loaded_from_server: boolean;
};

function Capture({ on_render }: { on_render: (c: Captured) => void }) {
  const { update_preference, has_loaded_from_server } = use_preferences();

  on_render({ update_preference, has_loaded_from_server });

  return null;
}

describe("preferences persistence when server load fails", () => {
  let container: HTMLDivElement;
  let root: Root;
  let captured: Captured;

  beforeEach(() => {
    server_writes.length = 0;
    server_state.loaded = false;
    server_state.data = DEFAULT_PREFERENCES;
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
      await vi.runAllTimersAsync();
    });
  };

  it("still persists an immediate change after falling back to cached prefs", async () => {
    await mount();

    await act(async () => {
      captured.update_preference("show_aster_branding", true, true);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const branding_writes = server_writes.filter(
      (w) => w.show_aster_branding === true,
    );

    expect(branding_writes.length).toBeGreaterThan(0);
  });

  it("rebases the local change onto fresh server state instead of clobbering it", async () => {
    await mount();

    server_state.loaded = true;
    server_state.data = {
      ...DEFAULT_PREFERENCES,
      show_aster_branding: false,
      undo_send_seconds: 30,
    };

    await act(async () => {
      captured.update_preference("show_aster_branding", true, true);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const last = server_writes[server_writes.length - 1];

    expect(last.show_aster_branding).toBe(true);
    expect(last.undo_send_seconds).toBe(30);
  });
});
