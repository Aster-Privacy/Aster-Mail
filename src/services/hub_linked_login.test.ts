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
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { randomBytes } from "@noble/hashes/utils";

import type { DevicePubkeys } from "@/native/desktop_device_auth";
import {
  type envelope_version,
  base64url_decode,
  base64url_encode,
  seal_vault_key_for_device,
} from "@/lib/crypto/device_envelope";

const state = {
  request: null as DevicePubkeys | null,
  version: 2 as envelope_version,
  swap_signing_key: false,
};

const request_device_code = vi.fn(async (pubkeys: DevicePubkeys) => {
  state.request = pubkeys;

  return { code: "ABCD1234", expires_in: 600 };
});

async function sealed_for_request(): Promise<string> {
  const request = state.request;

  if (!request) throw new Error("no device code request");
  const ed25519_pk = state.swap_signing_key
    ? ed25519.getPublicKey(randomBytes(32))
    : base64url_decode(request.ed25519_pk);
  const sealed = await seal_vault_key_for_device(
    new TextEncoder().encode("hub passphrase"),
    {
      ed25519_pk,
      mlkem_pk: base64url_decode(request.mlkem_pk),
      x25519_pk: base64url_decode(request.x25519_pk),
    },
    state.version,
  );

  return base64url_encode(sealed);
}

vi.mock("@/native/desktop_device_auth", () => ({
  request_device_code: (pubkeys: DevicePubkeys) =>
    request_device_code(pubkeys),
  poll_device_code_status: async () => ({
    status: "confirmed",
    device_id: "device-1",
    sealed_envelope: await sealed_for_request(),
  }),
  device_challenge: async () => ({
    challenge_id: "challenge-1",
    nonce: base64url_encode(new Uint8Array(32).fill(7)),
  }),
  device_login: async () => ({
    user_id: "account-1",
    username: "user",
    email: "user@example.com",
    encrypted_vault: "vault",
    vault_nonce: "nonce",
  }),
}));

vi.mock("@/services/account_hub_link", () => ({
  confirm_hub_link: vi.fn(async () => undefined),
  HubAccountError: class HubAccountError extends Error {},
}));

beforeEach(() => {
  state.request = null;
  state.version = 2;
  state.swap_signing_key = false;
  request_device_code.mockClear();
});

describe("sign_in_with_hub_account", () => {
  it.each([1, 2] as const)(
    "opens a v%i envelope sealed to this sign-in",
    async (version) => {
      state.version = version;
      const { sign_in_with_hub_account } = await import("./hub_linked_login");

      const result = await sign_in_with_hub_account("account-1", "Aster Mail");

      expect(result.passphrase).toBe("hub passphrase");
      expect(result.login_response.user_id).toBe("account-1");
    },
  );

  it("refuses a v2 envelope sealed to another signing key", async () => {
    state.swap_signing_key = true;
    const { sign_in_with_hub_account } = await import("./hub_linked_login");

    await expect(
      sign_in_with_hub_account("account-1", "Aster Mail"),
    ).rejects.toThrow();
  });
});
