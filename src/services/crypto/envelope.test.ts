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

import {
  array_to_base64,
  base64_to_array,
  PBKDF2_ITERATIONS,
  SALT_LENGTH,
  NONCE_LENGTH,
  encrypt_envelope,
  decrypt_envelope,
  encrypt_envelope_with_bytes,
  decrypt_envelope_with_bytes,
  derive_envelope_key,
  derive_envelope_key_from_bytes,
  decrypt_mail_envelope,
  decrypt_mail_envelope_with_fallback,
  encrypt_metadata,
  decrypt_metadata,
  is_encrypted_blob,
} from "./envelope";

describe("Base64 Encoding/Decoding", () => {
  describe("array_to_base64", () => {
    it("should encode empty array", () => {
      const result = array_to_base64(new Uint8Array(0));

      expect(result).toBe("");
    });

    it("should encode single byte", () => {
      const result = array_to_base64(new Uint8Array([65]));

      expect(result).toBe("QQ==");
    });

    it("should encode multiple bytes", () => {
      const result = array_to_base64(new Uint8Array([72, 101, 108, 108, 111]));

      expect(result).toBe("SGVsbG8=");
    });

    it("should encode binary data", () => {
      const result = array_to_base64(new Uint8Array([0, 255, 128, 64, 32]));

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should accept ArrayBuffer", () => {
      const buffer = new Uint8Array([1, 2, 3]).buffer;
      const result = array_to_base64(buffer);

      expect(typeof result).toBe("string");
    });
  });

  describe("base64_to_array", () => {
    it("should decode empty string", () => {
      const result = base64_to_array("");

      expect(result.length).toBe(0);
    });

    it("should decode valid base64", () => {
      const result = base64_to_array("SGVsbG8=");

      expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it("should roundtrip encode/decode", () => {
      const original = new Uint8Array([0, 1, 2, 255, 254, 253, 128, 127]);
      const encoded = array_to_base64(original);
      const decoded = base64_to_array(encoded);

      expect(decoded).toEqual(original);
    });

    it("should handle all byte values", () => {
      const original = new Uint8Array(256);

      for (let i = 0; i < 256; i++) {
        original[i] = i;
      }
      const encoded = array_to_base64(original);
      const decoded = base64_to_array(encoded);

      expect(decoded).toEqual(original);
    });
  });
});

describe("Key Derivation", () => {
  describe("derive_envelope_key_from_bytes", () => {
    it("should derive a CryptoKey from passphrase bytes", async () => {
      const passphrase = new TextEncoder().encode("test_password");
      const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

      const key = await derive_envelope_key_from_bytes(passphrase, salt);

      expect(key).toBeDefined();
      expect(key.type).toBe("secret");
      expect(key.algorithm.name).toBe("AES-GCM");
    });

    it("should produce usable keys for different salts", async () => {
      const passphrase = new TextEncoder().encode("test_password");
      const salt1 = new Uint8Array(SALT_LENGTH).fill(1);
      const salt2 = new Uint8Array(SALT_LENGTH).fill(2);

      const key1 = await derive_envelope_key_from_bytes(passphrase, salt1);
      const key2 = await derive_envelope_key_from_bytes(passphrase, salt2);

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1).not.toBe(key2);
    });

    it("should produce usable key for same inputs", async () => {
      const passphrase = new TextEncoder().encode("test_password");
      const salt = new Uint8Array(SALT_LENGTH).fill(42);

      const key1 = await derive_envelope_key_from_bytes(passphrase, salt);
      const key2 = await derive_envelope_key_from_bytes(passphrase, salt);

      expect(key1.type).toBe("secret");
      expect(key2.type).toBe("secret");
    });
  });

  describe("derive_envelope_key", () => {
    it("should derive key from string passphrase", async () => {
      const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

      const key = await derive_envelope_key("my_secure_password", salt);

      expect(key).toBeDefined();
      expect(key.type).toBe("secret");
    });

    it("should handle empty passphrase", async () => {
      const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

      const key = await derive_envelope_key("", salt);

      expect(key).toBeDefined();
    });

    it("should handle unicode passphrase", async () => {
      const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

      const key = await derive_envelope_key("пароль🔐密码", salt);

      expect(key).toBeDefined();
    });
  });
});

describe("Envelope Encryption/Decryption", () => {
  describe("encrypt_envelope", () => {
    it("should encrypt object data", async () => {
      const data = { message: "secret", count: 42 };

      const result = await encrypt_envelope(data, "password123");

      expect(result.encrypted).toBeDefined();
      expect(result.nonce).toBeDefined();
      expect(typeof result.encrypted).toBe("string");
    });

    it("should produce different ciphertext for same plaintext", async () => {
      const data = { message: "secret" };

      const result1 = await encrypt_envelope(data, "password123");
      const result2 = await encrypt_envelope(data, "password123");

      expect(result1.encrypted).not.toBe(result2.encrypted);
    });

    it("should handle complex nested objects", async () => {
      const data = {
        users: [
          { name: "Alice", age: 30 },
          { name: "Bob", age: 25 },
        ],
        metadata: { created: new Date().toISOString(), version: 1 },
      };

      const result = await encrypt_envelope(data, "password");

      expect(result.encrypted.length).toBeGreaterThan(0);
    });
  });

  describe("decrypt_envelope", () => {
    it("should decrypt encrypted data", async () => {
      const original = { secret: "value", number: 123 };
      const encrypted = await encrypt_envelope(original, "password");

      const decrypted = await decrypt_envelope<typeof original>(
        encrypted.encrypted,
        "password",
      );

      expect(decrypted).toEqual(original);
    });

    it("should return null for wrong password", async () => {
      const original = { secret: "value" };
      const encrypted = await encrypt_envelope(original, "correct_password");

      const decrypted = await decrypt_envelope(
        encrypted.encrypted,
        "wrong_password",
      );

      expect(decrypted).toBeNull();
    });

    it("should return null for corrupted data", async () => {
      const decrypted = await decrypt_envelope(
        "corrupted_data_here",
        "password",
      );

      expect(decrypted).toBeNull();
    });

    it("should handle large objects", async () => {
      const original = {
        data: Array(1000)
          .fill(null)
          .map((_, i) => ({ id: i, value: `item_${i}` })),
      };
      const encrypted = await encrypt_envelope(original, "password");

      const decrypted = await decrypt_envelope<typeof original>(
        encrypted.encrypted,
        "password",
      );

      expect(decrypted).toEqual(original);
    });
  });

  describe("encrypt_envelope_with_bytes / decrypt_envelope_with_bytes", () => {
    it("should encrypt and decrypt with byte passphrase", async () => {
      const original = { key: "value" };
      const passphrase = new TextEncoder().encode("byte_password");

      const encrypted = await encrypt_envelope_with_bytes(original, passphrase);
      const decrypted = await decrypt_envelope_with_bytes<typeof original>(
        encrypted.encrypted,
        passphrase,
      );

      expect(decrypted).toEqual(original);
    });

    it("should work with binary passphrase", async () => {
      const original = { data: "test" };
      const passphrase = crypto.getRandomValues(new Uint8Array(32));

      const encrypted = await encrypt_envelope_with_bytes(original, passphrase);
      const decrypted = await decrypt_envelope_with_bytes<typeof original>(
        encrypted.encrypted,
        passphrase,
      );

      expect(decrypted).toEqual(original);
    });
  });
});

describe("Mail Envelope Decryption", () => {
  describe("decrypt_mail_envelope", () => {
    it("should handle unencrypted data (empty nonce)", async () => {
      const data = { subject: "Test" };
      const encoded = array_to_base64(
        new TextEncoder().encode(JSON.stringify(data)),
      );

      const result = await decrypt_mail_envelope<typeof data>(
        encoded,
        "",
        null,
        null,
      );

      expect(result).toEqual(data);
    });

    it("should decrypt envelope-encrypted data (nonce byte 1)", async () => {
      const original = { subject: "Secret" };
      const passphrase = new TextEncoder().encode("password");
      const encrypted = await encrypt_envelope_with_bytes(original, passphrase);

      const result = await decrypt_mail_envelope<typeof original>(
        encrypted.encrypted,
        encrypted.nonce,
        passphrase,
        null,
      );

      expect(result).toEqual(original);
    });

    it("should return null when no keys provided", async () => {
      const result = await decrypt_mail_envelope(
        "encrypted_data",
        "some_nonce",
        null,
        null,
      );

      expect(result).toBeNull();
    });
  });

  describe("decrypt_mail_envelope_with_fallback", () => {
    it("should try current key first", async () => {
      const data = { message: "test" };
      const encoded = array_to_base64(
        new TextEncoder().encode(JSON.stringify(data)),
      );

      const result = await decrypt_mail_envelope_with_fallback<typeof data>(
        encoded,
        "",
        null,
        null,
      );

      expect(result.data).toEqual(data);
      expect(result.used_key_index).toBe(0);
    });

    it("should return used_key_index -1 on failure", async () => {
      const result = await decrypt_mail_envelope_with_fallback(
        "invalid",
        "nonce",
        null,
        null,
      );

      expect(result.data).toBeNull();
      expect(result.used_key_index).toBe(-1);
    });
  });
});

describe("Metadata Encryption", () => {
  describe("encrypt_metadata", () => {
    it("should encrypt metadata with master key", async () => {
      const data = { field: "value" };
      const master_key = crypto.getRandomValues(new Uint8Array(32));

      const result = await encrypt_metadata(data, master_key);

      expect(result).not.toBeNull();
      expect(result!.encrypted_data).toBeDefined();
      expect(result!.nonce).toBeDefined();
      expect(result!.version).toBe(1);
    });

    it("should use context for key derivation", async () => {
      const data = { field: "value" };
      const master_key = crypto.getRandomValues(new Uint8Array(32));

      const result1 = await encrypt_metadata(data, master_key, "context1");
      const result2 = await encrypt_metadata(data, master_key, "context2");

      expect(result1!.encrypted_data).not.toBe(result2!.encrypted_data);
    });
  });

  describe("decrypt_metadata", () => {
    it("should decrypt encrypted metadata", async () => {
      const original = { secret: "data", count: 42 };
      const master_key = crypto.getRandomValues(new Uint8Array(32));

      const encrypted = await encrypt_metadata(original, master_key);
      const decrypted = await decrypt_metadata<typeof original>(
        encrypted!,
        master_key,
      );

      expect(decrypted).toEqual(original);
    });

    it("should return null for wrong key", async () => {
      const original = { secret: "data" };
      const correct_key = crypto.getRandomValues(new Uint8Array(32));
      const wrong_key = crypto.getRandomValues(new Uint8Array(32));

      const encrypted = await encrypt_metadata(original, correct_key);
      const decrypted = await decrypt_metadata(encrypted!, wrong_key);

      expect(decrypted).toBeNull();
    });

    it("should return null for wrong context", async () => {
      const original = { secret: "data" };
      const master_key = crypto.getRandomValues(new Uint8Array(32));

      const encrypted = await encrypt_metadata(
        original,
        master_key,
        "context1",
      );
      const decrypted = await decrypt_metadata(
        encrypted!,
        master_key,
        "context2",
      );

      expect(decrypted).toBeNull();
    });
  });
});

describe("is_encrypted_blob", () => {
  it("should return true for valid encrypted blob", () => {
    const blob = {
      encrypted_data: "base64data",
      nonce: "base64nonce",
      version: 1,
    };

    expect(is_encrypted_blob(blob)).toBe(true);
  });

  it("should return false for null", () => {
    expect(is_encrypted_blob(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(is_encrypted_blob(undefined)).toBe(false);
  });

  it("should return false for primitive", () => {
    expect(is_encrypted_blob("string")).toBe(false);
    expect(is_encrypted_blob(123)).toBe(false);
    expect(is_encrypted_blob(true)).toBe(false);
  });

  it("should return false for missing fields", () => {
    expect(is_encrypted_blob({ encrypted_data: "data" })).toBe(false);
    expect(is_encrypted_blob({ encrypted_data: "data", nonce: "nonce" })).toBe(
      false,
    );
    expect(is_encrypted_blob({ nonce: "nonce", version: 1 })).toBe(false);
  });

  it("should return false for wrong field types", () => {
    expect(
      is_encrypted_blob({ encrypted_data: 123, nonce: "nonce", version: 1 }),
    ).toBe(false);
    expect(
      is_encrypted_blob({ encrypted_data: "data", nonce: 456, version: 1 }),
    ).toBe(false);
    expect(
      is_encrypted_blob({
        encrypted_data: "data",
        nonce: "nonce",
        version: "1",
      }),
    ).toBe(false);
  });
});

describe("Constants", () => {
  it("should have correct PBKDF2 iterations", () => {
    expect(PBKDF2_ITERATIONS).toBe(310000);
  });

  it("should have correct salt length", () => {
    expect(SALT_LENGTH).toBe(16);
  });

  it("should have correct nonce length", () => {
    expect(NONCE_LENGTH).toBe(12);
  });
});
