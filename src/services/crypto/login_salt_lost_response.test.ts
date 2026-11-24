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
  IncorrectCurrentPasswordError,
  LegacyLoginSaltError,
} from "@/services/crypto/auth_salt_guard";
import { array_to_base64, base64_to_array } from "@/services/crypto/base64";
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
import { store_encrypted_vault } from "@/contexts/auth/session_passphrase";

const EMAIL = "saved@astermail.org";
const PASSWORD = "correct horse battery staple";
const ROTATE_PATH = "/core/v1/auth/me/login-salt";
const SALT_PATH = "/core/v1/auth/salt";
const LONG_TEST = { timeout: 120000 };

type ServerAfterLostReply = "rotated" | "unchanged" | "other_device";

function short_salt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

function keep_pre_build_session(user_id: string): void {
  localStorage.setItem(`astermail_session_passphrase_${user_id}`, "c2VhbGVk");
  localStorage.setItem(`astermail_session_passphrase_iv_${user_id}`, "aXY=");
  store_encrypted_vault(user_id, "dmF1bHQ=", "bm9uY2U=");
}

function server_loses_rotation_reply(
  old_salt: Uint8Array,
  after: ServerAfterLostReply,
  lost_reply: () => Promise<unknown>,
): { sent_salt: () => Uint8Array | null } {
  let sent: Uint8Array | null = null;

  h.post.mockImplementation(async (path: string, body: unknown) => {
    if (path === ROTATE_PATH) {
      sent = base64_to_array(
        (body as { new_password_salt: string }).new_password_salt,
      );

      return lost_reply();
    }

    if (path === SALT_PATH) {
      const current =
        after === "rotated" && sent
          ? sent
          : after === "other_device"
            ? crypto.getRandomValues(new Uint8Array(32))
            : old_salt;

      return {
        data: {
          salt: array_to_base64(current),
          kdf_version: after === "unchanged" ? 1 : 2,
        },
      };
    }

    return { error: "unexpected", status: 500 };
  });

  return { sent_salt: () => sent };
}

function salt_lookups(): number {
  return h.post.mock.calls.filter(([path]) => path === SALT_PATH).length;
}

