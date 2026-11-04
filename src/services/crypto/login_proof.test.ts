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
  account_id: null as string | null,
  saved_emails: [] as string[],
}));

vi.mock("@/services/api/client", () => ({
  api_client: { post: h.post },
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
  LegacyLoginSaltError,
  login_safety_error_key,
} from "@/services/crypto/auth_salt_guard";
import { array_to_base64, base64_to_array } from "@/services/crypto/base64";
import {
  derive_login_v2_bytes,
  derive_password_hash,
} from "@/services/crypto/key_manager_pgp_keygen";
import { encrypt_vault } from "@/services/crypto/key_manager_pgp_vault";
import { hash_email } from "@/services/crypto/key_manager";
import {
  clear_pending_login_enrollment,
  derive_account_proof,
  derive_current_account_proof,
  derive_sign_in_proof,
  flush_pending_login_enrollment,
  forget_login_salt_records,
  is_account_pinned,
  match_login_salt_record,
  pin_accounts,
  read_kdf_version,
  record_current_account_login_salt,
  record_login_salt,
  remember_saved_login_accounts,
  unpin_accounts,
  user_hash_pin_key,
  user_id_pin_key,
  v1_proofs_allowed,
} from "@/services/crypto/login_proof";

const PASSWORD = "correct horse battery staple";

function salt(fill: number, length = 32): Uint8Array {
  return new Uint8Array(length).fill(fill);
}

async function decrypts_vault(
  hash: string,
  vault: { encrypted_vault: string; vault_nonce: string },
): Promise<boolean> {
  const blob = base64_to_array(vault.encrypted_vault);
  const key = await crypto.subtle.importKey(
    "raw",
    base64_to_array(hash),
    "AES-GCM",
    false,
    ["decrypt"],
  );

  try {
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(vault.vault_nonce) },
      key,
      blob.slice(16),
    );

    return true;
  } catch {
    return false;
  }
}

beforeEach(() => {
  localStorage.clear();
  clear_pending_login_enrollment();
  h.post.mockReset();
  h.account_id = null;
  h.saved_emails = [];
});

describe("derive_login_v2_bytes", () => {
  it("matches the backend known-answer vectors", async () => {
    const zero = await derive_login_v2_bytes(new Uint8Array(32));
    const counting = await derive_login_v2_bytes(
      Uint8Array.from({ length: 32 }, (_, i) => i),
    );

    expect(array_to_base64(zero)).toBe(
      "jMxRO7LIMGjT0gRMvr9dAN9d9Fn7ymn9FtA/9eb54ew=",
    );
    expect(array_to_base64(counting)).toBe(
      "PSD43cjGUexfKi8te9TGr49vnKozhILpIV2MPUOhTPc=",
    );
  });

  it("derives hash_v2 from the v1 hash", async () => {
    const { hash, hash_v2 } = await derive_password_hash(PASSWORD, salt(7));
    const expected = await derive_login_v2_bytes(base64_to_array(hash));

    expect(hash_v2).toBe(array_to_base64(expected));
    expect(hash_v2).not.toBe(hash);
  });
});

describe("foreign salt handling", () => {
  it("a v1 hash made with the vault salt decrypts the vault", async () => {
    const vault = await encrypt_vault(
      { identity_key: "secret" } as never,
      PASSWORD,
    );
    const vault_salt = base64_to_array(vault.encrypted_vault).slice(0, 16);
    const { hash } = await derive_password_hash(PASSWORD, vault_salt);

    expect(await decrypts_vault(hash, vault)).toBe(true);
  });

  it("a v2 proof made with the vault salt does not decrypt the vault", async () => {
    const vault = await encrypt_vault(
      { identity_key: "secret" } as never,
      PASSWORD,
    );
    const vault_salt = base64_to_array(vault.encrypted_vault).slice(0, 16);
    const proof = await derive_account_proof(PASSWORD, vault_salt, 2, [
      user_hash_pin_key("abc"),
    ]);

    expect(proof.kdf_version).toBe(2);
    expect(await decrypts_vault(proof.password_hash, vault)).toBe(false);
  });

  it("a pinned account refuses a server downgrade to v1 before hashing", async () => {
    const pin = user_hash_pin_key("abc");

    pin_accounts([pin]);

    await expect(
      derive_account_proof(PASSWORD, salt(1, 16), 1, [pin]),
    ).rejects.toBeInstanceOf(AuthSaltCollisionError);
    await expect(
      derive_sign_in_proof(PASSWORD, salt(1, 16), 1, "abc"),
    ).rejects.toBeInstanceOf(AuthSaltCollisionError);
  });

  it("a pinned step-up prompt refuses a v1 salt", async () => {
    h.account_id = "user-1";
    pin_accounts([user_id_pin_key("user-1")]);

    await expect(
      derive_current_account_proof(PASSWORD, salt(1, 16), 1),
    ).rejects.toBeInstanceOf(AuthSaltCollisionError);
    expect(h.post).not.toHaveBeenCalled();
  });
});

