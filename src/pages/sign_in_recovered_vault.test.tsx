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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { refuse_rolled_back_vault_with_notice } from "@/contexts/auth/rolled_back_vault_notice";
import {
  pin_vault_generation,
  read_vault_generation_pin,
} from "@/services/crypto/vault_generation";

const USER_ID = "user-recovered-form";

function at(generation: number): EncryptedVault {
  return {
    identity_key: "identity-a",
    previous_keys: [],
    vault_generation: generation,
  } as unknown as EncryptedVault;
}

const thrown: unknown[] = [];
const navigate_mock = vi.fn();
const set_error_mock = vi.fn();
const page_state = { is_adding_account: false };
const login_state = { marker: 41 as number | undefined };

function adopt(user: { id: string }, vault: EncryptedVault, marker: unknown) {
  try {
    refuse_rolled_back_vault_with_notice(user.id, vault, () => {}, marker);
  } catch (caught) {
    thrown.push(caught);
    throw caught;
  }
}

const login_mock = vi.fn(
  async (
    user: { id: string },
    vault: EncryptedVault,
    _password: string,
    _encrypted_vault: string,
    _vault_nonce: string,
    _remember_me?: boolean,
    marker?: number,
  ) => {
    adopt(user, vault, marker);
  },
);
const add_account_mock = vi.fn(
  async (
    user: { id: string },
    vault: EncryptedVault,
    _password: string,
    _encrypted_vault: string,
    _vault_nonce: string,
    _remember_me?: boolean,
    marker?: number,
  ) => {
    adopt(user, vault, marker);

    return { success: true };
  },
);

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/native/desktop_device_auth", () => ({
  is_tauri: () => false,
  forget_device_account: vi.fn(async () => undefined),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => null,
  update_account_device_id: vi.fn(async () => true),
}));

vi.mock("@/components/auth/turnstile_widget", () => ({
  TurnstileWidget: () => <div data-testid="turnstile" />,
  TURNSTILE_SITE_KEY: "",
}));

vi.mock("@/services/api/auth", () => ({
  login_user: vi.fn(async () => ({
    error: null,
    data: {
      user_id: USER_ID,
      username: "bordeaux",
      email: "bordeaux@astermail.org",
      encrypted_vault: "dmF1bHQ=",
      vault_nonce: "bm9uY2U=",
      vault_recovered_write_count: login_state.marker,
    },
  })),
  get_user_salt: vi.fn(async () => ({
    error: null,
    data: { salt: "c2FsdA==" },
  })),
  get_user_info: vi.fn(async () => ({ data: null })),
}));

vi.mock("@/services/crypto/key_manager", () => ({
  hash_email: vi.fn(async (email: string) => `hash:${email}`),
  derive_password_hash: vi.fn(async () => ({ hash: "derived", salt: "salt" })),
  decrypt_vault: vi.fn(async () => at(25)),
  base64_to_array: () => new Uint8Array(32),
}));

vi.mock("@/services/crypto/login_proof", () => ({
  derive_sign_in_proof: vi.fn(async () => "proof"),
  clear_pending_login_enrollment: vi.fn(),
}));

vi.mock("@/services/crypto/prekey_service", () => ({
  check_and_replenish_prekeys: vi.fn(async () => undefined),
}));

vi.mock("./use_sign_in_page", () => ({
  use_sign_in_page: () => ({
    navigate: navigate_mock,
    location: { search: "", pathname: "/sign-in" },
    login: login_mock,
    add_account: add_account_mock,
    switch_to_account: vi.fn(),
    hub_accounts: [],
    hub_signing_in_id: null,
    handle_hub_account: vi.fn(),
    is_adding_account: page_state.is_adding_account,
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
    captcha_token: "token",
    set_captcha_token: vi.fn(),
    turnstile_ref: { current: { refresh: vi.fn(), reset: vi.fn() } },
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
    handle_guard_complete: vi.fn(),
    guard_gate: {
      guard_start: null,
      set_guard_user_hash: vi.fn(),
      clear_guard: vi.fn(),
    },
  }),
}));

const { default: SignInPage } = await import("./sign_in");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function submit_form(): Promise<void> {
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
}

describe("password sign-in form after a recovery on another app", () => {
  beforeEach(() => {
    thrown.length = 0;
    navigate_mock.mockClear();
    set_error_mock.mockClear();
    login_mock.mockClear();
    add_account_mock.mockClear();
    page_state.is_adding_account = false;
    login_state.marker = 41;
    pin_vault_generation(USER_ID, {
      ...at(40),
      vault_generation_ready: true,
    } as EncryptedVault);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    localStorage.clear();
  });

  it("signs in with the recovered vault through login", async () => {
    await submit_form();

    expect(login_mock).toHaveBeenCalledTimes(1);
    expect(thrown).toEqual([]);
    expect(read_vault_generation_pin(USER_ID)).toBe(25);
    expect(navigate_mock).toHaveBeenCalled();
  });

  it("adds the account with the recovered vault through add_account", async () => {
    page_state.is_adding_account = true;

    await submit_form();

    expect(add_account_mock).toHaveBeenCalledTimes(1);
    expect(thrown).toEqual([]);
    expect(read_vault_generation_pin(USER_ID)).toBe(25);
    expect(navigate_mock).toHaveBeenCalled();
  });

  it("still refuses the older vault when the server reports no recovery", async () => {
    login_state.marker = undefined;

    await submit_form();

    expect(login_mock).toHaveBeenCalledTimes(1);
    expect(thrown).toHaveLength(1);
    expect((thrown[0] as Error).name).toBe("VaultRolledBackError");
    expect(read_vault_generation_pin(USER_ID)).toBe(40);
    expect(navigate_mock).not.toHaveBeenCalled();
  });

  it("signs in when the pin predates the first recovery report", async () => {
    login_state.marker = 0;

    await submit_form();

    expect(login_mock).toHaveBeenCalledTimes(1);
    expect(thrown).toEqual([]);
    expect(read_vault_generation_pin(USER_ID)).toBe(25);
    expect(navigate_mock).toHaveBeenCalled();
  });

  it("refuses the older vault once the server has reported before", async () => {
    adopt({ id: USER_ID }, at(40), 0);
    login_state.marker = 0;

    await submit_form();

    expect(login_mock).toHaveBeenCalledTimes(1);
    expect(thrown).toHaveLength(1);
    expect((thrown[0] as Error).name).toBe("VaultRolledBackError");
    expect(read_vault_generation_pin(USER_ID)).toBe(40);
    expect(navigate_mock).not.toHaveBeenCalled();
  });
});
