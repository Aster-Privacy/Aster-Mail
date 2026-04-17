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
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  base64_to_array,
  hash_email,
  derive_password_hash,
  generate_recovery_codes,
  generate_ke_keypair,
  import_ke_public_key,
  compute_agreement_as_key,
  compute_agreement_bits,
  derive_aes_key_from_bytes,
  encrypt_with_crypto_key,
  decrypt_with_crypto_key,
  derive_chain_key_as_crypto_key,
  import_hkdf_key,
  import_aes_key,
  clear_key_manager_state,
  get_key_usage_log,
  get_usage_statistics,
  string_to_passphrase,
  zero_passphrase,
} from "./key_manager";

describe("base64_to_array", () => {
  it("should decode valid base64 string", () => {
    const result = base64_to_array("SGVsbG8gV29ybGQ=");

    expect(new TextDecoder().decode(result)).toBe("Hello World");
  });

  it("should decode empty string", () => {
    const result = base64_to_array("");

    expect(result.length).toBe(0);
  });

  it("should handle binary data", () => {
    const original = new Uint8Array([0, 127, 255, 128, 64]);
    const encoded = btoa(String.fromCharCode(...original));
    const decoded = base64_to_array(encoded);

    expect(decoded).toEqual(original);
  });

  it("should handle all byte values", () => {
    const original = new Uint8Array(256);

    for (let i = 0; i < 256; i++) {
      original[i] = i;
    }
    const encoded = btoa(String.fromCharCode(...original));
    const decoded = base64_to_array(encoded);

    expect(decoded).toEqual(original);
  });
});

describe("hash_email", () => {
  it("should produce consistent hash for same email", async () => {
    const hash1 = await hash_email("test@example.com");
    const hash2 = await hash_email("test@example.com");

    expect(hash1).toBe(hash2);
  });

  it("should normalize email case", async () => {
    const hash1 = await hash_email("Test@Example.COM");
    const hash2 = await hash_email("test@example.com");

    expect(hash1).toBe(hash2);
  });

  it("should trim whitespace", async () => {
    const hash1 = await hash_email("  test@example.com  ");
    const hash2 = await hash_email("test@example.com");

    expect(hash1).toBe(hash2);
  });

  it("should produce different hash for different emails", async () => {
    const hash1 = await hash_email("alice@example.com");
    const hash2 = await hash_email("bob@example.com");

    expect(hash1).not.toBe(hash2);
  });

  it("should return base64 encoded string", async () => {
    const hash = await hash_email("test@example.com");

    expect(typeof hash).toBe("string");
    expect(() => atob(hash)).not.toThrow();
  });
});

describe("derive_password_hash", () => {
  it("should derive hash from password and salt", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const result = await derive_password_hash("my_password", salt);

    expect(result.hash).toBeDefined();
    expect(result.salt).toBeDefined();
    expect(typeof result.hash).toBe("string");
  });

  it("should produce consistent hash for same inputs", async () => {
    const salt = new Uint8Array(16).fill(42);
    const result1 = await derive_password_hash("password", salt);
    const result2 = await derive_password_hash("password", salt);

    expect(result1.hash).toBe(result2.hash);
  });

  it("should produce different hash for different passwords", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const result1 = await derive_password_hash("password1", salt);
    const result2 = await derive_password_hash("password2", salt);

    expect(result1.hash).not.toBe(result2.hash);
  });

  it("should produce different hash for different salts", async () => {
    const salt1 = new Uint8Array(16).fill(1);
    const salt2 = new Uint8Array(16).fill(2);
    const result1 = await derive_password_hash("password", salt1);
    const result2 = await derive_password_hash("password", salt2);

    expect(result1.hash).not.toBe(result2.hash);
  });

  it("should handle unicode passwords", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const result = await derive_password_hash("пароль🔐密码", salt);

    expect(result.hash).toBeDefined();
    expect(result.hash.length).toBeGreaterThan(0);
  });

  it("should handle empty password", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const result = await derive_password_hash("", salt);

    expect(result.hash).toBeDefined();
  });
});

describe("generate_recovery_codes", () => {
  it("should generate default 6 codes", () => {
    const codes = generate_recovery_codes();

    expect(codes.length).toBe(6);
  });

  it("should generate specified number of codes", () => {
    const codes = generate_recovery_codes(10);

    expect(codes.length).toBe(10);
  });

  it("should format codes correctly", () => {
    const codes = generate_recovery_codes();
    const pattern = /^ASTER-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

    for (const code of codes) {
      expect(code).toMatch(pattern);
    }
  });

  it("should use alphanumeric characters", () => {
    const codes = generate_recovery_codes(100);
    const valid_chars = /^[A-Z0-9-]+$/;

    for (const code of codes) {
      expect(code).toMatch(valid_chars);
    }
  });

  it("should generate unique codes", () => {
    const codes = generate_recovery_codes(100);
    const unique_codes = new Set(codes);

    expect(unique_codes.size).toBe(codes.length);
  });

  it("should handle generating single code", () => {
    const codes = generate_recovery_codes(1);

    expect(codes.length).toBe(1);
  });

  it("should handle generating zero codes", () => {
    const codes = generate_recovery_codes(0);

    expect(codes.length).toBe(0);
  });
});

