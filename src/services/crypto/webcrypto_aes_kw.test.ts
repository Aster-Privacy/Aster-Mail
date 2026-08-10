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
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { decrypt_message, encrypt_message } from "./key_manager_pgp_messages";

const PASSPHRASE = "correct-horse-battery-staple";
const PLAINTEXT = "forwarded pgp body";

let secret_key = "";
let public_key = "";
let ciphertext = "";

const subtle = globalThis.crypto.subtle;
const real_unwrap_key = subtle.unwrapKey.bind(subtle);

function break_unwrap_key(error_name: string): void {
  subtle.unwrapKey = () => {
    const error = new Error("operation failed");

    error.name = error_name;

    return Promise.reject(error);
  };
}

beforeAll(async () => {
  const generated = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: "recipient", email: "recipient@example.com" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });

  secret_key = generated.privateKey;
  public_key = generated.publicKey;
  ciphertext = await encrypt_message(PLAINTEXT, public_key);
}, 30000);

afterEach(() => {
  subtle.unwrapKey = real_unwrap_key;
});

describe("inbound pgp decryption without usable webcrypto aes-kw", () => {
  it("decrypts when webcrypto is healthy", async () => {
    await expect(
      decrypt_message(ciphertext, secret_key, PASSPHRASE),
    ).resolves.toBe(PLAINTEXT);
  });

  it("decrypts when unwrapKey reports OperationError", async () => {
    break_unwrap_key("OperationError");

    await expect(
      decrypt_message(ciphertext, secret_key, PASSPHRASE),
    ).resolves.toBe(PLAINTEXT);
  });

  it("decrypts when unwrapKey reports NotSupportedError", async () => {
    break_unwrap_key("NotSupportedError");

    await expect(
      decrypt_message(ciphertext, secret_key, PASSPHRASE),
    ).resolves.toBe(PLAINTEXT);
  });

  it("restores the original importKey after a fallback attempt", async () => {
    const before = subtle.importKey;

    break_unwrap_key("OperationError");

    await decrypt_message(ciphertext, secret_key, PASSPHRASE);

    expect(subtle.importKey).toBe(before);
  });

  it("still rejects a message encrypted to a different key", async () => {
    const other = await openpgp.generateKey({
      type: "ecc",
      curve: "ed25519Legacy",
      userIDs: [{ name: "other", email: "other@example.com" }],
      passphrase: PASSPHRASE,
      format: "armored",
    });

    await expect(
      decrypt_message(ciphertext, other.privateKey, PASSPHRASE),
    ).rejects.toThrow();
  }, 30000);

  it("encrypts when wrapKey is unavailable", async () => {
    const real_wrap_key = subtle.wrapKey.bind(subtle);

    subtle.wrapKey = () => {
      const error = new Error("operation failed");

      error.name = "OperationError";

      return Promise.reject(error);
    };

    try {
      const armored = await encrypt_message(PLAINTEXT, public_key);

      await expect(
        decrypt_message(armored, secret_key, PASSPHRASE),
      ).resolves.toBe(PLAINTEXT);
    } finally {
      subtle.wrapKey = real_wrap_key;
    }
  });
});
