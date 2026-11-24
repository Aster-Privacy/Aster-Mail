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

import * as openpgp from "openpgp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const saved_key = vi.fn();

vi.mock("./crypto/ratchet_identity_pin", async (import_original) => ({
  ...(await import_original<typeof import("./crypto/ratchet_identity_pin")>()),
  lookup_saved_key: (email: string) => saved_key(email),
}));

import {
  external_key_trust,
  key_names_address,
  opportunistic_lock_status,
} from "./opportunistic_key_trust";

let pal_key: string;
let pal_fingerprint: string;
let other_key: string;

async function make_public_key(email: string): Promise<string> {
  const generated = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ name: "Pal", email }],
    format: "armored",
  });

  return generated.publicKey;
}

function info(public_key: string): ExternalKeyInfo {
  return {
    email: "Pal@Example.com",
    found: true,
    public_key,
    fingerprint: "fp",
    source: "wkd",
    expires_at: null,
    will_encrypt: true,
    fingerprint_change: null,
  };
}

beforeAll(async () => {
  pal_key = await make_public_key("pal@example.com");
  other_key = await make_public_key("someone@example.net");
  pal_fingerprint = (
    await openpgp.readKey({ armoredKey: pal_key })
  ).getFingerprint();
}, 60000);

beforeEach(() => {
  saved_key.mockReset();
  saved_key.mockResolvedValue(null);
});

describe("key_names_address", () => {
  it("matches the address in a user ID without regard to case", async () => {
    expect(await key_names_address(pal_key, "PAL@example.com")).toBe(true);
  });

  it("refuses a key whose user IDs name another address", async () => {
    expect(await key_names_address(other_key, "pal@example.com")).toBe(false);
    expect(await key_names_address("not a key", "pal@example.com")).toBe(
      false,
    );
  });
});

describe("external_key_trust", () => {
  it("reports a key that matches the saved one as pinned", async () => {
    saved_key.mockResolvedValue({
      fingerprint: pal_fingerprint,
      conflict: false,
      owner: true,
    });

    expect(await external_key_trust("pal@example.com", pal_key)).toBe(
      "pinned",
    );
  });

  it("reports a key that differs from the saved one as changed", async () => {
    saved_key.mockResolvedValue({
      fingerprint: pal_fingerprint,
      conflict: false,
      owner: true,
    });

    expect(await external_key_trust("pal@example.com", other_key)).toBe(
      "changed",
    );
  });

  it("reports a first-seen key as unpinned", async () => {
    expect(await external_key_trust("pal@example.com", pal_key)).toBe(
      "unpinned",
    );
  });
});

describe("opportunistic_lock_status", () => {
  it("shows the lock only for a saved key", async () => {
    expect(await opportunistic_lock_status(info(pal_key), true)).toBe(
      "available",
    );

    saved_key.mockResolvedValue({
      fingerprint: pal_fingerprint,
      conflict: false,
      owner: true,
    });

    expect(await opportunistic_lock_status(info(pal_key), true)).toBe(
      "encrypted",
    );
  });

  it("warns when the delivered key differs from the saved one", async () => {
    saved_key.mockResolvedValue({
      fingerprint: pal_fingerprint,
      conflict: false,
      owner: true,
    });

    expect(await opportunistic_lock_status(info(other_key), true)).toBe(
      "key_invalid",
    );
  });

  it("shows no lock for a saved key that names another address", async () => {
    const pinned_other = (
      await openpgp.readKey({ armoredKey: other_key })
    ).getFingerprint();

    saved_key.mockResolvedValue({
      fingerprint: pinned_other,
      conflict: false,
      owner: true,
    });

    expect(await opportunistic_lock_status(info(other_key), true)).toBe(
      "available",
    );
  });
});
