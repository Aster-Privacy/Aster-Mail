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
import type { EncryptedVault, SecureVaultHandle } from "./key_manager_core";

import { describe, it, expect, beforeAll } from "vitest";
import * as openpgp from "openpgp";

import {
  with_decrypted_key,
  hash_email,
  hash_recovery_email,
  generate_identity_keypair,
  generate_signed_prekey,
  verify_prekey_signature,
  verify_key_binding,
  encrypt_vault,
  decrypt_vault,
  decrypt_vault_to_handles,
  has_usable_signing_key,
  derive_public_keys_from_private,
  select_private_key_matching_public,
  encrypt_message,
  decrypt_message_with_handle,
  decrypt_message_with_handle_verified,
  clear_key_handle,
  clear_vault_handle,
  string_to_passphrase,
  normalize_vault_fields,
} from "./key_manager_pgp";
import { array_to_base64 } from "./base64";

const password = "characterization-passphrase";
const owner_email = "owner@astermail.org";

interface fixture {
  identity_public: string;
  identity_secret: string;
  prekey_public: string;
  prekey_secret: string;
  prekey_signature: string;
  vault: EncryptedVault;
  encrypted_vault: string;
  vault_nonce: string;
}

let fx: fixture;

beforeAll(async () => {
  const identity = await generate_identity_keypair(
    "Owner",
    owner_email,
    password,
  );
  const prekey = await generate_signed_prekey(
    "Owner",
    owner_email,
    password,
    identity.secret_key,
  );

  const vault: EncryptedVault = {
    identity_key: identity.secret_key,
    signed_prekey: prekey.keypair.public_key,
    signed_prekey_private: prekey.keypair.secret_key,
    recovery_codes: ["ASTER-AAAA-BBBB-CCCC-DDDD"],
  };

  const sealed = await encrypt_vault(vault, password);

  fx = {
    identity_public: identity.public_key,
    identity_secret: identity.secret_key,
    prekey_public: prekey.keypair.public_key,
    prekey_secret: prekey.keypair.secret_key,
    prekey_signature: prekey.signature,
    vault,
    encrypted_vault: sealed.encrypted_vault,
    vault_nonce: sealed.vault_nonce,
  };
}, 60000);

describe("hash_recovery_email", () => {
  it("is deterministic and case insensitive", async () => {
    const a = await hash_recovery_email("Person@Example.com");
    const b = await hash_recovery_email("  person@example.com  ");

    expect(a).toBe(b);
  });

  it("matches the pinned uniqueness context string", async () => {
    const expected = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        "aster-recovery-email-uniqueness-v1:person@example.com",
      ),
    );

    expect(await hash_recovery_email("person@example.com")).toBe(
      array_to_base64(new Uint8Array(expected)),
    );
  });

  it("lives in a different key domain than the mailbox address hash", async () => {
    expect(await hash_recovery_email("person@example.com")).not.toBe(
      await hash_email("person@example.com"),
    );
  });

  it("separates distinct addresses", async () => {
    expect(await hash_recovery_email("a@example.com")).not.toBe(
      await hash_recovery_email("b@example.com"),
    );
  });
});

async function cleartext_sign(text: string): Promise<string> {
  const signing_key = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({
      armoredKey: fx.identity_secret,
    }),
    passphrase: password,
  });

  const signed = await openpgp.sign({
    message: await openpgp.createCleartextMessage({ text }),
    signingKeys: signing_key,
    format: "armored",
  });

  return String(signed);
}

describe("verify_prekey_signature", () => {
  it("accepts a cleartext signature whose text is the prekey", async () => {
    expect(
      await verify_prekey_signature(
        fx.prekey_public,
        await cleartext_sign(fx.prekey_public),
        fx.identity_public,
      ),
    ).toBe(true);
  });

  it("rejects the signature when the signed text does not match", async () => {
    expect(
      await verify_prekey_signature(
        "not the prekey",
        await cleartext_sign(fx.prekey_public),
        fx.identity_public,
      ),
    ).toBe(false);
  });

  it("rejects a signature checked against an unrelated identity key", async () => {
    const other = await generate_identity_keypair(
      "Other",
      "other@astermail.org",
      password,
    );

    expect(
      await verify_prekey_signature(
        fx.prekey_public,
        await cleartext_sign(fx.prekey_public),
        other.public_key,
      ),
    ).toBe(false);
  }, 30000);

  it("rejects the message-format signature that generate_signed_prekey emits", async () => {
    expect(
      await verify_prekey_signature(
        fx.prekey_public,
        fx.prekey_signature,
        fx.identity_public,
      ),
    ).toBe(false);
  });

  it("returns false rather than throwing on unreadable input", async () => {
    expect(
      await verify_prekey_signature("x", "not a signature", "not a key"),
    ).toBe(false);
    expect(await verify_prekey_signature("x", "", fx.identity_public)).toBe(
      false,
    );
  });
});

