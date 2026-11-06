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
import * as openpgp from "openpgp";
import { describe, expect, it } from "vitest";

import {
  external_key_import_error,
  get_primary_self_signature,
  normalize_external_key,
  parse_external_key,
  read_unprotected_key,
  serialize_unprotected_key,
  unlock_external_key,
  validate_external_key,
} from "./external_pgp_import";

const SLOW_TEST_MS = 120_000;
const PASSPHRASE = "correct horse battery";
const ADDRESS = "owner@astermail.org";
const OUTSIDE_ADDRESS = "owner@example.com";

type generate_options = Parameters<typeof openpgp.generateKey>[0];

async function make_armored(options: Partial<generate_options>) {
  const { privateKey } = await openpgp.generateKey({
    userIDs: [{ name: "Owner", email: OUTSIDE_ADDRESS }],
    format: "armored",
    ...options,
  } as generate_options);

  return privateKey as unknown as string;
}

async function expect_rejection(
  promise: Promise<unknown>,
  reason: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );

  expect(error).toBeInstanceOf(external_key_import_error);
  expect((error as external_key_import_error).reason).toBe(reason);
}

async function load_and_validate(armored: string, passphrase = "") {
  const parsed = await parse_external_key(armored);
  const unlocked = await unlock_external_key(parsed, passphrase);

  return validate_external_key(unlocked);
}

describe("external key validation", () => {
  it(
    "accepts RSA 2048 with a warning",
    async () => {
      const armored = await make_armored({ type: "rsa", rsaBits: 2048 });
      const summary = await load_and_validate(armored);

      expect(summary.algorithm).toBe("rsa");
      expect(summary.key_size).toBe(2048);
      expect(summary.warnings).toContain("rsa_2048");
    },
    SLOW_TEST_MS,
  );

  it(
    "accepts RSA 3072 without a warning",
    async () => {
      const armored = await make_armored({ type: "rsa", rsaBits: 3072 });
      const summary = await load_and_validate(armored);

      expect(summary.key_size).toBe(3072);
      expect(summary.warnings).not.toContain("rsa_2048");
    },
    SLOW_TEST_MS,
  );

  it(
    "accepts RSA 4096",
    async () => {
      const armored = await make_armored({ type: "rsa", rsaBits: 4096 });
      const summary = await load_and_validate(armored);

      expect(summary.key_size).toBe(4096);
      expect(summary.warnings).toEqual([]);
    },
    SLOW_TEST_MS,
  );

  it("accepts a legacy curve25519 key", async () => {
    const armored = await make_armored({
      type: "ecc",
      curve: "curve25519Legacy",
    });
    const summary = await load_and_validate(armored);

    expect(summary.algorithm).toBe("curve25519");
    expect(summary.fingerprint).toMatch(/^[0-9a-f]{40}$/);
    expect(summary.user_ids).toEqual([`Owner <${OUTSIDE_ADDRESS}>`]);
  });

  it("rejects a v6 key", async () => {
    const armored = await make_armored({
      type: "curve25519",
      config: { v6Keys: true },
    } as Partial<generate_options>);

    await expect_rejection(
      parse_external_key(armored).then((key) => validate_external_key(key)),
      "unsupported_version",
    );
  });

  it("rejects a NIST P-256 key", async () => {
    const armored = await make_armored({ type: "ecc", curve: "nistP256" });

    await expect_rejection(load_and_validate(armored), "unsupported_algorithm");
  });

  it("rejects an expired key", async () => {
    const armored = await make_armored({
      type: "ecc",
      curve: "curve25519Legacy",
      date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      keyExpirationTime: 60,
    });

    await expect_rejection(load_and_validate(armored), "expired");
  });

  it("rejects a revoked key", async () => {
    const armored = await make_armored({
      type: "ecc",
      curve: "curve25519Legacy",
    });
    const key = await openpgp.readPrivateKey({ armoredKey: armored });
    const { privateKey: revoked } = await openpgp.revokeKey({
      key,
      format: "armored",
    });

    await expect_rejection(
      load_and_validate(revoked as unknown as string),
      "revoked",
    );
  });

  it("rejects a key without an encryption subkey", async () => {
    const armored = await make_armored({
      type: "ecc",
      curve: "curve25519Legacy",
      subkeys: [{ sign: true }],
    });

    await expect_rejection(load_and_validate(armored), "no_encryption_subkey");
  });

  it("rejects a public key", async () => {
    const { publicKey } = await openpgp.generateKey({
      userIDs: [{ email: OUTSIDE_ADDRESS }],
      type: "ecc",
      curve: "curve25519Legacy",
      format: "armored",
    });

    await expect_rejection(parse_external_key(publicKey), "not_private");
  });

  it("accepts a passphrase-protected key with the right passphrase", async () => {
    const armored = await make_armored({
      type: "ecc",
      curve: "curve25519Legacy",
      passphrase: PASSPHRASE,
    });
    const summary = await load_and_validate(armored, PASSPHRASE);

    expect(summary.algorithm).toBe("curve25519");
  });

  it("rejects the wrong passphrase", async () => {
    const armored = await make_armored({
      type: "ecc",
      curve: "curve25519Legacy",
      passphrase: PASSPHRASE,
    });
    const parsed = await parse_external_key(armored);

    await expect_rejection(
      unlock_external_key(parsed, "not the passphrase"),
      "wrong_passphrase",
    );
    await expect_rejection(unlock_external_key(parsed, ""), "passphrase_required");
  });
});

