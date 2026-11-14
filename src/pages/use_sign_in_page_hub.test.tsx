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

const h = vi.hoisted(() => {
  class HubAccountError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }

  return {
    HubAccountError,
    is_authenticated: false,
    login: vi.fn(async () => undefined),
    clear_session_cookies: vi.fn(async () => undefined),
    get_user_salt: vi.fn(async () => ({
      error: null,
      data: { salt: "c2FsdA==" },
    })),
    login_user: vi.fn(
      async (): Promise<{ error: string | null; data: unknown }> => ({
        error: "stop here",
        data: null,
      }),
    ),
    decrypt_vault: vi.fn(async (): Promise<unknown> => ({})),
    sign_in_with_hub_account: vi.fn(async (): Promise<unknown> => null),
  };
});

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
  decrypt_vault: h.decrypt_vault,
  base64_to_array: () => new Uint8Array(32),
}));

vi.mock("@/services/account_hub_link", () => ({
  HubAccountError: h.HubAccountError,
  on_hub_accounts_changed: () => () => undefined,
  read_hub_accounts: async () => [],
  uses_account_hub: () => true,
}));

vi.mock("@/services/hub_linked_login", () => ({
  sign_in_with_hub_account: h.sign_in_with_hub_account,
}));

vi.mock("@/native/desktop_device_auth", () => ({
  is_tauri: () => false,
}));

const { use_sign_in_page } = await import("./use_sign_in_page");

type hook_result = ReturnType<typeof use_sign_in_page>;

const ACCOUNT = {
  id: "acct-9",
  email: "someone@astermail.org",
  linkable: true,
} as Parameters<hook_result["handle_hub_account"]>[0];

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

describe("continue with a signed-in account", () => {
  beforeEach(() => {
    h.sign_in_with_hub_account.mockReset();
    window.history.replaceState({}, "", "/sign-in");
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    latest = null;
    window.history.replaceState({}, "", "/");
  });

  it.each(["fingerprint_required", "fingerprint_mismatch", "link_failed"])(
    "asks for the password when the account page answers %s",
    async (code) => {
      h.sign_in_with_hub_account.mockRejectedValueOnce(
        new h.HubAccountError(code),
      );
      await mount();
      await flush();

      await act(async () => {
        await latest!.handle_hub_account(ACCOUNT);
      });
      await flush();

      expect(latest!.error).toBe("auth.hub_account_link_failed");
    },
  );
});
