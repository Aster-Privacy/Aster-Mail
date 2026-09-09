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

const tauri_state = { enabled: false };
const navigate_mock = vi.fn();
const login_mock = vi.fn(async () => undefined);
const add_account_mock = vi.fn(
  async (): Promise<{ success: boolean; error?: string }> => ({
    success: true,
  }),
);
const forget_device_account_mock = vi.fn(async () => undefined);
const update_account_device_id_mock = vi.fn(async () => true);
const page_state = {
  is_adding_account: false,
  is_authenticated: false,
  accounts: [] as Array<{ id: string }>,
  reauth_account_id: null as string | null,
  previous_account_id: null as string | null,
};

let captured_props: {
  on_signed_in: (session: unknown) => Promise<void>;
  on_cancel?: () => void;
} | null = null;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/native/desktop_device_auth", () => ({
  is_tauri: () => tauri_state.enabled,
  forget_device_account: (...args: unknown[]) =>
    forget_device_account_mock(...(args as [])),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: () => null,
  update_account_device_id: (...args: unknown[]) =>
    update_account_device_id_mock(...(args as [])),
}));

vi.mock("@/components/auth/turnstile_widget", () => ({
  TurnstileWidget: () => <div data-testid="turnstile" />,
  TURNSTILE_SITE_KEY: "test",
}));

vi.mock("@/components/common/desktop_code_sign_in", () => ({
  DesktopCodeSignIn: (props: {
    on_signed_in: (session: unknown) => Promise<void>;
    on_cancel?: () => void;
  }) => {
    captured_props = props;

    return <div data-testid="desktop-code-sign-in" />;
  },
}));

vi.mock("./use_sign_in_page", () => ({
  use_sign_in_page: () => ({
    navigate: navigate_mock,
    location: { search: "", pathname: "/sign-in" },
    login: login_mock,
    add_account: add_account_mock,
    switch_to_account: vi.fn(),
    is_adding_account: page_state.is_adding_account,
    set_is_adding_account: vi.fn(),
    is_authenticated: page_state.is_authenticated,
    is_loading: false,
    auth_loading: false,
    accounts: page_state.accounts,
    t: (key: string) => key,
    is_dark: false,
    reauth_account_id: page_state.reauth_account_id,
    previous_account_id: page_state.previous_account_id,
    has_existing_session: false,
    is_password_visible: false,
    set_is_password_visible: vi.fn(),
    username: "",
    set_username: vi.fn(),
    password: "",
    set_password: vi.fn(),
    email_domain: "astermail.org",
    set_email_domain: vi.fn(),
    remember_me: false,
    set_remember_me: vi.fn(),
    set_is_loading: vi.fn(),
    error: "",
    set_error: vi.fn(),
    status: "",
    set_status: vi.fn(),
    is_checkout_login: false,
    checkout_status: "",
    captcha_token: "",
    set_captcha_token: vi.fn(),
    turnstile_ref: { current: null },
    pending_verification_hash: null,
    set_pending_verification_hash: vi.fn(),
    resend_cooldown: 0,
    reset_resend_cooldown: vi.fn(),
    is_resending: false,
    totp_required: false,
    set_totp_required: vi.fn(),
    pending_login_token: "",
    set_pending_login_token: vi.fn(),
    available_2fa_methods: [],
    set_available_2fa_methods: vi.fn(),
    active_2fa_method: null,
    set_active_2fa_method: vi.fn(),
    handle_totp_success: vi.fn(),
    handle_resend_pending: vi.fn(),
  }),
}));

const { default: SignInPage } = await import("./sign_in");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const session = {
  user: { id: "user-1", username: "alice", email: "alice@astermail.org" },
  vault: {},
  passphrase: "pass",
  encrypted_vault: "ev",
  vault_nonce: "nonce",
  device_id: "device-1",
};

async function render_page() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <SignInPage />
      </MemoryRouter>,
    );
  });
}

describe("SignInPage on the desktop app", () => {
  beforeEach(() => {
    tauri_state.enabled = true;
    captured_props = null;
    page_state.is_adding_account = false;
    page_state.is_authenticated = false;
    page_state.accounts = [];
    page_state.reauth_account_id = null;
    page_state.previous_account_id = null;
    navigate_mock.mockClear();
    login_mock.mockClear();
    add_account_mock.mockClear();
    add_account_mock.mockResolvedValue({ success: true });
    forget_device_account_mock.mockClear();
    update_account_device_id_mock.mockClear();
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("shows only the device code flow, never a password form", async () => {
    await render_page();

    expect(
      container!.querySelector('[data-testid="desktop-code-sign-in"]'),
    ).not.toBeNull();
    expect(container!.querySelector("input")).toBeNull();
    expect(container!.querySelector("form")).toBeNull();
    expect(container!.querySelector('a[href="/register"]')).toBeNull();
    expect(container!.textContent).not.toContain("auth.create_account");
  });

  it("keeps the password form on the web", async () => {
    tauri_state.enabled = false;
    await render_page();

    expect(
      container!.querySelector('[data-testid="desktop-code-sign-in"]'),
    ).toBeNull();
    expect(container!.querySelector("input")).not.toBeNull();
  });

  it("signs a fresh desktop session in and remembers the device id", async () => {
    await render_page();
    await act(async () => {
      await captured_props!.on_signed_in(session);
    });

    expect(login_mock).toHaveBeenCalledWith(
      session.user,
      session.vault,
      "pass",
      "ev",
      "nonce",
    );
    expect(add_account_mock).not.toHaveBeenCalled();
    expect(update_account_device_id_mock).toHaveBeenCalledWith(
      "user-1",
      "device-1",
    );
    expect(navigate_mock).toHaveBeenCalledWith("/");
    expect(captured_props!.on_cancel).toBeUndefined();
  });

  it("adds an account through the code flow from the account menu", async () => {
    page_state.is_adding_account = true;
    page_state.is_authenticated = true;
    page_state.accounts = [{ id: "user-0" }];
    await render_page();

    expect(captured_props!.on_cancel).toBeTypeOf("function");

    await act(async () => {
      await captured_props!.on_signed_in(session);
    });

    expect(add_account_mock).toHaveBeenCalledWith(
      session.user,
      session.vault,
      "pass",
      "ev",
      "nonce",
    );
    expect(login_mock).not.toHaveBeenCalled();
    expect(update_account_device_id_mock).toHaveBeenCalledWith(
      "user-1",
      "device-1",
    );
    expect(navigate_mock).not.toHaveBeenCalled();
  });

  it("forgets the paired device when adding the account is refused", async () => {
    page_state.is_adding_account = true;
    page_state.is_authenticated = true;
    page_state.accounts = [{ id: "user-0" }];
    add_account_mock.mockResolvedValue({
      success: false,
      error: "auth.account_limit_for_plan",
    });
    await render_page();

    await expect(captured_props!.on_signed_in(session)).rejects.toThrow(
      "auth.account_limit_for_plan",
    );
    expect(forget_device_account_mock).toHaveBeenCalledWith("device-1");
    expect(update_account_device_id_mock).not.toHaveBeenCalled();
  });

  it("re-adds an expired account through the code flow", async () => {
    page_state.reauth_account_id = "user-1";
    page_state.previous_account_id = "user-0";
    page_state.accounts = [{ id: "user-0" }, { id: "user-1" }];
    await render_page();

    await act(async () => {
      await captured_props!.on_signed_in(session);
    });

    expect(add_account_mock).toHaveBeenCalled();
    expect(login_mock).not.toHaveBeenCalled();
  });
});
