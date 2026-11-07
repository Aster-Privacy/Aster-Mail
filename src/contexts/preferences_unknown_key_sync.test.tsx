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
  clear_preferences_cache,
  derive_preferences_key_raw,
} from "@/services/api/preferences";

const IDENTITY_KEY = "unknown-key-sync-identity";

const server = vi.hoisted(() => ({
  blob: null as null | {
    encrypted_preferences: string;
    preferences_nonce: string;
  },
  preference_puts: 0,
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async (path: string) => {
      if (path === "/settings/v1/preferences") {
        return {
          data: server.blob ?? {
            encrypted_preferences: null,
            preferences_nonce: null,
          },
          error: null,
        };
      }

      return { data: null, error: "unavailable" };
    }),
    put: vi.fn(async (path: string, body: unknown) => {
      if (path === "/settings/v1/preferences") {
        server.blob = body as typeof server.blob;
        server.preference_puts += 1;
      }

      return { data: { success: true }, error: null };
    }),
    post: vi.fn(async () => ({ data: { success: true }, error: null })),
    delete: vi.fn(async () => ({ data: { success: true }, error: null })),
    patch: vi.fn(async () => ({ data: { success: true }, error: null })),
  },
}));

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
    vault: { identity_key: "unknown-key-sync-identity" },
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
  connection_store: { get_method: () => "direct", subscribe: () => () => {} },
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

vi.mock("@/components/email/hooks/preload_cache_store", () => ({
  set_preload_email_font_px: vi.fn(),
  set_preload_email_font_stack: vi.fn(),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function preferences_key(): Promise<CryptoKey> {
  const raw = await derive_preferences_key_raw(IDENTITY_KEY);

  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function to_base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function from_base64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function seed_server(blob: Record<string, unknown>): Promise<void> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    await preferences_key(),
    new TextEncoder().encode(JSON.stringify(blob)),
  );

  server.blob = {
    encrypted_preferences: to_base64(new Uint8Array(encrypted)),
    preferences_nonce: to_base64(nonce),
  };
}

async function read_server(): Promise<Record<string, unknown>> {
  if (!server.blob) throw new Error("server has no preferences");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: from_base64(server.blob.preferences_nonce) },
    await preferences_key(),
    from_base64(server.blob.encrypted_preferences),
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

function complete_blob(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...DEFAULT_PREFERENCES,
    migration_haptic_v1_done: true,
    migration_tracker_blocking_v2_done: true,
    migration_toast_position_v1_done: true,
    migration_viewer_toolbar_v1_done: true,
    migration_signature_placement_v1_done: true,
    ...overrides,
  };
}

type Captured = ReturnType<typeof use_preferences>;

function Capture({ on_render }: { on_render: (c: Captured) => void }) {
  on_render(use_preferences());

  return null;
}

function read_flag(prefs: unknown, key: string): unknown {
  return (prefs as Record<string, unknown>)[key];
}

describe("preference sync with keys from a newer client", () => {
  let container: HTMLDivElement;
  let root: Root | null;
  let captured: Captured;

  beforeEach(() => {
    server.blob = null;
    server.preference_puts = 0;
    socket_state.connected = false;
    clear_preferences_cache();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true }) as Response),
    );
  });

  afterEach(() => {
    unmount();
    container.remove();
    vi.unstubAllGlobals();
  });

  const eventually = async (check: () => Promise<void> | void) => {
    const deadline = Date.now() + 8000;

    for (;;) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
      });

      try {
        await check();

        return;
      } catch (error) {
        if (Date.now() > deadline) throw error;
      }
    }
  };

  const mount = async () => {
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <PreferencesProvider>
          <Capture on_render={(c) => (captured = c)} />
        </PreferencesProvider>,
      );
    });
    await eventually(() => {
      expect(captured.has_loaded_from_server).toBe(true);
    });
  };

  const unmount = () => {
    if (!root) return;
    const current = root;

    act(() => current.unmount());
    root = null;
  };

  it("keeps preference keys this client does not know when it saves", async () => {
    await seed_server(
      complete_blob({
        relative_dates: false,
        compose_from_selected_alias: true,
        setting_from_a_future_client: "kept",
      }),
    );

    await mount();

    expect(captured.preferences.relative_dates).toBe(false);

    await act(async () => {
      captured.update_preference("relative_dates", true, true);
    });
    await eventually(async () => {
      expect((await read_server()).relative_dates).toBe(true);
    });

    expect(server.preference_puts).toBeGreaterThan(0);

    const saved = await read_server();

    expect(saved.relative_dates).toBe(true);
    expect(saved.compose_from_selected_alias).toBe(true);
    expect(saved.setting_from_a_future_client).toBe("kept");
  });

  it("syncs the compose from selected alias setting to another client", async () => {
    await seed_server(complete_blob({}));

    await mount();

    expect(read_flag(captured.preferences, "compose_from_selected_alias")).toBe(
      false,
    );

    await act(async () => {
      captured.update_preference(
        "compose_from_selected_alias" as keyof Captured["preferences"],
        true as never,
        true,
      );
    });
    await eventually(async () => {
      expect((await read_server()).compose_from_selected_alias).toBe(true);
    });

    unmount();
    clear_preferences_cache();
    await mount();

    expect(read_flag(captured.preferences, "compose_from_selected_alias")).toBe(
      true,
    );
  });

  it("reads a missing or malformed value as off", async () => {
    for (const value of [undefined, null, "true", 1, "yes"]) {
      unmount();
      clear_preferences_cache();
      await seed_server(complete_blob({ compose_from_selected_alias: value }));

      await mount();

      expect(
        read_flag(captured.preferences, "compose_from_selected_alias"),
      ).toBe(false);
    }
  });
});
