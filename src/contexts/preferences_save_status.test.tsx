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
import { act, memo } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  PreferencesProvider,
  use_preferences,
  use_preferences_save_status,
} from "./preferences_context";

import { SettingsSaveIndicator } from "@/components/settings/settings_save_indicator";
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@/services/api/preferences";

const pending_saves: Array<() => void> = [];

vi.mock("@/services/api/preferences", async (import_original) => {
  const actual =
    await import_original<typeof import("@/services/api/preferences")>();

  return {
    ...actual,
    get_preferences: vi.fn(async () => ({
      data: { ...actual.DEFAULT_PREFERENCES, muted_folder_tokens: [] },
      loaded_from_server: true,
    })),
    save_preferences: vi.fn(
      () =>
        new Promise((resolve) => {
          pending_saves.push(() => resolve({ data: { success: true } }));
        }),
    ),
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

const stable_i18n = { set_language: vi.fn(), t: (key: string) => key };

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => stable_i18n,
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

const ROW_COUNT = 100;
const row_renders: number[] = [];
let update_preference: ReturnType<typeof use_preferences>["update_preference"];

const Row = memo(function Row({ index }: { index: number }) {
  const context = use_preferences();

  update_preference = context.update_preference;
  row_renders[index] = (row_renders[index] ?? 0) + 1;

  return <span>{context.preferences.show_profile_pictures ? "a" : "b"}</span>;
});

function StatusProbe() {
  const { save_status, has_unsaved_changes } = use_preferences_save_status();

  return (
    <i data-status={save_status} data-unsaved={String(has_unsaved_changes)} />
  );
}

function Rows() {
  return (
    <>
      {Array.from({ length: ROW_COUNT }, (_, index) => (
        <Row key={index} index={index} />
      ))}
    </>
  );
}

describe("preference save status does not re-render preference readers", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    pending_saves.length = 0;
    row_renders.length = 0;
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

  const settle = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

  const finish_save = async () => {
    expect(pending_saves.length).toBe(1);
    await act(async () => {
      pending_saves.shift()?.();
      await vi.advanceTimersByTimeAsync(0);
    });
  };

  it("renders each memoised reader once for one preference change", async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(
        <PreferencesProvider>
          <Rows />
        </PreferencesProvider>,
      );
    });
    await settle(1000);

    row_renders.fill(0);

    await act(async () => {
      update_preference(
        "show_profile_pictures",
        !DEFAULT_PREFERENCES.show_profile_pictures,
      );
    });
    await settle(1000);
    await finish_save();
    await settle(3000);

    expect(container.textContent?.[0]).toBe(
      DEFAULT_PREFERENCES.show_profile_pictures ? "b" : "a",
    );
    expect(row_renders).toHaveLength(ROW_COUNT);
    expect(new Set(row_renders)).toEqual(new Set([1]));
  });

  it("leaves readers alone when another device has nothing new", async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(
        <PreferencesProvider>
          <Rows />
        </PreferencesProvider>,
      );
    });
    await settle(1000);

    row_renders.fill(0);

    await settle(45000);

    expect(pending_saves).toHaveLength(0);
    expect(new Set(row_renders)).toEqual(new Set([0]));
  });

  it("still walks the save indicator through pending, saving, saved and idle", async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(
        <PreferencesProvider>
          <Rows />
          <StatusProbe />
          <SettingsSaveIndicator />
        </PreferencesProvider>,
      );
    });
    await settle(1000);

    const probe = () => container.querySelector("i") as HTMLElement;
    const indicator_text = () => container.textContent?.slice(ROW_COUNT);

    expect(probe().dataset.status).toBe("idle");
    expect(indicator_text()).toBe("");

    await act(async () => {
      update_preference(
        "show_profile_pictures",
        !DEFAULT_PREFERENCES.show_profile_pictures,
      );
    });

    expect(probe().dataset.status).toBe("pending");
    expect(probe().dataset.unsaved).toBe("true");
    expect(indicator_text()).toBe("common.saving");

    await settle(1000);

    expect(probe().dataset.status).toBe("saving");
    expect(probe().dataset.unsaved).toBe("true");
    expect(indicator_text()).toBe("common.saving");

    await finish_save();

    expect(probe().dataset.status).toBe("saved");
    expect(probe().dataset.unsaved).toBe("false");
    expect(indicator_text()).toBe("common.saved");

    await settle(3000);

    expect(probe().dataset.status).toBe("idle");
    expect(indicator_text()).toBe("");
  });
});
