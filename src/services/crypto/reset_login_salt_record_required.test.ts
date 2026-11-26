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
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  account_id: null as string | null,
  account_email: null as string | null,
}));

vi.mock("@/services/api/client", () => ({
  api_client: { post: vi.fn(), get: vi.fn() },
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: vi.fn(async () => h.account_id),
  get_all_accounts: vi.fn(async () =>
    h.account_email ? [{ user: { email: h.account_email } }] : [],
  ),
  get_current_account: vi.fn(async () =>
    h.account_id && h.account_email
      ? { id: h.account_id, user: { email: h.account_email } }
      : null,
  ),
}));

import {
  AuthSaltCollisionError,
  IncorrectCurrentPasswordError,
  LegacyLoginSaltError,
} from "@/services/crypto/auth_salt_guard";
import { array_to_base64 } from "@/services/crypto/base64";
import {
  derive_password_hash,
  hash_email,
} from "@/services/crypto/key_manager";
import {
  pin_accounts,
  record_login_salt,
  user_hash_pin_key,
  user_id_pin_key,
} from "@/services/crypto/login_proof";
import {
  derive_reset_vault_proof,
  reset_vault_proof_error_key,
} from "@/services/crypto/reset_vault_proof";

const ADDRESS = "saved@astermail.org";
const PASSWORD = "correct horse battery staple";

function short_salt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

function long_salt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

function source(salt: Uint8Array, kdf_version: number) {
  return { password_salt: array_to_base64(salt), kdf_version };
}

beforeEach(() => {
  localStorage.clear();
  h.account_id = null;
  h.account_email = null;
});

describe("a password reset proof needs a recorded short login salt", () => {
  it("refuses an unrecorded short salt on a device with no record", async () => {
    await expect(
      derive_reset_vault_proof(PASSWORD, source(short_salt(), 1), ADDRESS),
    ).rejects.toBeInstanceOf(LegacyLoginSaltError);
  });

  it("refuses an unrecorded short salt when no address is known", async () => {
    await expect(
      derive_reset_vault_proof(PASSWORD, source(short_salt(), 1)),
    ).rejects.toBeInstanceOf(LegacyLoginSaltError);
  });

  it("accepts the short salt this device recorded for the address", async () => {
    const salt = short_salt();

    record_login_salt([user_hash_pin_key(await hash_email(ADDRESS))], salt);

    const expected = await derive_password_hash(PASSWORD, salt);

    await expect(
      derive_reset_vault_proof(PASSWORD, source(salt, 1), ADDRESS),
    ).resolves.toBe(expected.hash);
  });

  it("refuses a different short salt from the one recorded", async () => {
    record_login_salt(
      [user_hash_pin_key(await hash_email(ADDRESS))],
      short_salt(),
    );

    await expect(
      derive_reset_vault_proof(PASSWORD, source(short_salt(), 1), ADDRESS),
    ).rejects.toBeInstanceOf(LegacyLoginSaltError);
  });

  it("uses the signed-in record only when the reset is for that account", async () => {
    const salt = short_salt();

    h.account_id = "user-1";
    h.account_email = "other@astermail.org";
    record_login_salt([user_id_pin_key("user-1")], salt);

    await expect(
      derive_reset_vault_proof(PASSWORD, source(salt, 1), ADDRESS),
    ).rejects.toBeInstanceOf(LegacyLoginSaltError);

    h.account_email = ADDRESS;

    await expect(
      derive_reset_vault_proof(PASSWORD, source(salt, 1), ADDRESS),
    ).resolves.toBeTypeOf("string");
  });

  it("accepts a full length salt without a record", async () => {
    const salt = long_salt();
    const expected = await derive_password_hash(PASSWORD, salt);

    await expect(
      derive_reset_vault_proof(PASSWORD, source(salt, 1), ADDRESS),
    ).resolves.toBe(expected.hash);
  });

  it("does not need a record for the current key derivation", async () => {
    const salt = short_salt();
    const expected = await derive_password_hash(PASSWORD, salt);

    await expect(
      derive_reset_vault_proof(PASSWORD, source(salt, 2), ADDRESS),
    ).resolves.toBe(expected.hash_v2);
  });

  it("refuses the older derivation for an account this device moved past it", async () => {
    pin_accounts([user_hash_pin_key(await hash_email(ADDRESS))]);

    await expect(
      derive_reset_vault_proof(PASSWORD, source(long_salt(), 1), ADDRESS),
    ).rejects.toBeInstanceOf(AuthSaltCollisionError);
  });
});

describe("reset_vault_proof_error_key", () => {
  it("maps each refusal to the message the reset page shows", () => {
    expect(
      reset_vault_proof_error_key(new LegacyLoginSaltError("step_up")),
    ).toBe("auth.reset_legacy_login_salt");
    expect(
      reset_vault_proof_error_key(new IncorrectCurrentPasswordError()),
    ).toBe("settings.current_password_incorrect");
    expect(reset_vault_proof_error_key(new AuthSaltCollisionError())).toBe(
      "errors.auth_salt_collision",
    );
    expect(reset_vault_proof_error_key(new Error("other"))).toBeNull();
  });
});
