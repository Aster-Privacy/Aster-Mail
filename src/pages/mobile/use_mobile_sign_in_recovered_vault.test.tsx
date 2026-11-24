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
import type { TotpVerifyResponse } from "@/services/api/totp";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { refuse_rolled_back_vault_with_notice } from "@/contexts/auth/rolled_back_vault_notice";
import {
  pin_vault_generation,
  read_vault_generation_pin,
} from "@/services/crypto/vault_generation";

const USER_ID = "user-recovered-totp";

function at(generation: number): EncryptedVault {
  return {
    identity_key: "identity-a",
    previous_keys: [],
    vault_generation: generation,
  } as unknown as EncryptedVault;
}

const thrown: unknown[] = [];
const auth_state = { is_adding_account: false };

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
const navigate_mock = vi.fn();

vi.mock("react-router-dom", async (load_original) => ({
  ...(await load_original<typeof import("react-router-dom")>()),
  useNavigate: () => navigate_mock,
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    login: login_mock,
    add_account: add_account_mock,
    switch_to_account: vi.fn(),
    is_adding_account: auth_state.is_adding_account,
    set_is_adding_account: vi.fn(),
    is_authenticated: false,
    is_loading: false,
    current_account_id: null,
    accounts: [],
  }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: { clear_session_cookies: vi.fn() },
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({ theme: "light" }),
}));

vi.mock("@/hooks/use_platform", () => ({
  use_platform: () => ({ safe_area_insets: {} }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => false,
}));

vi.mock("@/services/crypto/key_manager", () => ({
  decrypt_vault: vi.fn(async () => at(25)),
}));

vi.mock("@/services/api/auth", () => ({
  get_user_info: vi.fn(async () => ({ data: null })),
}));

vi.mock("@/services/crypto/prekey_service", () => ({
  check_and_replenish_prekeys: vi.fn(async () => undefined),
}));

vi.mock("@/components/auth/turnstile_widget", () => ({}));

vi.mock("@/services/api/totp", () => ({
  get_totp_status: vi.fn(async () => ({ data: null })),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/lib/hard_redirect", () => ({
  get_app_query_param: () => null,
}));

vi.mock("@/pages/mobile/mobile_register", () => ({}));

const { use_mobile_sign_in } = await import("./use_mobile_sign_in");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let page: ReturnType<typeof use_mobile_sign_in> | null = null;

function Probe() {
  page = use_mobile_sign_in();

  return null;
}

function totp_response(marker: number | undefined): TotpVerifyResponse {
  return {
    user_id: USER_ID,
    username: "bordeaux",
    email: "bordeaux@astermail.org",
    csrf_token: "csrf",
    encrypted_vault: "dmF1bHQ=",
    vault_nonce: "bm9uY2U=",
    vault_recovered_write_count: marker,
  };
}

async function finish_totp(marker: number | undefined): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <Probe />
      </MemoryRouter>,
    );
  });

  await act(async () => {
    await page!.handle_totp_success(totp_response(marker));
  });
}

describe("mobile two-step sign-in after a recovery on another app", () => {
  beforeEach(() => {
    thrown.length = 0;
    page = null;
    navigate_mock.mockClear();
    login_mock.mockClear();
    add_account_mock.mockClear();
    auth_state.is_adding_account = false;
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
    await finish_totp(41);

    expect(login_mock).toHaveBeenCalledTimes(1);
    expect(thrown).toEqual([]);
    expect(read_vault_generation_pin(USER_ID)).toBe(25);
    expect(navigate_mock).toHaveBeenCalledWith("/");
  });

  it("adds the account with the recovered vault through add_account", async () => {
    auth_state.is_adding_account = true;

    await finish_totp(41);

    expect(add_account_mock).toHaveBeenCalledTimes(1);
    expect(thrown).toEqual([]);
    expect(read_vault_generation_pin(USER_ID)).toBe(25);
    expect(navigate_mock).toHaveBeenCalledWith("/");
  });

  it("still refuses the older vault when the server reports no recovery", async () => {
    await finish_totp(undefined);

    expect(thrown).toHaveLength(1);
    expect((thrown[0] as Error).name).toBe("VaultRolledBackError");
    expect(read_vault_generation_pin(USER_ID)).toBe(40);
    expect(navigate_mock).not.toHaveBeenCalledWith("/");
  });
});
