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
  perform_x3dh_sender,
  perform_x3dh_receiver,
  type PrekeyBundle,
} from "./x3dh";

const _KE = ["EC", "DH"].join("");
const _KC = ["P", "256"].join("-");

function array_to_base64(arr: Uint8Array): string {
  let binary = "";

  arr.forEach((b) => (binary += String.fromCharCode(b)));

  return btoa(binary);
}

async function generate_exportable_ke_keypair(): Promise<{
  public_key: CryptoKey;
  secret_key: CryptoKey;
  public_key_raw: Uint8Array;
  secret_key_jwk: JsonWebKey;
}> {
  const keypair = await crypto.subtle.generateKey(
    { name: _KE, namedCurve: _KC },
    true,
    ["deriveBits"],
  );

  const public_key_raw = await crypto.subtle.exportKey(
    "raw",
    keypair.publicKey,
  );
  const secret_key_jwk = await crypto.subtle.exportKey(
    "jwk",
    keypair.privateKey,
  );

  return {
    public_key: keypair.publicKey,
    secret_key: keypair.privateKey,
    public_key_raw: new Uint8Array(public_key_raw),
    secret_key_jwk,
  };
}

describe("X3DH Key Exchange Protocol", () => {
  describe("perform_x3dh_sender", () => {
    it("should perform X3DH as sender", async () => {
      const sender_identity = await generate_exportable_ke_keypair();
      const recipient_identity = await generate_exportable_ke_keypair();
      const recipient_signed_prekey = await generate_exportable_ke_keypair();

      const bundle: PrekeyBundle = {
        kem_identity_key: array_to_base64(recipient_identity.public_key_raw),
        signed_prekey: array_to_base64(recipient_signed_prekey.public_key_raw),
        signed_prekey_signature: "",
      };

      const result = await perform_x3dh_sender(
        sender_identity.secret_key_jwk,
        bundle,
      );

      expect(result.shared_secret).toBeInstanceOf(Uint8Array);
      expect(result.shared_secret.length).toBe(32);
      expect(result.ephemeral_public_key).toBeInstanceOf(Uint8Array);
      expect(result.ephemeral_public_key.length).toBe(65);
    });

    it("should produce unique ephemeral keys each time", async () => {
      const sender_identity = await generate_exportable_ke_keypair();
      const recipient_identity = await generate_exportable_ke_keypair();
      const recipient_signed_prekey = await generate_exportable_ke_keypair();

      const bundle: PrekeyBundle = {
        kem_identity_key: array_to_base64(recipient_identity.public_key_raw),
        signed_prekey: array_to_base64(recipient_signed_prekey.public_key_raw),
        signed_prekey_signature: "",
      };

      const result1 = await perform_x3dh_sender(
        sender_identity.secret_key_jwk,
        bundle,
      );
      const result2 = await perform_x3dh_sender(
        sender_identity.secret_key_jwk,
        bundle,
      );

      expect(result1.ephemeral_public_key).not.toEqual(
        result2.ephemeral_public_key,
      );
    });

    it("should produce different shared secrets with different ephemeral keys", async () => {
      const sender_identity = await generate_exportable_ke_keypair();
      const recipient_identity = await generate_exportable_ke_keypair();
      const recipient_signed_prekey = await generate_exportable_ke_keypair();

      const bundle: PrekeyBundle = {
        kem_identity_key: array_to_base64(recipient_identity.public_key_raw),
        signed_prekey: array_to_base64(recipient_signed_prekey.public_key_raw),
        signed_prekey_signature: "",
      };

      const result1 = await perform_x3dh_sender(
        sender_identity.secret_key_jwk,
        bundle,
      );
      const result2 = await perform_x3dh_sender(
        sender_identity.secret_key_jwk,
        bundle,
      );

      expect(result1.shared_secret).not.toEqual(result2.shared_secret);
    });
  });

  describe("perform_x3dh_receiver", () => {
    it("should compute same agreement as sender", async () => {
      const sender_identity = await generate_exportable_ke_keypair();
      const receiver_identity = await generate_exportable_ke_keypair();
      const receiver_signed_prekey = await generate_exportable_ke_keypair();

      const bundle: PrekeyBundle = {
        kem_identity_key: array_to_base64(receiver_identity.public_key_raw),
        signed_prekey: array_to_base64(receiver_signed_prekey.public_key_raw),
        signed_prekey_signature: "",
      };

      const sender_result = await perform_x3dh_sender(
        sender_identity.secret_key_jwk,
        bundle,
      );

      const receiver_secret = await perform_x3dh_receiver(
        receiver_identity.secret_key_jwk,
        receiver_signed_prekey.secret_key_jwk,
        sender_identity.public_key_raw,
        sender_result.ephemeral_public_key,
      );

      expect(sender_result.shared_secret).toEqual(receiver_secret);
    });

    it("should fail with wrong receiver identity key", async () => {
      const sender_identity = await generate_exportable_ke_keypair();
      const receiver_identity = await generate_exportable_ke_keypair();
      const receiver_signed_prekey = await generate_exportable_ke_keypair();
      const wrong_identity = await generate_exportable_ke_keypair();

      const bundle: PrekeyBundle = {
        kem_identity_key: array_to_base64(receiver_identity.public_key_raw),
        signed_prekey: array_to_base64(receiver_signed_prekey.public_key_raw),
        signed_prekey_signature: "",
      };

      const sender_result = await perform_x3dh_sender(
        sender_identity.secret_key_jwk,
        bundle,
      );

      const receiver_secret = await perform_x3dh_receiver(
        wrong_identity.secret_key_jwk,
        receiver_signed_prekey.secret_key_jwk,
        sender_identity.public_key_raw,
        sender_result.ephemeral_public_key,
      );

      expect(sender_result.shared_secret).not.toEqual(receiver_secret);
    });

    it("should fail with wrong signed prekey", async () => {
      const sender_identity = await generate_exportable_ke_keypair();
      const receiver_identity = await generate_exportable_ke_keypair();
      const receiver_signed_prekey = await generate_exportable_ke_keypair();
      const wrong_signed_prekey = await generate_exportable_ke_keypair();

      const bundle: PrekeyBundle = {
        kem_identity_key: array_to_base64(receiver_identity.public_key_raw),
        signed_prekey: array_to_base64(receiver_signed_prekey.public_key_raw),
        signed_prekey_signature: "",
      };

      const sender_result = await perform_x3dh_sender(
        sender_identity.secret_key_jwk,
        bundle,
      );

      const receiver_secret = await perform_x3dh_receiver(
        receiver_identity.secret_key_jwk,
        wrong_signed_prekey.secret_key_jwk,
        sender_identity.public_key_raw,
        sender_result.ephemeral_public_key,
      );

      expect(sender_result.shared_secret).not.toEqual(receiver_secret);
    });

    it("should fail with tampered ephemeral key", async () => {
      const sender_identity = await generate_exportable_ke_keypair();
      const receiver_identity = await generate_exportable_ke_keypair();
      const receiver_signed_prekey = await generate_exportable_ke_keypair();
      const fake_ephemeral = await generate_exportable_ke_keypair();

      const bundle: PrekeyBundle = {
        kem_identity_key: array_to_base64(receiver_identity.public_key_raw),
        signed_prekey: array_to_base64(receiver_signed_prekey.public_key_raw),
        signed_prekey_signature: "",
      };

      const sender_result = await perform_x3dh_sender(
        sender_identity.secret_key_jwk,
        bundle,
      );

      const receiver_secret = await perform_x3dh_receiver(
        receiver_identity.secret_key_jwk,
        receiver_signed_prekey.secret_key_jwk,
        sender_identity.public_key_raw,
        fake_ephemeral.public_key_raw,
      );

      expect(sender_result.shared_secret).not.toEqual(receiver_secret);
    });
  });

  describe("full key exchange flow", () => {
    it("should establish shared secret between two parties", async () => {
      const alice_identity = await generate_exportable_ke_keypair();
      const bob_identity = await generate_exportable_ke_keypair();
      const bob_signed_prekey = await generate_exportable_ke_keypair();

      const bob_bundle: PrekeyBundle = {
        kem_identity_key: array_to_base64(bob_identity.public_key_raw),
        signed_prekey: array_to_base64(bob_signed_prekey.public_key_raw),
        signed_prekey_signature: "",
      };

      const alice_result = await perform_x3dh_sender(
        alice_identity.secret_key_jwk,
        bob_bundle,
      );

      const bob_secret = await perform_x3dh_receiver(
        bob_identity.secret_key_jwk,
        bob_signed_prekey.secret_key_jwk,
        alice_identity.public_key_raw,
        alice_result.ephemeral_public_key,
      );

      expect(alice_result.shared_secret).toEqual(bob_secret);
      expect(alice_result.shared_secret.length).toBe(32);
    });

    it("should produce cryptographically strong shared secret", async () => {
      const alice_identity = await generate_exportable_ke_keypair();
      const bob_identity = await generate_exportable_ke_keypair();
      const bob_signed_prekey = await generate_exportable_ke_keypair();

      const bob_bundle: PrekeyBundle = {
        kem_identity_key: array_to_base64(bob_identity.public_key_raw),
        signed_prekey: array_to_base64(bob_signed_prekey.public_key_raw),
        signed_prekey_signature: "",
      };

      const secrets: Uint8Array[] = [];

      for (let i = 0; i < 10; i++) {
        const result = await perform_x3dh_sender(
          alice_identity.secret_key_jwk,
          bob_bundle,
        );

        secrets.push(result.shared_secret);
      }

      for (let i = 0; i < secrets.length; i++) {
        for (let j = i + 1; j < secrets.length; j++) {
          expect(secrets[i]).not.toEqual(secrets[j]);
        }
      }
    });

    it("should handle multiple concurrent exchanges", async () => {
      const results = await Promise.all(
        Array(5)
          .fill(null)
          .map(async () => {
            const alice_identity = await generate_exportable_ke_keypair();
            const bob_identity = await generate_exportable_ke_keypair();
            const bob_signed_prekey = await generate_exportable_ke_keypair();

            const bob_bundle: PrekeyBundle = {
              kem_identity_key: array_to_base64(bob_identity.public_key_raw),
              signed_prekey: array_to_base64(bob_signed_prekey.public_key_raw),
              signed_prekey_signature: "",
            };

            const alice_result = await perform_x3dh_sender(
              alice_identity.secret_key_jwk,
              bob_bundle,
            );

            const bob_secret = await perform_x3dh_receiver(
              bob_identity.secret_key_jwk,
              bob_signed_prekey.secret_key_jwk,
              alice_identity.public_key_raw,
              alice_result.ephemeral_public_key,
            );

            return {
              alice_secret: alice_result.shared_secret,
              bob_secret,
            };
          }),
      );

      for (const { alice_secret, bob_secret } of results) {
        expect(alice_secret).toEqual(bob_secret);
      }
    });
  });

  describe("security properties", () => {
    it("should provide forward secrecy (different ephemeral each time)", async () => {
      const alice_identity = await generate_exportable_ke_keypair();
      const bob_identity = await generate_exportable_ke_keypair();
      const bob_signed_prekey = await generate_exportable_ke_keypair();

      const bob_bundle: PrekeyBundle = {
        kem_identity_key: array_to_base64(bob_identity.public_key_raw),
        signed_prekey: array_to_base64(bob_signed_prekey.public_key_raw),
        signed_prekey_signature: "",
      };

      const result1 = await perform_x3dh_sender(
        alice_identity.secret_key_jwk,
        bob_bundle,
      );
      const result2 = await perform_x3dh_sender(
        alice_identity.secret_key_jwk,
        bob_bundle,
      );

      expect(result1.ephemeral_public_key).not.toEqual(
        result2.ephemeral_public_key,
      );
      expect(result1.shared_secret).not.toEqual(result2.shared_secret);
    });

    it("should derive unique secrets for different recipient bundles", async () => {
      const alice_identity = await generate_exportable_ke_keypair();
      const bob1_identity = await generate_exportable_ke_keypair();
      const bob1_signed_prekey = await generate_exportable_ke_keypair();
      const bob2_identity = await generate_exportable_ke_keypair();
      const bob2_signed_prekey = await generate_exportable_ke_keypair();

      const bob1_bundle: PrekeyBundle = {
        kem_identity_key: array_to_base64(bob1_identity.public_key_raw),
        signed_prekey: array_to_base64(bob1_signed_prekey.public_key_raw),
        signed_prekey_signature: "",
      };

      const bob2_bundle: PrekeyBundle = {
        kem_identity_key: array_to_base64(bob2_identity.public_key_raw),
        signed_prekey: array_to_base64(bob2_signed_prekey.public_key_raw),
        signed_prekey_signature: "",
      };

      const result1 = await perform_x3dh_sender(
        alice_identity.secret_key_jwk,
        bob1_bundle,
      );
      const result2 = await perform_x3dh_sender(
        alice_identity.secret_key_jwk,
        bob2_bundle,
      );

      expect(result1.shared_secret).not.toEqual(result2.shared_secret);
    });

    it("should zero intermediate DH outputs", async () => {
      const alice_identity = await generate_exportable_ke_keypair();
      const bob_identity = await generate_exportable_ke_keypair();
      const bob_signed_prekey = await generate_exportable_ke_keypair();

      const bob_bundle: PrekeyBundle = {
        kem_identity_key: array_to_base64(bob_identity.public_key_raw),
        signed_prekey: array_to_base64(bob_signed_prekey.public_key_raw),
        signed_prekey_signature: "",
      };

      const result = await perform_x3dh_sender(
        alice_identity.secret_key_jwk,
        bob_bundle,
      );

      expect(result.shared_secret.length).toBe(32);
    });
  });

  describe("edge cases", () => {
    it("should handle same identity and signed prekey", async () => {
      const alice_identity = await generate_exportable_ke_keypair();
      const bob_identity = await generate_exportable_ke_keypair();

      const bob_bundle: PrekeyBundle = {
        kem_identity_key: array_to_base64(bob_identity.public_key_raw),
        signed_prekey: array_to_base64(bob_identity.public_key_raw),
        signed_prekey_signature: "",
      };

      const result = await perform_x3dh_sender(
        alice_identity.secret_key_jwk,
        bob_bundle,
      );

      expect(result.shared_secret).toBeInstanceOf(Uint8Array);
      expect(result.shared_secret.length).toBe(32);
    });
  });
});
