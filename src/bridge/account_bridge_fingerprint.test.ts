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
import { describe, it, expect, vi, beforeEach } from "vitest";

const LINK_ORIGIN = "https://app.link.test";
const SUPPORT_ORIGIN = "https://support.link.test";
const CHANNEL = "aster_account_link";
const FINGERPRINT = "9B16 AF79 0A6A E2F2 55D3";
const OTHER_FINGERPRINT = "0000 1111 2222 3333 4444";

function encode(length: number, value: number): string {
  return btoa(String.fromCharCode(...new Uint8Array(length).fill(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const state = vi.hoisted(() => ({
  replies: [] as Array<Record<string, unknown>>,
  verify: vi.fn(),
  confirm: vi.fn(async () => ({ data: {} })),
  seal: vi.fn(async () => new Uint8Array(8)),
}));

vi.mock("@/services/account_manager", () => ({
  ACCOUNTS_CHANGED_EVENT: "aster:accounts_changed",
  accounts_storage_unreadable: () => false,
  get_all_accounts: async () => [
    {
      id: "acct_a",
      kind: "personal",
      refresh_token: null,
      user: {
        email: "acct_a@astermail.org",
        display_name: "acct_a",
        profile_color: null,
        profile_picture: null,
      },
    },
  ],
  get_current_account_id: async () => "acct_a",
  remove_account: async () => ({ removed: true }),
  switch_account: async () => true,
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
  purge_all_local_data: async () => undefined,
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
  confirm_device_code: state.confirm,
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

vi.mock("@/lib/crypto/device_envelope", async (original) => ({
  ...(await original<typeof import("@/lib/crypto/device_envelope")>()),
  seal_vault_key_for_device: state.seal,
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
  const id = `preview_${next_id}`;

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

beforeEach(() => {
  sessionStorage.removeItem("aster_bridge_link_attempts");
  state.verify.mockReset();
  state.verify.mockResolvedValue({
    data: {
      ed25519_pk: encode(32, 1),
      mlkem_pk: encode(1184, 2),
      x25519_pk: encode(32, 3),
      machine_name: "desk",
    },
  });
  state.confirm.mockClear();
  state.seal.mockClear();
});

describe("account bridge device fingerprint", () => {
  it("returns the fingerprint of the device keys without sealing anything", async () => {
    const reply = await ask(LINK_ORIGIN, {
      action: "link_preview",
      code: "code_one",
      account_id: "acct_a",
    });

    expect(reply).toMatchObject({
      ok: true,
      fingerprint: FINGERPRINT,
      machine_name: "desk",
    });
    expect(state.seal).not.toHaveBeenCalled();
    expect(state.confirm).not.toHaveBeenCalled();
  });

  it("refuses to link when the keys no longer match the shown fingerprint", async () => {
    const reply = await ask(LINK_ORIGIN, {
      action: "link",
      code: "code_one",
      account_id: "acct_a",
      fingerprint: OTHER_FINGERPRINT,
    });

    expect(reply).toMatchObject({ ok: false, error: "fingerprint_mismatch" });
    expect(state.seal).not.toHaveBeenCalled();
    expect(state.confirm).not.toHaveBeenCalled();
  });

  it("links when the keys match the shown fingerprint", async () => {
    const reply = await ask(LINK_ORIGIN, {
      action: "link",
      code: "code_one",
      account_id: "acct_a",
      fingerprint: FINGERPRINT,
    });

    expect(reply.ok).toBe(true);
    expect(state.confirm).toHaveBeenCalledTimes(1);
  });

  it("rejects a fingerprint that is not in the displayed format", async () => {
    const reply = await ask(LINK_ORIGIN, {
      action: "link",
      code: "code_one",
      account_id: "acct_a",
      fingerprint: "9b16af790a6ae2f255d3",
    });

    expect(reply).toMatchObject({ ok: false, error: "unsupported" });
    expect(state.verify).not.toHaveBeenCalled();
  });

  it("does not give a preview for keys it cannot fingerprint", async () => {
    state.verify.mockResolvedValue({
      data: {
        ed25519_pk: encode(32, 1),
        mlkem_pk: encode(64, 2),
        x25519_pk: encode(32, 3),
        machine_name: "desk",
      },
    });

    const reply = await ask(LINK_ORIGIN, {
      action: "link_preview",
      code: "code_one",
      account_id: "acct_a",
    });

    expect(reply.ok).toBe(false);
    expect(reply.fingerprint).toBeUndefined();
  });

  it("refuses to give the support site a preview", async () => {
    const reply = await ask(SUPPORT_ORIGIN, {
      action: "link_preview",
      code: "code_one",
      account_id: "acct_a",
    });

    expect(reply).toMatchObject({ ok: false, error: "unsupported" });
    expect(state.verify).not.toHaveBeenCalled();
  });
});
