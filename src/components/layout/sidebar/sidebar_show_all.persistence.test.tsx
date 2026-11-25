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
import type { DecryptedFolder } from "@/hooks/use_folders";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

import { type UserPreferences } from "@/services/api/preferences";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const server = vi.hoisted(() => ({
  blob: null as Record<string, unknown> | null,
}));

vi.mock("@/services/api/preferences", async (import_original) => {
  const actual =
    await import_original<typeof import("@/services/api/preferences")>();

  return {
    ...actual,
    get_preferences: vi.fn(async () => ({
      data: { ...actual.DEFAULT_PREFERENCES, ...(server.blob ?? {}) },
      loaded_from_server: true,
    })),
    save_preferences: vi.fn(async (prefs: UserPreferences) => {
      server.blob = { ...prefs };

      return { data: { success: true } };
    }),
    prepare_preferences_payload: vi.fn(async (prefs: UserPreferences) => ({
      encrypted: JSON.stringify(prefs),
      nonce: "nonce",
    })),
    cache_preferences_locally: vi.fn(),
    get_cached_preferences: vi.fn(() => null),
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

vi.mock("@/lib/i18n/context", () => {
  const i18n = { t: (key: string) => key, set_language: () => {} };

  return { use_i18n: () => i18n };
});

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

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ identity_key: "identity-key" }),
  on_vault_cleared: () => () => {},
}));

vi.mock("@/hooks/use_protected_folder", () => ({
  is_folder_unlocked: () => true,
  count_unlocked_folders: () => 0,
  lock_all_folders: () => 0,
  lock_folder_by_id: () => true,
}));

import { PreferencesProvider } from "@/contexts/preferences_context";
import { SidebarFolders } from "./sidebar_folders";
import { use_sidebar_show_all } from "./use_sidebar_show_all";

const FOLDER_NAMES = [
  "Receipts",
  "Travel",
  "Family",
  "Projects",
  "Banking",
  "Archive 2025",
  "Volunteering",
];

function folder(index: number): DecryptedFolder {
  return {
    id: `id_${index}`,
    folder_token: `token_${index}`,
    name: FOLDER_NAMES[index],
    is_system: false,
    is_locked: false,
    folder_type: "custom",
    is_password_protected: false,
    password_set: false,
    sort_order: index,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const FOLDERS = FOLDER_NAMES.map((_, index) => folder(index));

function FoldersHarness() {
  const { folders_expanded, set_folders_expanded } = use_sidebar_show_all();

  return createElement(SidebarFolders, {
    account_id: "acct_a",
    is_collapsed: false,
    effective_selected: null,
    folders: FOLDERS,
    folders_expanded,
    set_folders_expanded,
    is_loading: false,
    handle_nav_click: (cb: () => void) => cb(),
    set_selected_item: () => {},
    navigate: () => {},
    set_is_create_folder_open: () => {},
    handle_folder_modal: () => {},
    handle_folder_lock: () => {},
    set_password_modal_folder: () => {},
    folder_refs: { current: {} } as never,
  });
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function open_app() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      createElement(PreferencesProvider, null, createElement(FoldersHarness)),
    );
  });
  await flush();
}

async function close_app() {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
}

function visible(name: string): boolean {
  return container!.textContent!.includes(name);
}

function button_with_text(text: string): HTMLElement {
  const match = Array.from(
    container!.querySelectorAll<HTMLElement>("button, [role='button']"),
  ).find((el) => el.textContent?.includes(text));

  if (!match) throw new Error(`no button with ${text}`);

  return match;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

describe("sidebar folder list stays expanded", () => {
  beforeEach(() => {
    localStorage.clear();
    server.blob = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, opts: { body: string }) => {
        const body = JSON.parse(opts.body);

        server.blob = JSON.parse(body.encrypted_preferences);

        return { ok: true } as Response;
      }),
    );
  });

  afterEach(async () => {
    await close_app();
    vi.unstubAllGlobals();
  });

  it("shows the first five folders until you expand the list", async () => {
    await open_app();

    expect(visible("Banking")).toBe(true);
    expect(visible("Archive 2025")).toBe(false);
    expect(visible("Volunteering")).toBe(false);
  });

  it("keeps the list expanded after the app reloads", async () => {
    await open_app();
    await click(button_with_text("common.more_folders"));
    expect(visible("Volunteering")).toBe(true);

    await close_app();
    await open_app();

    expect(visible("Archive 2025")).toBe(true);
    expect(visible("Volunteering")).toBe(true);
  });

  it("keeps the list collapsed after you collapse it and reload", async () => {
    await open_app();
    await click(button_with_text("common.more_folders"));
    await click(button_with_text("common.show_less"));
    expect(visible("Volunteering")).toBe(false);

    await close_app();
    await open_app();

    expect(visible("Volunteering")).toBe(false);
  });

  it("restores the expanded list from synced preferences on a new device", async () => {
    await open_app();
    await click(button_with_text("common.more_folders"));
    await close_app();

    localStorage.clear();
    await open_app();

    expect(server.blob?.sidebar_folders_show_all).toBe(true);
    expect(visible("Volunteering")).toBe(true);
  });

  it("stores only a true or false value on the device, never folder names or ids", async () => {
    await open_app();
    await click(button_with_text("common.more_folders"));

    const stored = localStorage.getItem("aster_sidebar_state") ?? "";

    expect(JSON.parse(stored).sidebar_folders_show_all).toBe(true);
    for (const item of FOLDERS) {
      expect(stored).not.toContain(item.name);
      expect(stored).not.toContain(item.folder_token);
      expect(stored).not.toContain(item.id);
    }
  });
});