function signed_in_session(): void {
  h.account_id = "user-1";
  h.saved_emails = [EMAIL];
  h.session_password = PASSWORD;
  keep_pre_build_session("user-1");
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

describe("a step-up rotation whose reply is lost", () => {
  it(
    "recognizes a salt the server already rotated to the one this device sent",
    LONG_TEST,
    async () => {
      signed_in_session();
      const server = server_loses_rotation_reply(short_salt(), "rotated", () =>
        Promise.reject(new TypeError("network")),
      );

      const proof = await derive_current_account_proof(
        PASSWORD,
        short_salt(),
        1,
      ).catch((error: unknown) => error);
      const sent = server.sent_salt();

      expect(sent).not.toBeNull();

      const expected = await derive_password_hash(PASSWORD, sent!);

      expect(proof).toBe(expected.hash_v2);
      expect(read_session_login_salt("user-1")).toEqual(sent);
    },
  );

  it(
    "recognizes the rotation when the reply comes back as a gateway error",
    LONG_TEST,
    async () => {
      signed_in_session();
      const server = server_loses_rotation_reply(
        short_salt(),
        "rotated",
        async () => ({ error: "bad gateway", status: 502 }),
      );

      const proof = await derive_current_account_proof(
        PASSWORD,
        short_salt(),
        1,
      ).catch((error: unknown) => error);
      const expected = await derive_password_hash(
        PASSWORD,
        server.sent_salt()!,
      );

      expect(proof).toBe(expected.hash_v2);
    },
  );

  it("still refuses when the server kept the old salt", LONG_TEST, async () => {
    signed_in_session();
    const old_salt = short_salt();

    server_loses_rotation_reply(old_salt, "unchanged", () =>
      Promise.reject(new TypeError("network")),
    );

    await expect(
      derive_current_account_proof(PASSWORD, old_salt, 1),
    ).rejects.toBeInstanceOf(LegacyLoginSaltError);
    expect(read_session_login_salt("user-1")).toBeNull();
  });

  it(
    "still refuses when the server holds a salt this device did not send",
    LONG_TEST,
    async () => {
      signed_in_session();
      server_loses_rotation_reply(short_salt(), "other_device", () =>
        Promise.reject(new TypeError("network")),
      );

      await expect(
        derive_current_account_proof(PASSWORD, short_salt(), 1),
      ).rejects.toBeInstanceOf(LegacyLoginSaltError);
      expect(read_session_login_salt("user-1")).toBeNull();
    },
  );

  it(
    "recognizes the rotation when the client reports a network error",
    LONG_TEST,
    async () => {
      signed_in_session();
      const server = server_loses_rotation_reply(
        short_salt(),
        "rotated",
        async () => ({ error: "offline", code: "NETWORK_ERROR" }),
      );

      const proof = await derive_current_account_proof(
        PASSWORD,
        short_salt(),
        1,
      ).catch((error: unknown) => error);
      const expected = await derive_password_hash(
        PASSWORD,
        server.sent_salt()!,
      );

      expect(proof).toBe(expected.hash_v2);
    },
  );

  it(
    "does not look up the salt after a wrong password",
    LONG_TEST,
    async () => {
      signed_in_session();
      server_loses_rotation_reply(short_salt(), "rotated", async () => ({
        error: "invalid credentials",
        status: 401,
      }));

      await expect(
        derive_current_account_proof(PASSWORD, short_salt(), 1),
      ).rejects.toBeInstanceOf(IncorrectCurrentPasswordError);
      expect(salt_lookups()).toBe(0);
    },
  );

  it(
    "does not look up the salt after the server answers with a refusal",
    LONG_TEST,
    async () => {
      signed_in_session();
      server_loses_rotation_reply(short_salt(), "rotated", async () => ({
        error: "conflict",
        status: 409,
      }));

      await expect(
        derive_current_account_proof(PASSWORD, short_salt(), 1),
      ).rejects.toBeInstanceOf(LegacyLoginSaltError);
      expect(salt_lookups()).toBe(0);
    },
  );
});

describe("a sign-in rotation whose reply is lost", () => {
  it("keeps the rotated salt with the session", LONG_TEST, async () => {
    const old_salt = short_salt();
    const user_hash = await hash_email(EMAIL);

    h.saved_emails = [EMAIL];
    record_login_salt([user_hash_pin_key(user_hash)], old_salt);
    const server = server_loses_rotation_reply(old_salt, "rotated", () =>
      Promise.reject(new TypeError("network")),
    );

    await derive_sign_in_proof(PASSWORD, old_salt, 1, user_hash);
    h.account_id = "user-1";
    await flush_pending_login_enrollment("user-1");

    const sent = server.sent_salt();

    expect(sent).not.toBeNull();
    expect(read_session_login_salt("user-1")).toEqual(sent);
  });

  it(
    "keeps the old salt when the server did not rotate",
    LONG_TEST,
    async () => {
      const old_salt = short_salt();
      const user_hash = await hash_email(EMAIL);

      h.saved_emails = [EMAIL];
      record_login_salt([user_hash_pin_key(user_hash)], old_salt);
      server_loses_rotation_reply(old_salt, "unchanged", () =>
        Promise.reject(new TypeError("network")),
      );

      await derive_sign_in_proof(PASSWORD, old_salt, 1, user_hash);
      h.account_id = "user-1";
      await flush_pending_login_enrollment("user-1");

      expect(read_session_login_salt("user-1")).toEqual(old_salt);
    },
  );

  it(
    "does not look up the salt after the server answers with a refusal",
    LONG_TEST,
    async () => {
      const old_salt = short_salt();
      const user_hash = await hash_email(EMAIL);

      h.saved_emails = [EMAIL];
      record_login_salt([user_hash_pin_key(user_hash)], old_salt);
      server_loses_rotation_reply(old_salt, "rotated", async () => ({
        error: "conflict",
        status: 409,
      }));

      await derive_sign_in_proof(PASSWORD, old_salt, 1, user_hash);
      h.account_id = "user-1";
      await flush_pending_login_enrollment("user-1");

      expect(salt_lookups()).toBe(0);
      expect(read_session_login_salt("user-1")).toEqual(old_salt);
    },
  );
});