describe("external key normalization", () => {
  it("keeps the fingerprint and adds the Aster address", async () => {
    const armored = await make_armored({
      type: "ecc",
      curve: "curve25519Legacy",
      passphrase: PASSPHRASE,
    });
    const parsed = await parse_external_key(armored);
    const unlocked = await unlock_external_key(parsed, PASSPHRASE);
    const result = await normalize_external_key(unlocked, ADDRESS);

    expect(result.key.getFingerprint()).toBe(parsed.getFingerprint());
    expect(result.changes).toContain("user_id_added");
    expect(result.changes).toContain("preferences_updated");
    expect(result.summary.user_ids).toContain(`Owner <${ADDRESS}>`);
    expect(result.summary.user_ids).toContain(`Owner <${OUTSIDE_ADDRESS}>`);

    const self_signature = await get_primary_self_signature(result.key);

    expect(self_signature.preferredSymmetricAlgorithms).toEqual([9, 7]);
    expect(self_signature.preferredHashAlgorithms).toEqual([10, 8]);
    expect(Array.from(self_signature.features ?? [])).toEqual([1]);
    expect(self_signature.preferredAEADAlgorithms).toBeNull();
  });

  it("does not add the address twice", async () => {
    const armored = await make_armored({
      type: "ecc",
      curve: "curve25519Legacy",
      userIDs: [{ name: "Owner", email: ADDRESS }],
    });
    const parsed = await parse_external_key(armored);
    const unlocked = await unlock_external_key(parsed, "");
    const result = await normalize_external_key(unlocked, ADDRESS.toUpperCase());

    expect(result.changes).not.toContain("user_id_added");
    expect(result.summary.user_ids).toEqual([`Owner <${ADDRESS}>`]);
  });

  it("keeps the key expiry", async () => {
    const lifetime_seconds = 400 * 24 * 60 * 60;
    const armored = await make_armored({
      type: "ecc",
      curve: "curve25519Legacy",
      keyExpirationTime: lifetime_seconds,
    });
    const parsed = await parse_external_key(armored);
    const unlocked = await unlock_external_key(parsed, "");
    const before = await validate_external_key(unlocked);
    const result = await normalize_external_key(unlocked, ADDRESS);

    expect(result.summary.expires_at?.getTime()).toBe(
      before.expires_at?.getTime(),
    );
  });

  it("drops a revoked subkey", async () => {
    const armored = await make_armored({
      type: "ecc",
      curve: "curve25519Legacy",
      subkeys: [{}, {}],
    });
    const key = await openpgp.readPrivateKey({ armoredKey: armored });
    key.subkeys[1] = await key.subkeys[1].revoke(
      key.keyPacket as openpgp.SecretKeyPacket,
    );

    const result = await normalize_external_key(key, ADDRESS);

    expect(result.key.subkeys).toHaveLength(1);
    expect(result.changes).toContain("inactive_subkeys_removed");
    expect(result.key.getFingerprint()).toBe(key.getFingerprint());
  });

  it("round trips through serialization without a passphrase", async () => {
    const armored = await make_armored({
      type: "ecc",
      curve: "curve25519Legacy",
      passphrase: PASSPHRASE,
    });
    const parsed = await parse_external_key(armored);
    const unlocked = await unlock_external_key(parsed, PASSPHRASE);
    const result = await normalize_external_key(unlocked, ADDRESS);
    const bytes = serialize_unprotected_key(result.key);
    const restored = await read_unprotected_key(bytes);

    expect(restored.getFingerprint()).toBe(result.key.getFingerprint());
    expect(restored.isDecrypted()).toBe(true);
  });

  it(
    "keeps an RSA signing and encryption key working",
    async () => {
      const armored = await make_armored({
        type: "rsa",
        rsaBits: 3072,
        subkeys: [{}, { sign: true }],
      });
      const parsed = await parse_external_key(armored);
      const unlocked = await unlock_external_key(parsed, "");
      const result = await normalize_external_key(unlocked, ADDRESS);
      const message = await openpgp.encrypt({
        message: await openpgp.createMessage({ text: "hello" }),
        encryptionKeys: result.key.toPublic(),
        format: "armored",
      });
      const { data } = await openpgp.decrypt({
        message: await openpgp.readMessage({ armoredMessage: message }),
        decryptionKeys: result.key,
      });

      expect(data).toBe("hello");
      expect(result.key.subkeys).toHaveLength(2);
      expect(result.key.getFingerprint()).toBe(parsed.getFingerprint());
    },
    SLOW_TEST_MS,
  );
});
