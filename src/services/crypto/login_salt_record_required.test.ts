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

import { LegacyLoginSaltError } from "@/services/crypto/auth_salt_guard";
import { hash_email } from "@/services/crypto/key_manager";
import {
  clear_pending_login_enrollment,
  derive_current_account_proof,
  derive_sign_in_proof,
  flush_pending_login_enrollment,
  record_login_salt,
  seed_login_salt_record_from_session,
  user_hash_pin_key,
} from "@/services/crypto/login_proof";

const EMAIL = "saved@astermail.org";
const PASSWORD = "correct horse battery staple";

function stored_blob_salt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

async function sign_in_on_this_device(
  user_id: string,
  salt: Uint8Array,
): Promise<void> {
  const user_hash = await hash_email(EMAIL);

  record_login_salt([user_hash_pin_key(user_hash)], salt);
  await derive_sign_in_proof(PASSWORD, salt, 1, user_hash);
  h.account_id = user_id;
  await flush_pending_login_enrollment(user_id);
}

function crowd_out_login_salt_records(): void {
  for (let index = 0; index < 64; index += 1) {
    record_login_salt([`u:other-${index}`], stored_blob_salt());
  }
}

beforeEach(() => {
  localStorage.clear();
  clear_pending_login_enrollment();
  h.post.mockReset();
  h.get.mockReset();
  h.account_id = null;
  h.saved_emails = [];
});

describe("a signed-in account keeps its short login salt", () => {
  it("passes step-up and signs in again after its record is crowded out", async () => {
    const salt = stored_blob_salt();
    const user_hash = await hash_email(EMAIL);

    h.saved_emails = [EMAIL];
    await sign_in_on_this_device("user-1", salt);
    crowd_out_login_salt_records();

    await expect(
      derive_current_account_proof(PASSWORD, salt, 1),
    ).resolves.toBeTypeOf("string");

    clear_pending_login_enrollment();
    h.account_id = null;

    await expect(
      derive_sign_in_proof(PASSWORD, salt, 1, user_hash),
    ).resolves.toBeTypeOf("string");
  });

  it("restores the record from the session when the app unlocks", async () => {
    const salt = stored_blob_salt();
    const user_hash = await hash_email(EMAIL);

    h.saved_emails = [EMAIL];
    await sign_in_on_this_device("user-1", salt);
    crowd_out_login_salt_records();

    await seed_login_salt_record_from_session();

    clear_pending_login_enrollment();
    h.account_id = null;

    await expect(
      derive_sign_in_proof(PASSWORD, salt, 1, user_hash),
    ).resolves.toBeTypeOf("string");
  });

  it("still refuses a different short salt for the signed-in account", async () => {
    h.saved_emails = [EMAIL];
    await sign_in_on_this_device("user-1", stored_blob_salt());
    crowd_out_login_salt_records();

    await expect(
      derive_current_account_proof(PASSWORD, stored_blob_salt(), 1),
    ).rejects.toBeInstanceOf(LegacyLoginSaltError);
  });

  it("refuses a short salt on a fresh device with no session", async () => {
    const user_hash = await hash_email(EMAIL);
    const salt = stored_blob_salt();

    h.saved_emails = [EMAIL];

    await expect(
      derive_sign_in_proof(PASSWORD, salt, 1, user_hash),
    ).rejects.toBeInstanceOf(LegacyLoginSaltError);

    h.account_id = "user-1";

    await expect(
      derive_current_account_proof(PASSWORD, salt, 1),
    ).rejects.toBeInstanceOf(LegacyLoginSaltError);
    expect(h.post).not.toHaveBeenCalled();
  });
});

describe("short login salts need a record from this device", () => {
  it("refuses an unrecorded short salt at sign-in for a saved account", async () => {
    const user_hash = await hash_email(EMAIL);

    h.saved_emails = [EMAIL];

    await expect(
      derive_sign_in_proof(PASSWORD, stored_blob_salt(), 1, user_hash),
    ).rejects.toBeInstanceOf(LegacyLoginSaltError);
    expect(h.post).not.toHaveBeenCalled();
  });

  it("refuses an unrecorded short salt at step-up for the signed-in account", async () => {
    h.account_id = "user-1";
    h.saved_emails = [EMAIL];

    await expect(
      derive_current_account_proof(PASSWORD, stored_blob_salt(), 1),
    ).rejects.toBeInstanceOf(LegacyLoginSaltError);
  });

  it("still accepts the short salt this device recorded at sign-in", async () => {
    const user_hash = await hash_email(EMAIL);
    const recorded = stored_blob_salt();

    h.saved_emails = [EMAIL];
    record_login_salt([user_hash_pin_key(user_hash)], recorded);

    await expect(
      derive_sign_in_proof(PASSWORD, recorded, 1, user_hash),
    ).resolves.toBeTypeOf("string");
  });

  it("finds a sign-in record at step-up by the address hash", async () => {
    const user_hash = await hash_email(EMAIL);
    const recorded = stored_blob_salt();

    h.account_id = "user-1";
    h.saved_emails = [EMAIL];
    record_login_salt([user_hash_pin_key(user_hash)], recorded);

    await expect(
      derive_current_account_proof(PASSWORD, recorded, 1),
    ).resolves.toBeTypeOf("string");
  });
});
