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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({
  is_authenticated: false,
  login: vi.fn(async () => undefined),
  clear_session_cookies: vi.fn(async () => undefined),
  get_user_salt: vi.fn(async () => ({
    error: null,
    data: { salt: "c2FsdA==" },
  })),
  login_user: vi.fn(async () => ({ error: "stop here", data: null })),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    login: h.login,
    add_account: vi.fn(),
    switch_to_account: vi.fn(),
    is_adding_account: false,
    set_is_adding_account: vi.fn(),
    is_authenticated: h.is_authenticated,
    is_loading: false,
    current_account_id: h.is_authenticated ? "acct-1" : null,
    accounts: h.is_authenticated ? [{ id: "acct-1" }] : [],
  }),
}));

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({ theme: "light" }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: { clear_session_cookies: h.clear_session_cookies },
}));

vi.mock("@/services/api/auth", () => ({
  login_user: h.login_user,
  get_user_salt: h.get_user_salt,
  get_user_info: vi.fn(async () => ({ data: null })),
}));

vi.mock("./sign_in_helpers", async (import_original) => ({
  ...((await import_original()) as Record<string, unknown>),
  decrypt_checkout_password: vi.fn(async () => "checkout password"),
}));

vi.mock("@/services/crypto/key_manager", () => ({
  hash_email: vi.fn(async (email: string) => `hash:${email}`),
  derive_password_hash: vi.fn(async () => ({ hash: "derived" })),
  decrypt_vault: vi.fn(async () => ({})),
  base64_to_array: () => new Uint8Array(16),
}));

vi.mock("@/services/account_hub_link", () => ({
  on_hub_accounts_changed: () => () => undefined,
  read_hub_accounts: () => [],
  uses_account_hub: () => false,
}));

vi.mock("@/native/desktop_device_auth", () => ({
  is_tauri: () => false,
}));

const { use_sign_in_page } = await import("./use_sign_in_page");

type hook_result = ReturnType<typeof use_sign_in_page>;

const CHECKOUT_URL =
  "/sign-in?checkout=success&ep=AAAA&en=BBBB&u=victim%40astermail.org&plan=star#tk=CCCC";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latest: hook_result | null = null;

function Probe() {
  latest = use_sign_in_page();

  return null;
}

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root!.render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>,
    );
  });
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("checkout sign-in link", () => {
  beforeEach(() => {
    h.is_authenticated = false;
    h.login.mockClear();
    h.clear_session_cookies.mockClear();
    h.login_user.mockClear();
    window.history.replaceState({}, "", CHECKOUT_URL);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    latest = null;
    window.history.replaceState({}, "", "/");
  });

  it("waits for the user to confirm the account before signing in", async () => {
    await mount();
    await flush();

    expect(latest!.is_checkout_login).toBe(true);
    expect(latest!.checkout_confirm_email).toBe("victim@astermail.org");
    expect(h.clear_session_cookies).not.toHaveBeenCalled();
    expect(h.login_user).not.toHaveBeenCalled();

    await act(async () => {
      latest!.confirm_checkout_login();
    });
    await flush();

    expect(h.clear_session_cookies).toHaveBeenCalledTimes(1);
    expect(h.login_user).toHaveBeenCalledTimes(1);
    expect(window.location.search).not.toContain("ep=");
  });

  it("drops the link without signing in when the user cancels", async () => {
    await mount();
    await flush();

    await act(async () => {
      latest!.cancel_checkout_login();
    });
    await flush();

    expect(latest!.is_checkout_login).toBe(false);
    expect(h.login_user).not.toHaveBeenCalled();
    expect(window.location.search).not.toContain("ep=");
    expect(window.location.hash).toBe("");
  });

  it("never replaces a session that is already signed in", async () => {
    h.is_authenticated = true;

    await mount();
    await flush();

    expect(latest!.checkout_confirm_email).toBeNull();
    expect(latest!.is_checkout_login).toBe(false);
    expect(h.clear_session_cookies).not.toHaveBeenCalled();
    expect(h.login_user).not.toHaveBeenCalled();
    expect(window.location.search).not.toContain("ep=");
  });
});
