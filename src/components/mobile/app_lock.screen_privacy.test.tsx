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
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const env = vi.hoisted(() => ({
  native: true,
  prefs: { biometric_app_lock_enabled: false } as Record<string, unknown>,
  loaded: true,
  blocked: [] as boolean[],
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: env.prefs,
    has_loaded_from_server: env.loaded,
  }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth_safe: () => ({ current_account_id: "acct-1", is_authenticated: true }),
}));

vi.mock("@/native/capacitor_bridge", () => ({
  is_native_platform: () => env.native,
  add_app_state_listener: () => () => undefined,
}));

vi.mock("@/native/biometric_auth", () => ({
  authenticate_biometric: async () => true,
  check_biometric_availability: async () => ({
    is_available: false,
    biometry_type: "none",
  }),
  get_biometry_type_name: () => "Biometrics",
}));

vi.mock("@/native/screen_privacy", () => ({
  set_screen_capture_blocked: async (enabled: boolean) => {
    env.blocked.push(enabled);

    return true;
  },
}));

vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/sync_client", () => ({
  sync_client: { connect: async () => undefined, disconnect: () => undefined },
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: () => undefined,
}));

vi.mock("@/hooks/use_protected_folder", () => ({
  lock_all_folders: () => undefined,
}));

vi.mock("@/contexts/auth/purge_local_data", () => ({
  purge_all_local_data: async () => undefined,
}));

const { AppLock } = await import("./app_lock");
const { save_native_lock_hint, clear_native_lock_hint } =
  await import("@/services/app_lock_store");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <AppLock>
        <span>inbox</span>
      </AppLock>,
    );
  });
}

beforeEach(() => {
  env.native = true;
  env.prefs = { biometric_app_lock_enabled: false };
  env.loaded = true;
  env.blocked = [];
  clear_native_lock_hint("acct-1");
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  clear_native_lock_hint("acct-1");
});

describe("screen capture while app lock is on", () => {
  it("blocks capture when app lock is on", async () => {
    env.prefs = { biometric_app_lock_enabled: true };
    await mount();

    expect(env.blocked[env.blocked.length - 1]).toBe(true);
  });

  it("allows capture when app lock is off", async () => {
    await mount();

    expect(env.blocked[env.blocked.length - 1]).toBe(false);
  });

  it("blocks capture from the stored hint before settings load", async () => {
    env.loaded = false;
    save_native_lock_hint("acct-1");
    await mount();

    expect(env.blocked[0]).toBe(true);
  });

  it("never touches the window flag in a browser", async () => {
    env.native = false;
    env.prefs = { biometric_app_lock_enabled: true };
    await mount();

    expect(env.blocked).toEqual([]);
  });
});