describe("kdf version handling", () => {
  it("treats anything but 2 as v1", () => {
    expect(read_kdf_version(2)).toBe(2);
    expect(read_kdf_version(1)).toBe(1);
    expect(read_kdf_version(undefined)).toBe(1);
    expect(read_kdf_version("2")).toBe(1);
  });

  it("allows v1 only for unpinned accounts", () => {
    const pin = user_hash_pin_key("abc");

    expect(v1_proofs_allowed([pin])).toBe(true);
    pin_accounts([pin]);
    expect(v1_proofs_allowed([pin])).toBe(false);
  });

  it("caps the pin list", () => {
    for (let i = 0; i < 80; i += 1) {
      pin_accounts([user_hash_pin_key(String(i))]);
    }

    expect(is_account_pinned([user_hash_pin_key("79")])).toBe(true);
    expect(is_account_pinned([user_hash_pin_key("0")])).toBe(false);
  });

  it("survives corrupt pin storage", () => {
    localStorage.setItem("aster:login_v2_accounts", "{not json");

    expect(is_account_pinned([user_hash_pin_key("abc")])).toBe(false);
    pin_accounts([user_hash_pin_key("abc")]);
    expect(is_account_pinned([user_hash_pin_key("abc")])).toBe(true);
  });
});

describe("enrollment", () => {
  it("sends v1 at sign-in and enrolls after the session starts", async () => {
    h.post.mockResolvedValue({ data: { kdf_version: 2 } });

    const sent = await derive_sign_in_proof(PASSWORD, salt(3), 1, "abc");
    const { hash, hash_v2 } = await derive_password_hash(PASSWORD, salt(3));

    expect(sent).toBe(hash);
    expect(await flush_pending_login_enrollment("user-1")).toBe(true);
    expect(h.post).toHaveBeenCalledWith("/core/v1/auth/me/password-v2", {
      password_hash: hash,
      password_hash_v2: hash_v2,
    });
    expect(is_account_pinned([user_hash_pin_key("abc")])).toBe(true);
    expect(is_account_pinned([user_id_pin_key("user-1")])).toBe(true);
  });

  it("sends v2 and pins without calling enroll when the server is on v2", async () => {
    const sent = await derive_sign_in_proof(PASSWORD, salt(3), 2, "abc");
    const { hash_v2 } = await derive_password_hash(PASSWORD, salt(3));

    expect(sent).toBe(hash_v2);
    expect(await flush_pending_login_enrollment("user-1")).toBe(true);
    expect(h.post).not.toHaveBeenCalled();
    expect(is_account_pinned([user_hash_pin_key("abc")])).toBe(true);
  });

  it("does not pin when enrollment fails", async () => {
    h.post.mockRejectedValue(new Error("network"));

    await derive_sign_in_proof(PASSWORD, salt(3), 1, "abc");

    expect(await flush_pending_login_enrollment("user-1")).toBe(false);
    expect(is_account_pinned([user_hash_pin_key("abc")])).toBe(false);
  });

  it("flushes a pending enrollment only once", async () => {
    h.post.mockResolvedValue({ data: { kdf_version: 2 } });

    await derive_sign_in_proof(PASSWORD, salt(3), 1, "abc");

    expect(await flush_pending_login_enrollment("user-1")).toBe(true);
    expect(await flush_pending_login_enrollment("user-1")).toBe(false);
    expect(h.post).toHaveBeenCalledTimes(1);
  });

  it("step-up on a v1 account sends the v1 proof without enrolling", async () => {
    h.account_id = "user-1";
    h.post.mockResolvedValue({ data: { kdf_version: 2 } });

    const sent = await derive_current_account_proof(PASSWORD, salt(5), 1);
    const { hash } = await derive_password_hash(PASSWORD, salt(5));

    expect(sent).toBe(hash);
    expect(h.post).not.toHaveBeenCalled();
    expect(is_account_pinned([user_id_pin_key("user-1")])).toBe(false);
  });

  it("step-up on a v2 account sends the v2 proof and pins", async () => {
    h.account_id = "user-1";

    const sent = await derive_current_account_proof(PASSWORD, salt(5), 2);
    const { hash_v2 } = await derive_password_hash(PASSWORD, salt(5));

    expect(sent).toBe(hash_v2);
    expect(h.post).not.toHaveBeenCalled();
    expect(is_account_pinned([user_id_pin_key("user-1")])).toBe(true);
  });

  it("unpinning lets a v1 proof through again", async () => {
    pin_accounts([user_hash_pin_key("h1")]);
    unpin_accounts([user_hash_pin_key("h1")]);

    expect(is_account_pinned([user_hash_pin_key("h1")])).toBe(false);
    expect(v1_proofs_allowed([user_hash_pin_key("h1")])).toBe(true);
  });
});

