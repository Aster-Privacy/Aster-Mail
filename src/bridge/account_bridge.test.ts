//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, vi, beforeEach } from "vitest";

const LINK_ORIGIN = "https://app.link.test";
const SUPPORT_ORIGIN = "https://support.link.test";
const CHANNEL = "aster_account_link";
const PICTURE = "data:image/png;base64,AAAA";

const state = vi.hoisted(() => {
  sessionStorage.setItem(
    "aster_bridge_link_attempts",
    JSON.stringify({ failed: 2, linked: 0 }),
  );

  return {
    accounts: [] as Array<Record<string, unknown>>,
    current_id: "acct_a" as string | null,
    replies: [] as Array<Record<string, unknown>>,
    purge: vi.fn(async () => undefined),
    remove: vi.fn<(id: string) => Promise<{ removed: boolean }>>(async () => ({
      removed: true,
    })),
    switch_to: vi.fn(async () => true),
    verify: vi.fn(async () => ({ error: "not_found", code: "NOT_FOUND" })),
  };
});

vi.mock("@/services/account_manager", () => ({
  ACCOUNTS_CHANGED_EVENT: "aster:accounts_changed",
  accounts_storage_unreadable: () => false,
  get_all_accounts: async () => state.accounts,
  get_current_account_id: async () => state.current_id,
  remove_account: state.remove,
  switch_account: state.switch_to,
  update_account_tokens: async () => undefined,
}));

vi.mock("@/contexts/auth/session_passphrase", () => ({
  clear_session_passphrase: async () => undefined,
  clear_stored_encrypted_vault: () => undefined,
  get_session_passphrase: async () => "passphrase",
  get_stored_encrypted_vault: () => "vault",
  has_stored_session_passphrase: () => true,
}));

vi.mock("@/contexts/auth/purge_local_data", () => ({
  purge_all_local_data: state.purge,
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    post: async () => ({}),
    clear_auth_data: () => undefined,
  },
}));

vi.mock("@/services/api/client/helpers", () => ({
  API_BASE_URL: "https://api.link.test",
  CLIENT_PLATFORM_HEADER: "web",
}));

vi.mock("@/services/api/devices", () => ({
  confirm_device_code: async () => ({ data: {} }),
  verify_device_code: state.verify,
}));

vi.mock("@/services/api/switch", () => ({
  unlink_account_device: async () => undefined,
}));

vi.mock("@/services/device_id", () => ({ get_device_id: () => null }));

vi.mock("@/services/session_timeout_service", () => ({
  clear_session_timeout_data: () => undefined,
}));

vi.mock("@/services/app_lock_store", () => ({
  clear_app_lock_config: () => undefined,
  clear_session_unlock: () => undefined,
}));

vi.mock("@/lib/support_return", () => ({
  account_link_origins: () => [LINK_ORIGIN],
  support_site_origins: () => [SUPPORT_ORIGIN],
}));

vi.mock("@/lib/crypto/device_envelope", () => ({
  base64url_decode: () => new Uint8Array(32),
  base64url_encode: () => "envelope",
  seal_vault_key_for_device: async () => new Uint8Array(8),
}));

const fake_parent = {
  postMessage: (message: Record<string, unknown>) => {
    state.replies.push(message);
  },
};

Object.defineProperty(window, "parent", {
  configurable: true,
  value: fake_parent,
});

await import("./account_bridge");

let next_id = 0;

async function ask(
  origin: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  next_id += 1;
  const id = `req_${next_id}`;

  window.dispatchEvent(
    new MessageEvent("message", {
      data: { channel: CHANNEL, id, ...payload },
      origin,
      source: fake_parent as unknown as Window,
    }),
  );

  await vi.waitFor(() => {
    expect(state.replies.some((reply) => reply.id === id)).toBe(true);
  });

  return state.replies.find((reply) => reply.id === id)!;
}

function account(id: string): Record<string, unknown> {
  return {
    id,
    kind: "personal",
    refresh_token: null,
    user: {
      email: `${id}@astermail.org`,
      display_name: id,
      profile_color: null,
      profile_picture: PICTURE,
    },
  };
}

beforeEach(() => {
  state.accounts = [account("acct_a"), account("acct_b")];
  state.current_id = "acct_a";
  state.purge.mockClear();
  state.remove.mockClear();
  state.switch_to.mockClear();
  state.verify.mockClear();
});

describe("account bridge", () => {
  it("keeps the failed link count from before a reload", async () => {
    const first = await ask(LINK_ORIGIN, {
      action: "link",
      code: "code_one",
      account_id: "acct_a",
    });

    expect(first.ok).toBe(false);
    expect(first.error).toBe("code_not_found");

    const second = await ask(LINK_ORIGIN, {
      action: "link",
      code: "code_two",
      account_id: "acct_a",
    });

    expect(second.error).toBe("rate_limited");
    expect(state.verify).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(sessionStorage.getItem("aster_bridge_link_attempts")!),
    ).toEqual({ failed: 3, linked: 0 });
  });

  it("does not give the support site profile pictures", async () => {
    const reply = await ask(SUPPORT_ORIGIN, { action: "accounts" });
    const accounts = reply.accounts as Array<Record<string, unknown>>;

    expect(reply.ok).toBe(true);
    expect(accounts.map((item) => item.email)).toEqual([
      "acct_a@astermail.org",
      "acct_b@astermail.org",
    ]);
    expect(accounts.every((item) => item.profile_picture === null)).toBe(true);
  });

  it("still gives the app its profile pictures", async () => {
    const reply = await ask(LINK_ORIGIN, { action: "accounts" });
    const accounts = reply.accounts as Array<Record<string, unknown>>;

    expect(accounts.every((item) => item.profile_picture === PICTURE)).toBe(
      true,
    );
  });

  it("refuses to let the support site switch accounts", async () => {
    const reply = await ask(SUPPORT_ORIGIN, {
      action: "set_current",
      account_id: "acct_b",
    });

    expect(reply).toMatchObject({ ok: false, error: "unsupported" });
    expect(state.switch_to).not.toHaveBeenCalled();
  });

  it("refuses to let the support site link a device", async () => {
    const reply = await ask(SUPPORT_ORIGIN, {
      action: "link",
      code: "code_three",
      account_id: "acct_a",
    });

    expect(reply).toMatchObject({ ok: false, error: "unsupported" });
  });

  it("signs out each account instead of wiping the device for the support site", async () => {
    const reply = await ask(SUPPORT_ORIGIN, { action: "sign_out", all: true });

    expect(reply).toMatchObject({ ok: true, removed: 2 });
    expect(state.purge).not.toHaveBeenCalled();
    expect(state.remove.mock.calls.map((call) => call[0])).toEqual([
      "acct_a",
      "acct_b",
    ]);
  });

  it("keeps the full device sign-out for the app", async () => {
    const reply = await ask(LINK_ORIGIN, { action: "sign_out", all: true });

    expect(reply).toMatchObject({ ok: true, removed: 2 });
    expect(state.purge).toHaveBeenCalledTimes(1);
  });

  it("lets the support site sign out one account", async () => {
    const reply = await ask(SUPPORT_ORIGIN, {
      action: "sign_out",
      account_ids: ["acct_b"],
    });

    expect(reply).toMatchObject({ ok: true, removed: 1 });
    expect(state.remove.mock.calls.map((call) => call[0])).toEqual(["acct_b"]);
  });
});
