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

import {
  trusts_key_for_opportunistic,
  will_encrypt_opportunistically,
} from "./opportunistic_key_trust";

const NOW = Date.parse("2026-11-10T00:00:00Z");

function info(overrides: Partial<ExternalKeyInfo> = {}): ExternalKeyInfo {
  return {
    email: "pal@example.com",
    found: true,
    public_key: "armored",
    fingerprint: "fp",
    source: "wkd",
    expires_at: null,
    will_encrypt: false,
    fingerprint_change: null,
    ...overrides,
  };
}

describe("trusts_key_for_opportunistic", () => {
  it("trusts keys from sources the recipient controls", () => {
    for (const source of ["wkd", "WKD", "autocrypt", "manual", "dane"]) {
      expect(trusts_key_for_opportunistic(info({ source }), true, NOW)).toBe(
        true,
      );
    }
  });

  it("never trusts keyserver, database or unknown sources", () => {
    for (const source of ["keyserver", "database", "", null]) {
      expect(trusts_key_for_opportunistic(info({ source }), true, NOW)).toBe(
        false,
      );
    }
  });

  it("refuses expired or unparseable expiry dates", () => {
    expect(
      trusts_key_for_opportunistic(
        info({ expires_at: "2026-01-01T00:00:00Z" }),
        true,
        NOW,
      ),
    ).toBe(false);
    expect(
      trusts_key_for_opportunistic(info({ expires_at: "soon" }), true, NOW),
    ).toBe(false);
    expect(
      trusts_key_for_opportunistic(
        info({ expires_at: "2027-01-01T00:00:00Z" }),
        true,
        NOW,
      ),
    ).toBe(true);
  });

  it("needs a found key and the sender's own setting", () => {
    expect(trusts_key_for_opportunistic(info(), false, NOW)).toBe(false);
    expect(
      trusts_key_for_opportunistic(info({ public_key: null }), true, NOW),
    ).toBe(false);
    expect(
      trusts_key_for_opportunistic(info({ found: false }), true, NOW),
    ).toBe(false);
    expect(trusts_key_for_opportunistic(undefined, true, NOW)).toBe(false);
  });
});

describe("will_encrypt_opportunistically", () => {
  it("keeps the server flag as an upgrade only", () => {
    expect(
      will_encrypt_opportunistically(info({ will_encrypt: true }), false),
    ).toBe(true);
    expect(will_encrypt_opportunistically(info(), true)).toBe(true);
    expect(will_encrypt_opportunistically(info(), false)).toBe(false);
  });
});