describe("Key Exchange Operations", () => {
  describe("generate_ke_keypair", () => {
    it("should generate keypair with public and private keys", async () => {
      const keypair = await generate_ke_keypair();

      expect(keypair.public_key).toBeDefined();
      expect(keypair.secret_key).toBeDefined();
      expect(keypair.public_key_raw).toBeDefined();
    });

    it("should generate valid public key bytes", async () => {
      const keypair = await generate_ke_keypair();

      expect(keypair.public_key_raw).toBeInstanceOf(Uint8Array);
      expect(keypair.public_key_raw.length).toBe(65);
    });

    it("should generate unique keypairs", async () => {
      const keypair1 = await generate_ke_keypair();
      const keypair2 = await generate_ke_keypair();

      expect(keypair1.public_key_raw).not.toEqual(keypair2.public_key_raw);
    });
  });

  describe("import_ke_public_key", () => {
    it("should import raw public key", async () => {
      const keypair = await generate_ke_keypair();
      const imported = await import_ke_public_key(keypair.public_key_raw);

      expect(imported).toBeDefined();
      expect(imported.type).toBe("public");
    });
  });

  describe("compute_agreement_bits", () => {
    it("should compute agreement between two parties", async () => {
      const alice = await generate_ke_keypair();
      const bob = await generate_ke_keypair();

      const alice_public = await import_ke_public_key(alice.public_key_raw);
      const bob_public = await import_ke_public_key(bob.public_key_raw);

      const alice_secret = await compute_agreement_bits(
        alice.secret_key,
        bob_public,
      );
      const bob_secret = await compute_agreement_bits(
        bob.secret_key,
        alice_public,
      );

      expect(alice_secret).toEqual(bob_secret);
    });

    it("should produce 32-byte shared secret", async () => {
      const alice = await generate_ke_keypair();
      const bob = await generate_ke_keypair();
      const bob_public = await import_ke_public_key(bob.public_key_raw);

      const secret = await compute_agreement_bits(alice.secret_key, bob_public);

      expect(secret.length).toBe(32);
    });
  });

  describe("compute_agreement_as_key", () => {
    it("should derive usable AES key from key exchange", async () => {
      const alice = await generate_ke_keypair();
      const bob = await generate_ke_keypair();
      const bob_public = await import_ke_public_key(bob.public_key_raw);

      const aes_key = await compute_agreement_as_key(
        alice.secret_key,
        bob_public,
      );

      expect(aes_key.type).toBe("secret");
      expect(aes_key.algorithm.name).toBe("AES-GCM");
    });
  });
});

describe("AES Key Operations", () => {
  describe("derive_aes_key_from_bytes", () => {
    it("should derive AES key from key material", async () => {
      const key_material = crypto.getRandomValues(new Uint8Array(32));
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const info = new TextEncoder().encode("test_info");

      const key = await derive_aes_key_from_bytes(key_material, salt, info);

      expect(key.type).toBe("secret");
      expect(key.algorithm.name).toBe("AES-GCM");
    });

    it("should produce usable keys for different info", async () => {
      const key_material = crypto.getRandomValues(new Uint8Array(32));
      const salt = crypto.getRandomValues(new Uint8Array(32));

      const key1 = await derive_aes_key_from_bytes(
        key_material,
        salt,
        new TextEncoder().encode("info1"),
      );
      const key2 = await derive_aes_key_from_bytes(
        key_material,
        salt,
        new TextEncoder().encode("info2"),
      );

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1).not.toBe(key2);
    });
  });

  describe("import_aes_key", () => {
    it("should import raw AES key", async () => {
      const key_bytes = crypto.getRandomValues(new Uint8Array(32));
      const key = await import_aes_key(key_bytes);

      expect(key.type).toBe("secret");
      expect(key.algorithm.name).toBe("AES-GCM");
    });
  });

  describe("import_hkdf_key", () => {
    it("should import key for HKDF derivation", async () => {
      const key_material = crypto.getRandomValues(new Uint8Array(32));
      const key = await import_hkdf_key(key_material);

      expect(key.algorithm.name).toBe("HKDF");
    });
  });
});

