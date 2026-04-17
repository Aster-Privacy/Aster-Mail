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
import type { EncryptedVault } from "./key_manager";

import { describe, it, expect } from "vitest";

import {
  generate_recovery_key,
  encrypt_vault_backup,
  decrypt_vault_backup,
  encrypt_recovery_key_with_code,
  decrypt_recovery_key_with_code,
  hash_recovery_code,
  generate_recovery_share_data,
  generate_all_recovery_shares,
  clear_recovery_key,
  VaultBackup,
  EncryptedRecoveryKey,
} from "./recovery_key";

const create_mock_vault = (): EncryptedVault => ({
  identity_key:
    "-----BEGIN PGP PRIVATE KEY BLOCK-----\nmock_identity_key\n-----END PGP PRIVATE KEY BLOCK-----",
  signed_prekey:
    "-----BEGIN PGP PUBLIC KEY BLOCK-----\nmock_signed_prekey\n-----END PGP PUBLIC KEY BLOCK-----",
  signed_prekey_private:
    "-----BEGIN PGP PRIVATE KEY BLOCK-----\nmock_signed_prekey_private\n-----END PGP PRIVATE KEY BLOCK-----",
  recovery_codes: ["ASTER-ABCD-EFGH-IJKL", "ASTER-MNOP-QRST-UVWX"],
});

describe("generate_recovery_key", () => {
  it("should generate 32-byte key", () => {
    const key = generate_recovery_key();

    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it("should generate unique keys each time", () => {
    const key1 = generate_recovery_key();
    const key2 = generate_recovery_key();

    expect(key1).not.toEqual(key2);
  });

  it("should have high entropy", () => {
    const key = generate_recovery_key();
    const unique_bytes = new Set(key);

    expect(unique_bytes.size).toBeGreaterThan(10);
  });

  it("should generate cryptographically random keys", () => {
    const keys: Uint8Array[] = [];

    for (let i = 0; i < 100; i++) {
      keys.push(generate_recovery_key());
    }

    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        expect(keys[i]).not.toEqual(keys[j]);
      }
    }
  });
});

describe("encrypt_vault_backup / decrypt_vault_backup", () => {
  it("should encrypt and decrypt vault", async () => {
    const vault = create_mock_vault();
    const recovery_key = generate_recovery_key();

    const backup = await encrypt_vault_backup(vault, recovery_key);
    const decrypted = await decrypt_vault_backup(backup, recovery_key);

    expect(decrypted.identity_key).toBe(vault.identity_key);
    expect(decrypted.signed_prekey).toBe(vault.signed_prekey);
    expect(decrypted.recovery_codes).toEqual(vault.recovery_codes);
  });

  it("should produce valid backup structure", async () => {
    const vault = create_mock_vault();
    const recovery_key = generate_recovery_key();

    const backup = await encrypt_vault_backup(vault, recovery_key);

    expect(backup.encrypted_data).toBeDefined();
    expect(backup.nonce).toBeDefined();
    expect(backup.salt).toBeDefined();
    expect(typeof backup.encrypted_data).toBe("string");
    expect(typeof backup.nonce).toBe("string");
    expect(typeof backup.salt).toBe("string");
  });

  it("should fail decryption with wrong key", async () => {
    const vault = create_mock_vault();
    const correct_key = generate_recovery_key();
    const wrong_key = generate_recovery_key();

    const backup = await encrypt_vault_backup(vault, correct_key);

    await expect(decrypt_vault_backup(backup, wrong_key)).rejects.toThrow();
  });

  it("should produce different ciphertext for same vault", async () => {
    const vault = create_mock_vault();
    const recovery_key = generate_recovery_key();

    const backup1 = await encrypt_vault_backup(vault, recovery_key);
    const backup2 = await encrypt_vault_backup(vault, recovery_key);

    expect(backup1.encrypted_data).not.toBe(backup2.encrypted_data);
  });

  it("should handle vault with optional fields", async () => {
    const vault: EncryptedVault = {
      ...create_mock_vault(),
      previous_keys: ["old_key_1", "old_key_2"],
      ratchet_identity_key: "ratchet_identity",
      ratchet_identity_public: "ratchet_identity_public",
      ratchet_signed_prekey: "ratchet_signed",
      ratchet_signed_prekey_public: "ratchet_signed_public",
    };
    const recovery_key = generate_recovery_key();

    const backup = await encrypt_vault_backup(vault, recovery_key);
    const decrypted = await decrypt_vault_backup(backup, recovery_key);

    expect(decrypted.previous_keys).toEqual(vault.previous_keys);
    expect(decrypted.ratchet_identity_key).toBe(vault.ratchet_identity_key);
  });
});

