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

import { derive_step_up_credentials } from "./step_up";
import { get_user_salt } from "./auth";

import {
  hash_email,
  derive_password_hash,
  base64_to_array,
} from "@/services/crypto/key_manager";

vi.mock("./auth", () => ({
  get_user_salt: vi.fn(),
}));

vi.mock("@/services/crypto/key_manager", () => ({
  hash_email: vi.fn(),
  derive_password_hash: vi.fn(),
  base64_to_array: vi.fn(),
}));

describe("derive_step_up_credentials", () => {
  beforeEach(() => {
    vi.mocked(hash_email).mockReset().mockResolvedValue("USER_HASH");
    vi.mocked(base64_to_array)
      .mockReset()
      .mockReturnValue(new Uint8Array([1, 2, 3]));
    vi.mocked(derive_password_hash)
      .mockReset()
      .mockResolvedValue({ hash: "PWHASH", salt: "SALT" } as never);
    vi.mocked(get_user_salt)
      .mockReset()
      .mockResolvedValue({ data: { salt: "c2FsdA==" } } as never);
  });

  it("derives the password hash from the account salt without a code", async () => {
    const creds = await derive_step_up_credentials("me@aster.cx", "hunter2");

    expect(vi.mocked(hash_email)).toHaveBeenCalledWith("me@aster.cx");
    expect(vi.mocked(get_user_salt)).toHaveBeenCalledWith({
      user_hash: "USER_HASH",
    });
    expect(vi.mocked(derive_password_hash)).toHaveBeenCalledWith(
      "hunter2",
      new Uint8Array([1, 2, 3]),
    );
    expect(creds).toEqual({ password_hash: "PWHASH", totp_code: undefined });
  });

  it("passes a trimmed totp code through", async () => {
    const creds = await derive_step_up_credentials(
      "me@aster.cx",
      "hunter2",
      " 123456 ",
    );

    expect(creds).toEqual({ password_hash: "PWHASH", totp_code: "123456" });
  });

  it("omits an empty totp code", async () => {
    const creds = await derive_step_up_credentials(
      "me@aster.cx",
      "hunter2",
      "",
    );

    expect(creds.totp_code).toBeUndefined();
  });

  it("throws when the salt lookup fails", async () => {
    vi.mocked(get_user_salt).mockResolvedValue({
      error: "boom",
    } as never);

    await expect(
      derive_step_up_credentials("me@aster.cx", "hunter2"),
    ).rejects.toThrow("boom");
    expect(vi.mocked(derive_password_hash)).not.toHaveBeenCalled();
  });
});
