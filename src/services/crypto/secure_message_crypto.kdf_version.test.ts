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
import { afterEach, describe, expect, it } from "vitest";

import {
  SECURE_KDF_V1,
  SECURE_KDF_V2,
  decrypt_secure_message,
  derive_auth_proof,
  encrypt_secure_message,
  parse_secure_kdf_version,
  set_secure_kdf_write_v2,
} from "./secure_message_crypto";

const password = "correct horse battery staple";
const salt = btoa(String.fromCharCode(...new Uint8Array(16).fill(9)));
const v1_proof = "I06gV1lYTvcRQHBtiJ5nZ7zyCXmtvzwVNgFAKHI9OBo=";
const v2_proof = "tpeOb5wVVq27aF05yN7D2x7CpBQ+a5sd90nS3gg0/z8=";

describe("secure message kdf versions", () => {
  afterEach(() => set_secure_kdf_write_v2(false));

  it("derives the shared v1 proof", async () => {
    expect(await derive_auth_proof(password, salt)).toBe(v1_proof);
    expect(await derive_auth_proof(password, salt, SECURE_KDF_V1)).toBe(
      v1_proof,
    );
  });

  it("derives the shared v2 proof with argon2id", async () => {
    expect(await derive_auth_proof(password, salt, SECURE_KDF_V2)).toBe(
      v2_proof,
    );
  }, 60000);

  it("writes v1 messages until the switch is turned on", async () => {
    const encrypted = await encrypt_secure_message(password, {
      subject: "Hello",
      body: "Body",
    });

    expect(encrypted.kdf_version).toBe(SECURE_KDF_V1);
    expect(
      await derive_auth_proof(password, encrypted.kdf_salt, SECURE_KDF_V1),
    ).toBe(encrypted.auth_proof);

    const opened = await decrypt_secure_message(password, encrypted.kdf_salt, {
      encrypted_subject: encrypted.encrypted_subject,
      encrypted_body: encrypted.encrypted_body,
      kem_ciphertext: encrypted.kem_ciphertext,
      encrypted_kem_seed: encrypted.encrypted_kem_seed,
      kem_seed_nonce: encrypted.kem_seed_nonce,
    });

    expect(opened.subject).toBe("Hello");
  });

  it("writes and reads v2 messages once the switch is on", async () => {
    set_secure_kdf_write_v2(true);
    const encrypted = await encrypt_secure_message(password, {
      subject: "Hello",
      body: "Body",
    });
    const bundle = {
      encrypted_subject: encrypted.encrypted_subject,
      encrypted_body: encrypted.encrypted_body,
      kem_ciphertext: encrypted.kem_ciphertext,
      encrypted_kem_seed: encrypted.encrypted_kem_seed,
      kem_seed_nonce: encrypted.kem_seed_nonce,
    };

    expect(encrypted.kdf_version).toBe(SECURE_KDF_V2);
    expect(
      await derive_auth_proof(password, encrypted.kdf_salt, SECURE_KDF_V2),
    ).toBe(encrypted.auth_proof);
    expect(
      await derive_auth_proof(password, encrypted.kdf_salt, SECURE_KDF_V1),
    ).not.toBe(encrypted.auth_proof);

    const opened = await decrypt_secure_message(
      password,
      encrypted.kdf_salt,
      bundle,
      SECURE_KDF_V2,
    );

    expect(opened.body).toBe("Body");
    await expect(
      decrypt_secure_message(password, encrypted.kdf_salt, bundle),
    ).rejects.toThrow();
  }, 60000);

  it("accepts only known versions", () => {
    expect(parse_secure_kdf_version(undefined)).toBe(SECURE_KDF_V1);
    expect(parse_secure_kdf_version(1)).toBe(SECURE_KDF_V1);
    expect(parse_secure_kdf_version(2)).toBe(SECURE_KDF_V2);
    expect(() => parse_secure_kdf_version(3)).toThrow();
  });
});
