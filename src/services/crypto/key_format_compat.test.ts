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
import * as openpgp from "openpgp";

import {
  generate_identity_keypair,
  generate_signed_prekey,
  encrypt_message,
  decrypt_message_verified,
  reprotect_pgp_key,
} from "./key_manager_pgp";

const PASS = "correct horse battery staple";

const RFC_9580_NEW_FORMAT_ALGORITHMS = ["ed25519", "x25519", "ed448", "x448"];

async function algorithm_profile(armored_public_key: string) {
  const key = await openpgp.readKey({ armoredKey: armored_public_key });

  return {
    version: key.keyPacket.version,
    primary: key.keyPacket.getAlgorithmInfo(),
    subkeys: key.getSubkeys().map((subkey) => ({
      version: subkey.keyPacket.version,
      info: subkey.keyPacket.getAlgorithmInfo(),
    })),
  };
}

describe("generated PGP keys use the widely-compatible RFC 4880 legacy format", () => {
  it("identity keypair is a v4 EdDSA(ed25519Legacy) primary with a Curve25519Legacy ECDH subkey", async () => {
    const keypair = await generate_identity_keypair(
      "Alice",
      "alice@astermail.org",
      PASS,
    );

    const profile = await algorithm_profile(keypair.public_key);

    expect(profile.version).toBe(4);
    expect(profile.primary.algorithm).toBe("eddsaLegacy");
    expect(profile.primary.curve).toBe("ed25519Legacy");
    expect(RFC_9580_NEW_FORMAT_ALGORITHMS).not.toContain(
      profile.primary.algorithm,
    );

    expect(profile.subkeys.length).toBeGreaterThan(0);

    for (const subkey of profile.subkeys) {
      expect(subkey.version).toBe(4);
      expect(subkey.info.algorithm).toBe("ecdh");
      expect(subkey.info.curve).toBe("curve25519Legacy");
      expect(RFC_9580_NEW_FORMAT_ALGORITHMS).not.toContain(subkey.info.algorithm);
    }
  }, 30000);

  it("signed prekey carries the same legacy algorithm profile", async () => {
    const identity = await generate_identity_keypair(
      "Bob",
      "bob@astermail.org",
      PASS,
    );

    const { keypair } = await generate_signed_prekey(
      "Bob",
      "bob@astermail.org",
      PASS,
      identity.secret_key,
    );

    const profile = await algorithm_profile(keypair.public_key);

    expect(profile.version).toBe(4);
    expect(profile.primary.algorithm).toBe("eddsaLegacy");
    expect(RFC_9580_NEW_FORMAT_ALGORITHMS).not.toContain(
      profile.primary.algorithm,
    );

    for (const subkey of profile.subkeys) {
      expect(subkey.info.algorithm).toBe("ecdh");
      expect(RFC_9580_NEW_FORMAT_ALGORITHMS).not.toContain(subkey.info.algorithm);
    }
  }, 30000);
});

describe("legacy-format keys remain fully functional for messaging", () => {
  it("round-trips a signed encrypted message and reports the signature as verified", async () => {
    const keypair = await generate_identity_keypair(
      "Carol",
      "carol@astermail.org",
      PASS,
    );

    const ciphertext = await encrypt_message(
      "hello internal world",
      keypair.public_key,
      { armored_secret_key: keypair.secret_key, passphrase: PASS },
    );

    expect(ciphertext).toContain("BEGIN PGP MESSAGE");

    const result = await decrypt_message_verified(
      ciphertext,
      keypair.secret_key,
      PASS,
      [keypair.public_key],
    );

    expect(result.plaintext).toBe("hello internal world");
    expect(result.has_signature).toBe(true);
    expect(result.verification).toBe("verified");
  }, 30000);

  it("reprotect re-encrypts the secret key under a new passphrase without changing its fingerprint", async () => {
    const keypair = await generate_identity_keypair(
      "Dave",
      "dave@astermail.org",
      PASS,
    );

    const original = await openpgp.readKey({ armoredKey: keypair.public_key });
    const new_passphrase = "a different vault passphrase";

    const reprotected = await reprotect_pgp_key(
      keypair.secret_key,
      PASS,
      new_passphrase,
    );

    await expect(
      openpgp.decryptKey({
        privateKey: await openpgp.readPrivateKey({ armoredKey: reprotected }),
        passphrase: PASS,
      }),
    ).rejects.toThrow();

    const unlocked = await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({ armoredKey: reprotected }),
      passphrase: new_passphrase,
    });

    expect(unlocked.getFingerprint()).toBe(original.getFingerprint());
  }, 30000);
});
