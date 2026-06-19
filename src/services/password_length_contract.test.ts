// @vitest-environment happy-dom
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
import { describe, it, expect } from "vitest";

import { clamp_password, MAX_PASSWORD_LENGTH } from "@/services/sanitize";
import { derive_password_hash } from "@/services/crypto/key_manager_pgp";

describe("clamp_password", () => {
  it("leaves a password within the limit untouched", () => {
    const pw = "Correct-Horse-Battery-Staple-1";

    expect(clamp_password(pw)).toBe(pw);
  });

  it("leaves a password at exactly the limit untouched", () => {
    const pw = "a".repeat(MAX_PASSWORD_LENGTH);

    expect(clamp_password(pw)).toHaveLength(MAX_PASSWORD_LENGTH);
    expect(clamp_password(pw)).toBe(pw);
  });

  it("truncates an over-length password to the limit", () => {
    const pw = "a".repeat(MAX_PASSWORD_LENGTH + 50);

    expect(clamp_password(pw)).toHaveLength(MAX_PASSWORD_LENGTH);
    expect(clamp_password(pw)).toBe("a".repeat(MAX_PASSWORD_LENGTH));
  });

  it("is idempotent", () => {
    const pw = "z".repeat(MAX_PASSWORD_LENGTH + 200);

    expect(clamp_password(clamp_password(pw))).toBe(clamp_password(pw));
  });
});

describe("derive_password_hash length contract", () => {
  const salt = new Uint8Array(16).fill(7);

  it("produces an identical hash regardless of where the same password is entered", async () => {
    const pw = "Some-User-Password-123";

    const login = await derive_password_hash(pw, salt);
    const reauth = await derive_password_hash(pw, salt);

    expect(reauth.hash).toBe(login.hash);
  });

  it("hashes an over-length password identically to its clamped form", async () => {
    const long_pw = "p".repeat(MAX_PASSWORD_LENGTH + 64);

    const from_raw = await derive_password_hash(long_pw, salt);
    const from_clamped = await derive_password_hash(
      clamp_password(long_pw),
      salt,
    );

    expect(from_raw.hash).toBe(from_clamped.hash);
  });

  it("does not change the hash of a normal in-limit password", async () => {
    const pw = "n".repeat(MAX_PASSWORD_LENGTH - 1);

    const a = await derive_password_hash(pw, salt);
    const b = await derive_password_hash(clamp_password(pw), salt);

    expect(a.hash).toBe(b.hash);
  });
});
