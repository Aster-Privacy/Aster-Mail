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
  post: vi.fn(),
  get: vi.fn(),
  account_id: null as string | null,
  saved_emails: [] as string[],
  session_password: null as string | null,
}));

vi.mock("@/services/crypto/memory_key_store", async (load_original) => ({
  ...(await load_original<Record<string, unknown>>()),
  has_passphrase_in_memory: () => h.session_password !== null,
  verify_passphrase_for_export: (entered: string) =>
    h.session_password !== null && entered === h.session_password,
}));

vi.mock("@/services/api/client", () => ({
  api_client: { post: h.post, get: h.get },
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: vi.fn(async () => h.account_id),
  get_all_accounts: vi.fn(async () =>
    h.saved_emails.map((email) => ({ user: { email } })),
  ),
  get_current_account: vi.fn(async () =>
    h.account_id && h.saved_emails.length > 0
      ? { id: h.account_id, user: { email: h.saved_emails[0] } }
      : null,
  ),
}));

import {
  AuthSaltCollisionError,
  IncorrectCurrentPasswordError,
  LegacyLoginSaltError,
} from "@/services/crypto/auth_salt_guard";
import { base64_to_array } from "@/services/crypto/base64";
import {
  derive_password_hash,
  hash_email,
} from "@/services/crypto/key_manager";
import {
  clear_pending_login_enrollment,
  derive_current_account_proof,
  derive_sign_in_proof,
  flush_pending_login_enrollment,
  record_login_salt,
  user_hash_pin_key,
} from "@/services/crypto/login_proof";
import { read_session_login_salt } from "@/services/crypto/session_login_salt";
import {
  clear_session_passphrase,
  store_encrypted_vault,
} from "@/contexts/auth/session_passphrase";

const EMAIL = "saved@astermail.org";
const OTHER_EMAIL = "other@astermail.org";
const PASSWORD = "correct horse battery staple";

function short_salt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

function long_salt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function sign_in(
  email: string,
  user_id: string,
  salt: Uint8Array,
  kdf_version: 1 | 2,
): Promise<void> {
  h.saved_emails = [email];
  await derive_sign_in_proof(
    PASSWORD,
    salt,
    kdf_version,
    await hash_email(email),
  );
  h.account_id = user_id;
  await flush_pending_login_enrollment(user_id);
}

function keep_pre_build_session(user_id: string): void {
  localStorage.setItem(`astermail_session_passphrase_${user_id}`, "c2VhbGVk");
  localStorage.setItem(`astermail_session_passphrase_iv_${user_id}`, "aXY=");
  store_encrypted_vault(user_id, "dmF1bHQ=", "bm9uY2U=");
}

beforeEach(() => {
  localStorage.clear();
  clear_pending_login_enrollment();
  h.post.mockReset();
  h.get.mockReset();
  h.account_id = null;
  h.saved_emails = [];
  h.session_password = null;
});

function rotation_body(call_index: number): Record<string, unknown> {
  const [path, body] = h.post.mock.calls[call_index];

  expect(path).toBe("/core/v1/auth/me/login-salt");

  return body as Record<string, unknown>;
}

describe("a session with no record and no session salt", () => {
  it("refuses a short salt the server substitutes at step-up", async () => {
    h.account_id = "user-1";
    h.saved_emails = [EMAIL];
    keep_pre_build_session("user-1");

    await expect(
      derive_current_account_proof(PASSWORD, short_salt(), 1),
    ).rejects.toBeInstanceOf(LegacyLoginSaltError);
    expect(h.post).not.toHaveBeenCalled();
  });

  it("refuses a short salt on a fresh device with no local session", async () => {
    const user_hash = await hash_email(EMAIL);
    const salt = short_salt();

    h.saved_emails = [EMAIL];

    await expect(
      derive_sign_in_proof(PASSWORD, salt, 1, user_hash),
    ).rejects.toBeInstanceOf(LegacyLoginSaltError);

    h.account_id = "user-1";

    await expect(
      derive_current_account_proof(PASSWORD, salt, 1),
    ).rejects.toBeInstanceOf(LegacyLoginSaltError);
    expect(read_session_login_salt("user-1")).toBeNull();
    expect(h.post).not.toHaveBeenCalled();
  });
});