describe("encrypt_recovery_key_with_code / decrypt_recovery_key_with_code", () => {
  it("should encrypt and decrypt recovery key", async () => {
    const recovery_key = generate_recovery_key();
    const code = "ASTER-ABCD-EFGH-IJKL";

    const encrypted = await encrypt_recovery_key_with_code(recovery_key, code);
    const decrypted = await decrypt_recovery_key_with_code(encrypted, code);

    expect(decrypted).toEqual(recovery_key);
  });

  it("should produce valid encrypted structure", async () => {
    const recovery_key = generate_recovery_key();
    const code = "ASTER-TEST-CODE-1234";

    const encrypted = await encrypt_recovery_key_with_code(recovery_key, code);

    expect(encrypted.encrypted_key).toBeDefined();
    expect(encrypted.nonce).toBeDefined();
    expect(encrypted.salt).toBeDefined();
  });

  it("should normalize code case", async () => {
    const recovery_key = generate_recovery_key();

    const encrypted = await encrypt_recovery_key_with_code(
      recovery_key,
      "aster-abcd-efgh-ijkl",
    );
    const decrypted = await decrypt_recovery_key_with_code(
      encrypted,
      "ASTER-ABCD-EFGH-IJKL",
    );

    expect(decrypted).toEqual(recovery_key);
  });

  it("should require exact code format for decryption", async () => {
    const recovery_key = generate_recovery_key();
    const code = "ASTER-ABCD-EFGH-IJKL";

    const encrypted = await encrypt_recovery_key_with_code(recovery_key, code);
    const decrypted = await decrypt_recovery_key_with_code(encrypted, code);

    expect(decrypted).toEqual(recovery_key);
  });

  it("should fail with wrong code", async () => {
    const recovery_key = generate_recovery_key();
    const correct_code = "ASTER-ABCD-EFGH-IJKL";
    const wrong_code = "ASTER-XXXX-YYYY-ZZZZ";

    const encrypted = await encrypt_recovery_key_with_code(
      recovery_key,
      correct_code,
    );

    await expect(
      decrypt_recovery_key_with_code(encrypted, wrong_code),
    ).rejects.toThrow();
  });

  it("should handle codes with special characters", async () => {
    const recovery_key = generate_recovery_key();
    const code = "ASTER!!!-ABCD###-EFGH$$$-IJKL%%%";

    const encrypted = await encrypt_recovery_key_with_code(recovery_key, code);
    const decrypted = await decrypt_recovery_key_with_code(encrypted, code);

    expect(decrypted).toEqual(recovery_key);
  });
});

describe("hash_recovery_code", () => {
  it("should produce consistent hash for same code", async () => {
    const code = "ASTER-ABCD-EFGH-IJKL";

    const hash1 = await hash_recovery_code(code);
    const hash2 = await hash_recovery_code(code);

    expect(hash1).toBe(hash2);
  });

  it("should produce different hash for different codes", async () => {
    const hash1 = await hash_recovery_code("ASTER-AAAA-BBBB-CCCC");
    const hash2 = await hash_recovery_code("ASTER-DDDD-EEEE-FFFF");

    expect(hash1).not.toBe(hash2);
  });

  it("should be case-insensitive", async () => {
    const hash1 = await hash_recovery_code("aster-abcd-efgh-ijkl");
    const hash2 = await hash_recovery_code("ASTER-ABCD-EFGH-IJKL");

    expect(hash1).toBe(hash2);
  });

  it("should preserve hyphens in code", async () => {
    const hash1 = await hash_recovery_code("ASTER-ABCD-EFGH-IJKL");
    const hash2 = await hash_recovery_code("ASTER-ABCD-EFGH-IJKL");

    expect(hash1).toBe(hash2);
  });

  it("should return base64 encoded string", async () => {
    const hash = await hash_recovery_code("ASTER-TEST-CODE-1234");

    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
    expect(() => atob(hash)).not.toThrow();
  });
});

