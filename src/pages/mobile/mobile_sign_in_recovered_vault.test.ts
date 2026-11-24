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

import { build_mobile_sign_in_handlers } from "./mobile_sign_in_handlers";

import { refuse_rolled_back_vault_with_notice } from "@/contexts/auth/rolled_back_vault_notice";
import {
  pin_vault_generation,
  read_vault_generation_pin,
} from "@/services/crypto/vault_generation";

const USER_ID = "user-recovered-mobile";

function at(generation: number): EncryptedVault {
  return {
    identity_key: "identity-a",
    previous_keys: [],
    vault_generation: generation,
  } as unknown as EncryptedVault;
}

const thrown: unknown[] = [];
const login_state = { marker: 41 as number | undefined };

function adopt(user: { id: string }, vault: EncryptedVault, marker: unknown) {
  try {
    refuse_rolled_back_vault_with_notice(user.id, vault, () => {}, marker);
  } catch (caught) {
    thrown.push(caught);
    throw caught;
  }
}

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

vi.mock("@/components/auth/turnstile_widget", () => ({
  TURNSTILE_SITE_KEY: "",
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => null,
}));

function build(is_adding_account: boolean) {
  const navigate = vi.fn();
  const set_error = vi.fn();
  const login = vi.fn(
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
  const add_account = vi.fn(
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
  const handlers = build_mobile_sign_in_handlers({
    navigate,
    login,
    add_account,
    switch_to_account: vi.fn(),
    is_adding_account,
    set_is_adding_account: vi.fn(),
    is_authenticated: false,
    accounts: [],
    t: (key: string) => key,
    reauth_account_id: null,
    previous_account_id: null,
    username: "bordeaux",
    password: "correct horse battery",
    set_password: vi.fn(),
    email_domain: "astermail.org",
    remember_me: true,
    set_is_loading: vi.fn(),
    error: "",
    set_error,
    set_status: vi.fn(),
    captcha_token: "token",
    set_captcha_token: vi.fn(),
    turnstile_ref: { current: null },
    set_totp_required: vi.fn(),
    pending_login_token: "",
    set_pending_login_token: vi.fn(),
    set_available_2fa_methods: vi.fn(),
    set_active_2fa_method: vi.fn(),
    guard_gate: {
      guard_start: null,
      set_guard_user_hash: vi.fn(),
      clear_guard: vi.fn(),
    },
  } as unknown as Parameters<typeof build_mobile_sign_in_handlers>[0]);

  return { handlers, navigate, set_error, login, add_account };
}

describe("mobile password sign-in after a recovery on another app", () => {
  beforeEach(() => {
    thrown.length = 0;
    login_state.marker = 41;
    pin_vault_generation(USER_ID, {
      ...at(40),
      vault_generation_ready: true,
    } as EncryptedVault);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("signs in with the recovered vault through login", async () => {
    const page = build(false);

    await page.handlers.handle_login();

    expect(page.login).toHaveBeenCalledTimes(1);
    expect(thrown).toEqual([]);
    expect(read_vault_generation_pin(USER_ID)).toBe(25);
    expect(page.navigate).toHaveBeenCalledWith("/");
  });

  it("adds the account with the recovered vault through add_account", async () => {
    const page = build(true);

    await page.handlers.handle_login();

    expect(page.add_account).toHaveBeenCalledTimes(1);
    expect(thrown).toEqual([]);
    expect(read_vault_generation_pin(USER_ID)).toBe(25);
    expect(page.navigate).toHaveBeenCalledWith("/");
  });

  it("still refuses the older vault when the server reports no recovery", async () => {
    login_state.marker = undefined;
    const page = build(false);

    await page.handlers.handle_login();

    expect(thrown).toHaveLength(1);
    expect((thrown[0] as Error).name).toBe("VaultRolledBackError");
    expect(read_vault_generation_pin(USER_ID)).toBe(40);
    expect(page.navigate).not.toHaveBeenCalled();
    expect(page.set_error).toHaveBeenLastCalledWith(expect.any(String));
  });
});
