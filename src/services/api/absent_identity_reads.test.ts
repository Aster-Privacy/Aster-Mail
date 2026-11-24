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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const context_fallback = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    get: (...args: unknown[]) => get(...args),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_account_context_with_fallback: (...args: unknown[]) =>
    context_fallback(...args),
  decrypt_aes_gcm_with_fallback: vi.fn(),
}));

vi.mock("@/services/crypto/account_data_writer", () => ({
  account_data_write_key: vi.fn(async () => null),
  retry_after_account_key_load: <T>(run: () => Promise<T>) => run(),
}));

import { get_onboarding_state } from "./onboarding";
import { get_dev_mode } from "./preferences_dev_mode";

import { load_subscription_cache } from "@/services/subscription_cache";

const SEALED = btoa("sealed-bytes-0000");
const NONCE = btoa("nonce-000000");

function vault_with(identity_key: string | undefined): EncryptedVault {
  return { identity_key } as unknown as EncryptedVault;
}

const readers: [string, (vault: EncryptedVault) => Promise<unknown>, object][] =
  [
    [
      "onboarding",
      get_onboarding_state,
      {
        encrypted_state: SEALED,
        state_nonce: NONCE,
        is_completed: false,
        is_skipped: false,
      },
    ],
    [
      "dev mode",
      get_dev_mode,
      { encrypted_dev_mode: SEALED, dev_mode_nonce: NONCE },
    ],
    [
      "subscriptions",
      load_subscription_cache,
      { encrypted_subscriptions: SEALED, subscriptions_nonce: NONCE },
    ],
  ];

beforeEach(() => {
  get.mockReset();
  context_fallback.mockReset();
  context_fallback.mockRejectedValue(new Error("not readable"));
});

describe("account settings reads without an identity key", () => {
  describe.each(readers)("%s", (_name, read, payload) => {
    it("derives a key when the identity key is present", async () => {
      get.mockResolvedValue({ data: payload });

      await read(vault_with("identity-key-material"));

      expect(context_fallback).toHaveBeenCalledTimes(1);
      expect(context_fallback.mock.calls[0][1]).toBeInstanceOf(CryptoKey);
    });

    it.each([undefined, "", "undefined", "null"])(
      "passes no primary key for an absent identity (%s)",
      async (identity_key) => {
        get.mockResolvedValue({ data: payload });

        await read(vault_with(identity_key));

        expect(context_fallback).toHaveBeenCalledTimes(1);
        expect(context_fallback.mock.calls[0][1]).toBeNull();
      },
    );
  });
});