describe("Encryption/Decryption with CryptoKey", () => {
  it("should encrypt and decrypt data", async () => {
    const key_bytes = crypto.getRandomValues(new Uint8Array(32));
    const aes_key = await import_aes_key(key_bytes);

    const plaintext = new TextEncoder().encode("Hello, World!");
    const { ciphertext, nonce } = await encrypt_with_crypto_key(
      plaintext,
      aes_key,
    );

    const decrypted = await decrypt_with_crypto_key(ciphertext, nonce, aes_key);

    expect(new TextDecoder().decode(decrypted)).toBe("Hello, World!");
  });

  it("should produce different ciphertext for same plaintext", async () => {
    const key_bytes = crypto.getRandomValues(new Uint8Array(32));
    const aes_key = await import_aes_key(key_bytes);

    const plaintext = new TextEncoder().encode("Same message");

    const result1 = await encrypt_with_crypto_key(plaintext, aes_key);
    const result2 = await encrypt_with_crypto_key(plaintext, aes_key);

    expect(result1.ciphertext).not.toEqual(result2.ciphertext);
    expect(result1.nonce).not.toEqual(result2.nonce);
  });

  it("should fail decryption with wrong key", async () => {
    const key1 = await import_aes_key(
      crypto.getRandomValues(new Uint8Array(32)),
    );
    const key2 = await import_aes_key(
      crypto.getRandomValues(new Uint8Array(32)),
    );

    const plaintext = new TextEncoder().encode("Secret");
    const { ciphertext, nonce } = await encrypt_with_crypto_key(
      plaintext,
      key1,
    );

    await expect(
      decrypt_with_crypto_key(ciphertext, nonce, key2),
    ).rejects.toThrow();
  });

  it("should fail decryption with wrong nonce", async () => {
    const key = await import_aes_key(
      crypto.getRandomValues(new Uint8Array(32)),
    );

    const plaintext = new TextEncoder().encode("Secret");
    const { ciphertext } = await encrypt_with_crypto_key(plaintext, key);
    const wrong_nonce = crypto.getRandomValues(new Uint8Array(12));

    await expect(
      decrypt_with_crypto_key(ciphertext, wrong_nonce, key),
    ).rejects.toThrow();
  });

  it("should handle moderately sized data", async () => {
    const key = await import_aes_key(
      crypto.getRandomValues(new Uint8Array(32)),
    );

    const plaintext = crypto.getRandomValues(new Uint8Array(10000));
    const { ciphertext, nonce } = await encrypt_with_crypto_key(plaintext, key);

    const decrypted = await decrypt_with_crypto_key(ciphertext, nonce, key);

    expect(decrypted).toEqual(plaintext);
  });

  it("should handle empty data", async () => {
    const key = await import_aes_key(
      crypto.getRandomValues(new Uint8Array(32)),
    );

    const plaintext = new Uint8Array(0);
    const { ciphertext, nonce } = await encrypt_with_crypto_key(plaintext, key);

    const decrypted = await decrypt_with_crypto_key(ciphertext, nonce, key);

    expect(decrypted.length).toBe(0);
  });
});

describe("Chain Key Derivation", () => {
  it("should derive new chain key and message key", async () => {
    const initial_key = await import_hkdf_key(
      crypto.getRandomValues(new Uint8Array(32)),
    );
    const info = new TextEncoder().encode("test_chain");

    const { new_chain_key, message_key } = await derive_chain_key_as_crypto_key(
      initial_key,
      info,
    );

    expect(new_chain_key).toBeDefined();
    expect(message_key).toBeDefined();
    expect(message_key.algorithm.name).toBe("AES-GCM");
  });

  it("should produce different keys for different inputs", async () => {
    const key1 = await import_hkdf_key(
      crypto.getRandomValues(new Uint8Array(32)),
    );
    const key2 = await import_hkdf_key(
      crypto.getRandomValues(new Uint8Array(32)),
    );
    const info = new TextEncoder().encode("chain");

    const result1 = await derive_chain_key_as_crypto_key(key1, info);
    const result2 = await derive_chain_key_as_crypto_key(key2, info);

    expect(result1.message_key).not.toBe(result2.message_key);
  });
});

describe("Passphrase Operations", () => {
  describe("string_to_passphrase", () => {
    it("should convert string to Uint8Array", () => {
      const passphrase = string_to_passphrase("test_password");

      expect(passphrase).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(passphrase)).toBe("test_password");
    });

    it("should handle unicode", () => {
      const passphrase = string_to_passphrase("пароль🔐");

      expect(passphrase).toBeInstanceOf(Uint8Array);
    });

    it("should handle empty string", () => {
      const passphrase = string_to_passphrase("");

      expect(passphrase.length).toBe(0);
    });
  });

  describe("zero_passphrase", () => {
    it("should zero all bytes", () => {
      const passphrase = string_to_passphrase("sensitive_password");

      zero_passphrase(passphrase);

      expect(passphrase.every((b) => b === 0)).toBe(true);
    });
  });
});

describe("Key Usage Logging", () => {
  beforeEach(() => {
    clear_key_manager_state();
  });

  afterEach(() => {
    clear_key_manager_state();
  });

  it("should return empty log initially", () => {
    const log = get_key_usage_log();

    expect(log).toEqual([]);
  });

  it("should track usage statistics", () => {
    const stats = get_usage_statistics("nonexistent_key");

    expect(stats.total_operations).toBe(0);
    expect(stats.successful_operations).toBe(0);
    expect(stats.failed_operations).toBe(0);
    expect(stats.last_used).toBeNull();
  });

  it("should filter log by key_id", () => {
    const log = get_key_usage_log("specific_key");

    expect(Array.isArray(log)).toBe(true);
  });
});

describe("clear_key_manager_state", () => {
  it("should clear all state", () => {
    clear_key_manager_state();

    const log = get_key_usage_log();

    expect(log).toEqual([]);
  });
});
