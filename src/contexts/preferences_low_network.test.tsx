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

let server_prefs: UserPreferences = { ...DEFAULT_PREFERENCES };

vi.mock("@/services/api/preferences", async (import_original) => {
  const actual =
    await import_original<typeof import("@/services/api/preferences")>();

  return {
    ...actual,
    get_preferences: vi.fn(async () => ({
      data: server_prefs,
      loaded_from_server: true,
    })),
    save_preferences: vi.fn(async () => ({ data: { success: true } })),
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

interface FakeConnection {
  saveData: boolean;
  effectiveType: string;
  addEventListener: (name: string, handler: () => void) => void;
  removeEventListener: (name: string, handler: () => void) => void;
  emit_change: () => void;
}

function make_connection(
  saveData: boolean,
  effectiveType: string,
): FakeConnection {
  const handlers = new Set<() => void>();

  return {
    saveData,
    effectiveType,
    addEventListener: (name, handler) => {
      if (name === "change") handlers.add(handler);
    },
    removeEventListener: (name, handler) => {
      if (name === "change") handlers.delete(handler);
    },
    emit_change: () => handlers.forEach((h) => h()),
  };
}

function install_connection(conn: FakeConnection | null) {
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    value: conn ?? undefined,
  });
}

type Captured = {
  preferences: UserPreferences;
  update_preference: ReturnType<typeof use_preferences>["update_preference"];
};

function Capture({ on_render }: { on_render: (c: Captured) => void }) {
  const { preferences, update_preference } = use_preferences();

  on_render({ preferences, update_preference });

  return null;
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("low network mode never overrides an explicit choice", () => {
  let container: HTMLDivElement;
  let root: Root;
  let captured: Captured;

  beforeEach(() => {
    server_prefs = { ...DEFAULT_PREFERENCES };
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
    install_connection(null);
    vi.unstubAllGlobals();
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
    await flush();
  };

  it("keeps the mode off after the connection reports a slow type", async () => {
    const conn = make_connection(false, "4g");

    install_connection(conn);
    await mount();

    await act(async () => {
      captured.update_preference("low_network_mode", false, true);
    });
    await flush();

    expect(captured.preferences.low_network_mode_user_set).toBe(true);

    conn.effectiveType = "2g";
    await act(async () => {
      conn.emit_change();
    });
    await flush();

    expect(captured.preferences.low_network_mode).toBe(false);
  });

  it("keeps the mode off after the connection reports save data", async () => {
    const conn = make_connection(false, "4g");

    install_connection(conn);
    await mount();

    await act(async () => {
      captured.update_preference("low_network_mode", false, true);
    });
    await flush();

    conn.saveData = true;
    await act(async () => {
      conn.emit_change();
    });
    await flush();

    expect(captured.preferences.low_network_mode).toBe(false);
  });

  it("keeps an explicit off choice across a reload on a slow connection", async () => {
    install_connection(make_connection(true, "2g"));
    server_prefs = {
      ...DEFAULT_PREFERENCES,
      low_network_mode: false,
      low_network_mode_user_set: true,
    };

    await mount();

    expect(captured.preferences.low_network_mode).toBe(false);
  });

  it("turns an auto-enabled mode back off once the connection is fast", async () => {
    install_connection(make_connection(false, "4g"));
    server_prefs = {
      ...DEFAULT_PREFERENCES,
      low_network_mode: true,
      low_network_mode_user_set: false,
    };

    await mount();

    expect(captured.preferences.low_network_mode).toBe(false);
  });

  it("still auto-enables for a user who has never chosen", async () => {
    install_connection(make_connection(true, "4g"));

    await mount();

    expect(captured.preferences.low_network_mode).toBe(true);
    expect(captured.preferences.low_network_mode_user_set).toBe(false);
  });

  it("does not auto-enable from a reported effective type alone", async () => {
    install_connection(make_connection(false, "slow-2g"));

    await mount();

    expect(captured.preferences.low_network_mode).toBe(false);
  });

  it("keeps an explicit on choice on a fast connection", async () => {
    install_connection(make_connection(false, "4g"));
    server_prefs = {
      ...DEFAULT_PREFERENCES,
      low_network_mode: true,
      low_network_mode_user_set: true,
    };

    await mount();

    expect(captured.preferences.low_network_mode).toBe(true);
  });
});