describe("generate_recovery_share_data", () => {
  it("should generate complete share data", async () => {
    const code = "ASTER-ABCD-EFGH-IJKL";
    const recovery_key = generate_recovery_key();

    const share = await generate_recovery_share_data(code, recovery_key);

    expect(share.code_hash).toBeDefined();
    expect(share.code_salt).toBeDefined();
    expect(share.encrypted_recovery_key).toBeDefined();
    expect(share.recovery_key_nonce).toBeDefined();
  });

  it("should produce consistent code_hash", async () => {
    const code = "ASTER-ABCD-EFGH-IJKL";
    const recovery_key = generate_recovery_key();

    const share = await generate_recovery_share_data(code, recovery_key);
    const expected_hash = await hash_recovery_code(code);

    expect(share.code_hash).toBe(expected_hash);
  });

  it("should produce decryptable encrypted_recovery_key", async () => {
    const code = "ASTER-ABCD-EFGH-IJKL";
    const recovery_key = generate_recovery_key();

    const share = await generate_recovery_share_data(code, recovery_key);

    const encrypted: EncryptedRecoveryKey = {
      encrypted_key: share.encrypted_recovery_key,
      nonce: share.recovery_key_nonce,
      salt: share.code_salt,
    };

    const decrypted = await decrypt_recovery_key_with_code(encrypted, code);

    expect(decrypted).toEqual(recovery_key);
  });
});

describe("generate_all_recovery_shares", () => {
  it("should generate shares for all codes", async () => {
    const codes = [
      "ASTER-AAAA-BBBB-CCCC",
      "ASTER-DDDD-EEEE-FFFF",
      "ASTER-GGGG-HHHH-IIII",
    ];
    const recovery_key = generate_recovery_key();

    const shares = await generate_all_recovery_shares(codes, recovery_key);

    expect(shares.length).toBe(codes.length);
  });

  it("should generate unique shares for each code", async () => {
    const codes = ["ASTER-AAAA-BBBB-CCCC", "ASTER-DDDD-EEEE-FFFF"];
    const recovery_key = generate_recovery_key();

    const shares = await generate_all_recovery_shares(codes, recovery_key);

    expect(shares[0].code_hash).not.toBe(shares[1].code_hash);
    expect(shares[0].encrypted_recovery_key).not.toBe(
      shares[1].encrypted_recovery_key,
    );
  });

  it("should handle empty code list", async () => {
    const recovery_key = generate_recovery_key();

    const shares = await generate_all_recovery_shares([], recovery_key);

    expect(shares).toEqual([]);
  });

  it("should allow recovery with any share", async () => {
    const codes = [
      "ASTER-AAAA-BBBB-CCCC",
      "ASTER-DDDD-EEEE-FFFF",
      "ASTER-GGGG-HHHH-IIII",
    ];
    const recovery_key = generate_recovery_key();

    const shares = await generate_all_recovery_shares(codes, recovery_key);

    for (let i = 0; i < shares.length; i++) {
      const encrypted: EncryptedRecoveryKey = {
        encrypted_key: shares[i].encrypted_recovery_key,
        nonce: shares[i].recovery_key_nonce,
        salt: shares[i].code_salt,
      };

      const decrypted = await decrypt_recovery_key_with_code(
        encrypted,
        codes[i],
      );

      expect(decrypted).toEqual(recovery_key);
    }
  });
});

describe("clear_recovery_key", () => {
  it("should zero all bytes", () => {
    const recovery_key = generate_recovery_key();
    const original_length = recovery_key.length;

    clear_recovery_key(recovery_key);

    expect(recovery_key.every((b) => b === 0)).toBe(true);
    expect(recovery_key.length).toBe(original_length);
  });

  it("should handle already zeroed key", () => {
    const recovery_key = new Uint8Array(32).fill(0);

    expect(() => clear_recovery_key(recovery_key)).not.toThrow();
  });
});

describe("Security Properties", () => {
  it("should not leak recovery key in encrypted backup", async () => {
    const vault = create_mock_vault();
    const recovery_key = generate_recovery_key();
    const key_base64 = btoa(String.fromCharCode(...recovery_key));

    const backup = await encrypt_vault_backup(vault, recovery_key);

    expect(backup.encrypted_data).not.toContain(key_base64);
  });

  it("should use authenticated encryption", async () => {
    const vault = create_mock_vault();
    const recovery_key = generate_recovery_key();

    const backup = await encrypt_vault_backup(vault, recovery_key);

    const corrupted_backup: VaultBackup = {
      ...backup,
      encrypted_data: backup.encrypted_data.slice(0, -10) + "AAAAAAAAAA",
    };

    await expect(
      decrypt_vault_backup(corrupted_backup, recovery_key),
    ).rejects.toThrow();
  });

  it("should derive unique keys per encryption", async () => {
    const recovery_key = generate_recovery_key();
    const code = "ASTER-ABCD-EFGH-IJKL";

    const encrypted1 = await encrypt_recovery_key_with_code(recovery_key, code);
    const encrypted2 = await encrypt_recovery_key_with_code(recovery_key, code);

    expect(encrypted1.salt).not.toBe(encrypted2.salt);
    expect(encrypted1.nonce).not.toBe(encrypted2.nonce);
  });
});