describe("short login salts", () => {
  const EMAIL = "legacy@astermail.org";

  it("blocks a v1 sign-in from a short salt on a new device", async () => {
    const user_hash = await hash_email(EMAIL);

    await expect(
      derive_sign_in_proof(PASSWORD, salt(4, 16), 1, user_hash),
    ).rejects.toMatchObject({
      name: "LegacyLoginSaltError",
      translation_key: "errors.legacy_login_salt_new_device",
    });
    expect(h.post).not.toHaveBeenCalled();
  });

  it("lets a saved account sign in and rotates its salt", async () => {
    const user_hash = await hash_email(EMAIL);
    const short = salt(4, 16);

    h.saved_emails = [EMAIL];
    h.post.mockResolvedValue({ data: { kdf_version: 2 } });

    const sent = await derive_sign_in_proof(PASSWORD, short, 1, user_hash);
    const { hash } = await derive_password_hash(PASSWORD, short);

    expect(sent).toBe(hash);
    expect(await flush_pending_login_enrollment("user-1")).toBe(true);
    expect(h.post).toHaveBeenCalledTimes(1);

    const [path, body] = h.post.mock.calls[0];
    const new_salt = base64_to_array(body.new_password_salt);
    const expected = await derive_password_hash(PASSWORD, new_salt);

    expect(path).toBe("/core/v1/auth/me/login-salt");
    expect(body.password_hash).toBe(hash);
    expect(new_salt.length).toBe(32);
    expect(body.new_password_hash).toBe(expected.hash);
    expect(body.new_password_hash_v2).toBe(expected.hash_v2);
    expect(is_account_pinned([user_id_pin_key("user-1")])).toBe(true);
    expect(match_login_salt_record([user_id_pin_key("user-1")], new_salt)).toBe(
      "match",
    );
  });

  it("falls back to enrollment when the rotation is refused", async () => {
    const user_hash = await hash_email(EMAIL);
    const short = salt(4, 16);

    h.saved_emails = [EMAIL];
    h.post
      .mockResolvedValueOnce({ error: "conflict" })
      .mockResolvedValueOnce({ data: { kdf_version: 2 } });

    await derive_sign_in_proof(PASSWORD, short, 1, user_hash);

    expect(await flush_pending_login_enrollment("user-1")).toBe(true);
    expect(h.post).toHaveBeenCalledTimes(2);
    expect(h.post.mock.calls[1][0]).toBe("/core/v1/auth/me/password-v2");
    expect(match_login_salt_record([user_id_pin_key("user-1")], short)).toBe(
      "match",
    );
  });

  it("does not rotate a full-length salt", async () => {
    h.post.mockResolvedValue({ data: { kdf_version: 2 } });

    await derive_sign_in_proof(PASSWORD, salt(3), 1, "abc");
    await flush_pending_login_enrollment("user-1");

    expect(h.post).toHaveBeenCalledTimes(1);
    expect(h.post.mock.calls[0][0]).toBe("/core/v1/auth/me/password-v2");
  });

  it("accepts a short salt that matches the recorded one", async () => {
    const short = salt(4, 16);

    record_login_salt([user_hash_pin_key("abc")], short);

    await expect(
      derive_sign_in_proof(PASSWORD, short, 1, "abc"),
    ).resolves.toBeTypeOf("string");
  });

  it("rejects a short salt that differs from the recorded one", async () => {
    const user_hash = await hash_email(EMAIL);

    h.saved_emails = [EMAIL];
    record_login_salt([user_hash_pin_key(user_hash)], salt(4, 16));

    await expect(
      derive_sign_in_proof(PASSWORD, salt(9, 16), 1, user_hash),
    ).rejects.toBeInstanceOf(LegacyLoginSaltError);
  });

  it("asks a signed-in user to sign in again at step-up", async () => {
    h.account_id = "user-1";

    await expect(
      derive_current_account_proof(PASSWORD, salt(4, 16), 1),
    ).rejects.toMatchObject({
      translation_key: "errors.legacy_login_salt_sign_in_again",
    });
  });

  it("trusts the first step-up salt for an account saved on this device", async () => {
    h.account_id = "user-1";
    h.saved_emails = [EMAIL];

    await expect(
      derive_current_account_proof(PASSWORD, salt(4, 16), 1),
    ).resolves.toBeTypeOf("string");
    expect(
      match_login_salt_record([user_id_pin_key("user-1")], salt(4, 16)),
    ).toBe("match");
    await expect(
      derive_current_account_proof(PASSWORD, salt(9, 16), 1),
    ).rejects.toMatchObject({
      translation_key: "errors.legacy_login_salt_sign_in_again",
    });
  });

  it("still knows a remembered account after it is signed out", async () => {
    const user_hash = await hash_email(EMAIL);

    h.saved_emails = [EMAIL];
    await remember_saved_login_accounts();
    h.saved_emails = [];

    await expect(
      derive_sign_in_proof(PASSWORD, salt(4, 16), 1, user_hash),
    ).resolves.toBeTypeOf("string");
  });

  it("allows step-up once the salt is recorded for the account", async () => {
    h.account_id = "user-1";
    await record_current_account_login_salt(salt(4, 16));

    await expect(
      derive_current_account_proof(PASSWORD, salt(4, 16), 1),
    ).resolves.toBeTypeOf("string");
  });

  it("forgets recorded salts", () => {
    const pin = user_hash_pin_key("abc");

    record_login_salt([pin], salt(4, 16));
    forget_login_salt_records([pin]);

    expect(match_login_salt_record([pin], salt(4, 16))).toBe("none");
  });

  it("survives corrupt salt records", () => {
    localStorage.setItem("aster:login_salt_records", "{not json");

    expect(match_login_salt_record([user_hash_pin_key("abc")], salt(4))).toBe(
      "none",
    );
  });

  it("maps safety errors to translation keys", () => {
    expect(login_safety_error_key(new LegacyLoginSaltError("sign_in"))).toBe(
      "errors.legacy_login_salt_new_device",
    );
    expect(login_safety_error_key(new LegacyLoginSaltError("step_up"))).toBe(
      "errors.legacy_login_salt_sign_in_again",
    );
    expect(login_safety_error_key(new AuthSaltCollisionError())).toBe(
      "errors.auth_salt_collision",
    );
    expect(login_safety_error_key(new Error("network"))).toBeNull();
  });
});