describe("a signed-in session with a short legacy salt", () => {
  it("rotates to a fresh salt, then step-up succeeds, and a server-supplied short salt is still refused", async () => {
    h.account_id = "user-1";
    h.saved_emails = [EMAIL];
    h.session_password = PASSWORD;
    keep_pre_build_session("user-1");
    h.post.mockResolvedValue({ data: { kdf_version: 2 } });

    const server_salt = short_salt();
    const proof = await derive_current_account_proof(
      PASSWORD,
      server_salt,
      1,
    ).catch((error: unknown) => error);

    expect(proof).not.toBeInstanceOf(LegacyLoginSaltError);
    expect(h.post).toHaveBeenCalledTimes(1);

    const body = rotation_body(0);
    const current = await derive_password_hash(PASSWORD, server_salt);

    expect(body.password_hash).toBe(current.hash);
    expect(body).not.toHaveProperty("password_hash_v2");

    const new_salt = base64_to_array(body.new_password_salt as string);

    expect(new_salt.length).toBe(32);
    expect(new_salt).not.toEqual(server_salt);

    const expected = await derive_password_hash(PASSWORD, new_salt);

    expect(body.new_password_hash).toBeUndefined();
    expect(body.new_password_hash_v2).toBe(expected.hash_v2);
    expect(body.new_password_hash_v2).not.toBe(current.hash_v2);
    expect(proof).toBe(expected.hash_v2);
    expect(read_session_login_salt("user-1")).toEqual(new_salt);

    await expect(
      derive_current_account_proof(PASSWORD, new_salt, 2),
    ).resolves.toBe(expected.hash_v2);

    const refused = await derive_current_account_proof(
      PASSWORD,
      short_salt(),
      1,
    ).catch((error: unknown) => error);

    expect(
      refused instanceof LegacyLoginSaltError ||
        refused instanceof AuthSaltCollisionError,
    ).toBe(true);
    expect(h.post).toHaveBeenCalledTimes(1);
  });

  it("stays refused when the server does not accept the rotation", async () => {
    h.account_id = "user-1";
    h.saved_emails = [EMAIL];
    h.session_password = PASSWORD;
    keep_pre_build_session("user-1");
    h.post.mockRejectedValue(new Error("step up required"));

    const server_salt = short_salt();

    await expect(
      derive_current_account_proof(PASSWORD, server_salt, 1),
    ).rejects.toMatchObject({
      translation_key: "errors.legacy_login_salt_new_device",
    });
    expect(h.post).toHaveBeenCalledTimes(1);

    const body = rotation_body(0);
    const server_proof = await derive_password_hash(PASSWORD, server_salt);

    expect(body.password_hash).toBe(server_proof.hash);
    expect(body.new_password_hash).not.toBe(server_proof.hash);
    expect(Object.values(body)).not.toContain(server_proof.hash_v2);
    expect(read_session_login_salt("user-1")).toBeNull();
  });

  it("reports a wrong password when the server refuses the current proof", async () => {
    h.account_id = "user-1";
    h.saved_emails = [EMAIL];
    h.session_password = PASSWORD;
    keep_pre_build_session("user-1");
    h.post.mockResolvedValue({ error: "invalid credentials", status: 401 });

    await expect(
      derive_current_account_proof(PASSWORD, short_salt(), 1),
    ).rejects.toBeInstanceOf(IncorrectCurrentPasswordError);
    expect(h.post).toHaveBeenCalledTimes(1);
    expect(read_session_login_salt("user-1")).toBeNull();
  });

  it("does not rotate when the password does not match the unlocked session", async () => {
    h.account_id = "user-1";
    h.saved_emails = [EMAIL];
    h.session_password = "a different password";
    keep_pre_build_session("user-1");

    await expect(
      derive_current_account_proof(PASSWORD, short_salt(), 1),
    ).rejects.toBeInstanceOf(IncorrectCurrentPasswordError);
    expect(h.post).not.toHaveBeenCalled();
  });
});

describe("the session login salt store", () => {
  it("is cleared when the account signs out", async () => {
    const salt = long_salt();

    await sign_in(EMAIL, "user-1", salt, 1);
    expect(read_session_login_salt("user-1")).toEqual(salt);

    await clear_session_passphrase("user-1");

    expect(read_session_login_salt("user-1")).toBeNull();
  });

  it("keeps each account's salt to that account", async () => {
    const first = long_salt();
    const second = long_salt();

    await sign_in(EMAIL, "user-1", first, 1);
    await sign_in(OTHER_EMAIL, "user-2", second, 1);

    expect(read_session_login_salt("user-1")).toEqual(first);
    expect(read_session_login_salt("user-2")).toEqual(second);

    await clear_session_passphrase("user-1");

    expect(read_session_login_salt("user-1")).toBeNull();
    expect(read_session_login_salt("user-2")).toEqual(second);
  });

  it("does not keep a short kdf v2 salt fresh from the server", async () => {
    await sign_in(EMAIL, "user-1", short_salt(), 2);

    expect(read_session_login_salt("user-1")).toBeNull();
  });

  it("keeps a short kdf v2 salt that matched a record on this device", async () => {
    const salt = short_salt();

    record_login_salt([user_hash_pin_key(await hash_email(EMAIL))], salt);
    await sign_in(EMAIL, "user-1", salt, 2);

    expect(read_session_login_salt("user-1")).toEqual(salt);
  });

  it("keeps a short kdf v1 salt that this device recorded", async () => {
    const salt = short_salt();

    record_login_salt([user_hash_pin_key(await hash_email(EMAIL))], salt);
    await sign_in(EMAIL, "user-1", salt, 1);

    expect(read_session_login_salt("user-1")).toEqual(salt);
  });
});
