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
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as openpgp from "openpgp";

const h = vi.hoisted(() => ({
  fail_openpgp_load: false,
  vault: null as { identity_key: string } | null,
  public_key: "",
}));

vi.mock("@/services/crypto/openpgp_loader", async (import_original) => {
  const actual =
    await import_original<typeof import("@/services/crypto/openpgp_loader")>();

  return {
    ...actual,
    load_openpgp: () =>
      h.fail_openpgp_load
        ? Promise.reject(new Error("chunk load failed"))
        : actual.load_openpgp(),
  };
});

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: vi.fn(() => h.vault),
  get_passphrase_from_memory: vi.fn(() => null),
  get_passphrase_bytes: vi.fn(() => null),
  wait_for_keys_ready: vi.fn(async () => undefined),
}));

vi.mock("@/services/api/keys", async (import_original) => {
  const actual = await import_original<typeof import("@/services/api/keys")>();

  return {
    ...actual,
    discover_external_keys_batch: vi.fn(async (emails: string[]) => ({
      data: emails.map((email) => ({
        email,
        found: true,
        public_key: h.public_key,
        fingerprint: "fp",
        source: "wkd",
      })),
    })),
  };
});

import {
  derive_own_public_key,
  discover_external_recipient_keys,
} from "./email_crypto";

describe("send path when openpgp cannot load", () => {
  beforeAll(async () => {
    const { privateKey, publicKey } = await openpgp.generateKey({
      type: "ecc",
      curve: "ed25519Legacy",
      userIDs: [{ email: "me@astermail.org" }],
      passphrase: "x",
      format: "armored",
    });

    h.vault = { identity_key: privateKey };
    h.public_key = publicKey;
  });

  beforeEach(() => {
    h.fail_openpgp_load = false;
  });

  it("fails instead of dropping the sender's own key", async () => {
    h.fail_openpgp_load = true;

    await expect(derive_own_public_key()).rejects.toThrow("chunk load failed");

    h.fail_openpgp_load = false;

    expect(await derive_own_public_key()).toContain(
      "BEGIN PGP PUBLIC KEY BLOCK",
    );
  });

  it("fails instead of treating discovered recipient keys as missing", async () => {
    h.fail_openpgp_load = true;

    await expect(
      discover_external_recipient_keys(["bob@example.com"], true),
    ).rejects.toThrow("chunk load failed");

    h.fail_openpgp_load = false;

    const result = await discover_external_recipient_keys(
      ["bob@example.com"],
      true,
    );

    expect(result.all_have_keys).toBe(true);
    expect(result.recipients_with_keys.map((r) => r.email)).toEqual([
      "bob@example.com",
    ]);
  });
});