describe("verify_key_binding", () => {
  it("reports the two fingerprints and a valid binding", async () => {
    const result = await verify_key_binding(
      fx.identity_public,
      fx.prekey_public,
      await cleartext_sign(fx.prekey_public),
    );

    const identity = await openpgp.readKey({ armoredKey: fx.identity_public });
    const prekey = await openpgp.readKey({ armoredKey: fx.prekey_public });

    expect(result.valid).toBe(true);
    expect(result.identity_fingerprint).toBe(identity.getFingerprint());
    expect(result.prekey_fingerprint).toBe(prekey.getFingerprint());
    expect(result.identity_fingerprint).not.toBe(result.prekey_fingerprint);
  });

  it("reports an invalid binding but still returns both fingerprints", async () => {
    const result = await verify_key_binding(
      fx.identity_public,
      fx.prekey_public,
      "garbage",
    );

    expect(result.valid).toBe(false);
    expect(result.identity_fingerprint).toBeTruthy();
    expect(result.prekey_fingerprint).toBeTruthy();
  });

  it("throws when a key cannot be read at all", async () => {
    await expect(
      verify_key_binding("not a key", fx.prekey_public, fx.prekey_signature),
    ).rejects.toThrow();
  });
});

describe("has_usable_signing_key", () => {
  it("accepts a single key that unlocks with its passphrase", async () => {
    expect(
      await has_usable_signing_key({
        armored_secret_key: fx.identity_secret,
        passphrase: password,
      }),
    ).toBe(true);
  });

  it("rejects a key with the wrong passphrase", async () => {
    expect(
      await has_usable_signing_key({
        armored_secret_key: fx.identity_secret,
        passphrase: "wrong",
      }),
    ).toBe(false);
  });

  it("accepts a list when at least one key unlocks", async () => {
    expect(
      await has_usable_signing_key([
        { armored_secret_key: "junk", passphrase: password },
        { armored_secret_key: fx.identity_secret, passphrase: password },
      ]),
    ).toBe(true);
  });

  it("rejects an empty list and an all-unusable list", async () => {
    expect(await has_usable_signing_key([])).toBe(false);
    expect(
      await has_usable_signing_key([
        { armored_secret_key: "junk", passphrase: password },
      ]),
    ).toBe(false);
  });
});

describe("derive_public_keys_from_private", () => {
  it("derives a public key that matches the original fingerprint", async () => {
    const derived = await derive_public_keys_from_private([fx.identity_secret]);

    expect(derived).toHaveLength(1);

    const original = await openpgp.readKey({ armoredKey: fx.identity_public });
    const from_private = await openpgp.readKey({ armoredKey: derived[0] });

    expect(from_private.getFingerprint()).toBe(original.getFingerprint());
    expect(from_private.isPrivate()).toBe(false);
  });

  it("skips unreadable entries instead of throwing", async () => {
    const derived = await derive_public_keys_from_private([
      "junk",
      fx.identity_secret,
      "",
    ]);

    expect(derived).toHaveLength(1);
  });

  it("returns an empty list for no input", async () => {
    expect(await derive_public_keys_from_private([])).toEqual([]);
  });

  it("round-trips into select_private_key_matching_public", async () => {
    const derived = await derive_public_keys_from_private([
      fx.prekey_secret,
      fx.identity_secret,
    ]);

    expect(
      await select_private_key_matching_public(
        [fx.prekey_secret, fx.identity_secret],
        derived[1],
      ),
    ).toBe(fx.identity_secret);
  });
});

describe("decrypt_vault_to_handles", () => {
  it("returns handles whose fingerprints match the stored keys", async () => {
    const passphrase = string_to_passphrase(password);
    const handle = await decrypt_vault_to_handles(
      fx.encrypted_vault,
      fx.vault_nonce,
      passphrase,
    );

    const identity = await openpgp.readPrivateKey({
      armoredKey: fx.identity_secret,
    });
    const prekey = await openpgp.readKey({ armoredKey: fx.prekey_public });

    expect(handle.identity_handle.fingerprint).toBe(identity.getFingerprint());
    expect(handle.signed_prekey_handle.fingerprint).toBe(
      prekey.getFingerprint(),
    );
    expect(handle.identity_handle.key_type).toBe("identity");
    expect(handle.signed_prekey_handle.key_type).toBe("signed_prekey");
    expect(handle.signed_prekey_public).toBe(fx.prekey_public);
    expect(handle.vault_id).toBeTruthy();
    expect(handle.recovery_codes_hash).toBeTruthy();
  }, 60000);

  it("rejects the wrong passphrase", async () => {
    await expect(
      decrypt_vault_to_handles(
        fx.encrypted_vault,
        fx.vault_nonce,
        string_to_passphrase("wrong"),
      ),
    ).rejects.toThrow();
  }, 60000);

  it("hashes the recovery codes rather than storing them", async () => {
    const handle = await decrypt_vault_to_handles(
      fx.encrypted_vault,
      fx.vault_nonce,
      string_to_passphrase(password),
    );

    expect(JSON.stringify(handle)).not.toContain("ASTER-AAAA-BBBB-CCCC-DDDD");
  }, 60000);
});

