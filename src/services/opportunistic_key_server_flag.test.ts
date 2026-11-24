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
import type { ExternalKeyInfo } from "./api/keys";

import { describe, expect, it } from "vitest";

import { decide_recipient_encryption } from "./client_pgp_copies";
import { will_encrypt_opportunistically } from "./opportunistic_key_trust";

function served(overrides: Partial<ExternalKeyInfo> = {}): ExternalKeyInfo {
  return {
    email: "pal@example.com",
    found: true,
    public_key: "armored",
    fingerprint: "fp",
    source: "keyserver",
    expires_at: null,
    will_encrypt: true,
    fingerprint_change: null,
    ...overrides,
  };
}

describe("server encryption flag", () => {
  it("does not pick a keyserver key the sender's settings would not trust", () => {
    expect(will_encrypt_opportunistically(served(), true)).toBe(false);
  });

  it("does not encrypt when the sender turned the setting off", () => {
    expect(
      will_encrypt_opportunistically(served({ source: "wkd" }), false),
    ).toBe(false);
  });

  it("sends plain when only the server asks to encrypt", () => {
    expect(
      decide_recipient_encryption(served(), { encrypt_by_default: false }),
    ).toBe("plain");
  });

  it("still encrypts a recipient-published key when the sender wants it", () => {
    expect(
      will_encrypt_opportunistically(served({ source: "wkd" }), true),
    ).toBe(true);
  });
});
