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

const set_error_mock = vi.fn();
const login_user_mock = vi.fn(async () => ({
  error: "Invalid credentials",
  server_code: "INVALID_CREDENTIALS",
}));
const get_user_salt_mock = vi.fn(async () => ({
  error: null,
  data: { salt: "c2FsdA==" },
}));
const refresh_mock = vi.fn(async () => "fresh-token");
const reset_mock = vi.fn();

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/native/desktop_device_auth", () => ({
  is_tauri: () => false,
  forget_device_account: vi.fn(async () => undefined),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: () => null,
  update_account_device_id: vi.fn(async () => true),
}));

vi.mock("@/components/auth/turnstile_widget", () => ({
  TurnstileWidget: () => <div data-testid="turnstile" />,
  TURNSTILE_SITE_KEY: "",
}));

vi.mock("@/services/api/client/helpers", async (import_original) => ({
  ...((await import_original()) as Record<string, unknown>),
  declared_native_platform: () => "desktop",
}));

vi.mock("@/services/api/auth", () => ({
  login_user: (...args: unknown[]) => login_user_mock(...(args as [])),
  get_user_salt: (...args: unknown[]) => get_user_salt_mock(...(args as [])),
  get_user_info: vi.fn(async () => ({ data: null })),
}));

vi.mock("@/services/crypto/key_manager", () => ({
  hash_email: vi.fn(async (email: string) => `hash:${email}`),
  derive_password_hash: vi.fn(async () => ({ hash: "derived", salt: "salt" })),
  decrypt_vault: vi.fn(async () => ({})),
  base64_to_array: () => new Uint8Array(32),
}));

vi.mock("@/services/crypto/prekey_service", () => ({
  check_and_replenish_prekeys: vi.fn(async () => undefined),
}));

vi.mock("./use_sign_in_page", () => ({
  use_sign_in_page: () => ({
    navigate: vi.fn(),
    location: { search: "", pathname: "/sign-in" },
    login: vi.fn(async () => undefined),
    add_account: vi.fn(async () => ({ success: true })),
    switch_to_account: vi.fn(),
    hub_accounts: [],
    hub_signing_in_id: null,
    handle_hub_account: vi.fn(),
    is_adding_account: false,
    set_is_adding_account: vi.fn(),
    is_authenticated: false,
    is_loading: false,
    auth_loading: false,
    accounts: [],
    t: (key: string) => key,
    is_dark: false,
    reauth_account_id: null,
    previous_account_id: null,
    has_existing_session: false,
    is_password_visible: false,
    set_is_password_visible: vi.fn(),
    username: "bordeaux",
    set_username: vi.fn(),
    password: "correct horse battery",
    set_password: vi.fn(),
    email_domain: "astermail.org",
    set_email_domain: vi.fn(),
    remember_me: false,
    set_remember_me: vi.fn(),
    set_is_loading: vi.fn(),
    error: "",
    set_error: set_error_mock,
    status: "",
    set_status: vi.fn(),
    is_checkout_login: false,
    checkout_status: "",
    captcha_token: "initial-token",
    set_captcha_token: vi.fn(),
    turnstile_ref: { current: { refresh: refresh_mock, reset: reset_mock } },
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

describe("SignInPage domain probing on a native client", () => {
  beforeEach(() => {
    set_error_mock.mockClear();
    login_user_mock.mockClear();
    get_user_salt_mock.mockClear();
    refresh_mock.mockClear();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("spends one login attempt and points at the address instead of probing the second domain", async () => {
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

    const form = container.querySelector("form");

    expect(form).not.toBeNull();

    await act(async () => {
      form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await new Promise((resolve) => setTimeout(resolve, 1500));
    });

    expect(login_user_mock).toHaveBeenCalledTimes(1);
    expect(set_error_mock).toHaveBeenCalledWith(
      "errors.sign_in_domain_unsupported",
    );
    expect(set_error_mock).not.toHaveBeenCalledWith("Invalid credentials");
  });
});