describe("with_decrypted_key and handle-scoped decryption", () => {
  let vault_handle: SecureVaultHandle;

  beforeAll(async () => {
    vault_handle = await decrypt_vault_to_handles(
      fx.encrypted_vault,
      fx.vault_nonce,
      string_to_passphrase(password),
    );
  }, 60000);

  it("hands the armored private key to the operation and returns its result", async () => {
    const seen = await with_decrypted_key(
      vault_handle.identity_handle,
      string_to_passphrase(password),
      async (key) => key,
    );

    expect(seen).toBe(fx.identity_secret);
  });

  it("propagates the operation's error", async () => {
    await expect(
      with_decrypted_key(
        vault_handle.identity_handle,
        string_to_passphrase(password),
        async () => {
          throw new Error("operation exploded");
        },
      ),
    ).rejects.toThrow("operation exploded");
  });

  it("fails on the wrong passphrase without revealing the key", async () => {
    await expect(
      with_decrypted_key(
        vault_handle.identity_handle,
        string_to_passphrase("wrong"),
        async (key) => key,
      ),
    ).rejects.toThrow();
  });

  it("decrypts a message addressed to the handle's key", async () => {
    const ciphertext = await encrypt_message(
      "handle payload",
      fx.identity_public,
    );

    expect(
      await decrypt_message_with_handle(
        ciphertext,
        vault_handle.identity_handle,
        string_to_passphrase(password),
      ),
    ).toBe("handle payload");
  });

  it("reports an unsigned message when no verification keys are given", async () => {
    const ciphertext = await encrypt_message(
      "no signature",
      fx.identity_public,
    );

    const result = await decrypt_message_with_handle_verified(
      ciphertext,
      vault_handle.identity_handle,
      string_to_passphrase(password),
    );

    expect(result.plaintext).toBe("no signature");
    expect(result.has_signature).toBe(false);
    expect(result.verification).toBe("unsigned");
  });

  it("verifies a signed message against the sender's public key", async () => {
    const ciphertext = await encrypt_message(
      "signed payload",
      fx.identity_public,
      { armored_secret_key: fx.identity_secret, passphrase: password },
    );

    const result = await decrypt_message_with_handle_verified(
      ciphertext,
      vault_handle.identity_handle,
      string_to_passphrase(password),
      [fx.identity_public],
    );

    expect(result.plaintext).toBe("signed payload");
    expect(result.has_signature).toBe(true);
    expect(result.verification).toBe("verified");
  });

  it("zeroes the ciphertext buffer when a handle is cleared", async () => {
    const throwaway = await decrypt_vault_to_handles(
      fx.encrypted_vault,
      fx.vault_nonce,
      string_to_passphrase(password),
    );

    expect(
      throwaway.identity_handle.encrypted_key.some((byte) => byte !== 0),
    ).toBe(true);

    clear_key_handle(throwaway.identity_handle);

    expect(
      throwaway.identity_handle.encrypted_key.every((byte) => byte === 0),
    ).toBe(true);
  }, 60000);

  it("clears both handles of a vault handle", async () => {
    const throwaway = await decrypt_vault_to_handles(
      fx.encrypted_vault,
      fx.vault_nonce,
      string_to_passphrase(password),
    );

    clear_vault_handle(throwaway);

    expect(
      throwaway.identity_handle.encrypted_key.every((byte) => byte === 0),
    ).toBe(true);
    expect(
      throwaway.signed_prekey_handle.encrypted_key.every((byte) => byte === 0),
    ).toBe(true);
  }, 60000);
});

describe("vault sealing round trip", () => {
  it("recovers exactly the stored vault under the same password", async () => {
    const opened = await decrypt_vault(
      fx.encrypted_vault,
      fx.vault_nonce,
      password,
    );

    expect(opened).toEqual(fx.vault);
  }, 60000);

  it("uses a fresh salt and nonce for every seal", async () => {
    const again = await encrypt_vault(fx.vault, password);

    expect(again.vault_nonce).not.toBe(fx.vault_nonce);
    expect(again.encrypted_vault).not.toBe(fx.encrypted_vault);
  }, 60000);

  it("adopts the mobile private key field when no identity key is present", () => {
    const normalized = normalize_vault_fields({
      pgp_private_key: "-----BEGIN PGP PRIVATE KEY BLOCK-----\nx\n",
      signed_prekey: "",
      signed_prekey_private: "",
      recovery_codes: [],
    } as unknown as EncryptedVault);

    expect(normalized.identity_key).toContain("BEGIN PGP PRIVATE KEY");
  });

  it("leaves an existing identity key alone", () => {
    const normalized = normalize_vault_fields({
      identity_key: "already here",
      pgp_private_key: "-----BEGIN PGP PRIVATE KEY BLOCK-----\nx\n",
      signed_prekey: "",
      signed_prekey_private: "",
      recovery_codes: [],
    } as unknown as EncryptedVault);

    expect(normalized.identity_key).toBe("already here");
  });
});
