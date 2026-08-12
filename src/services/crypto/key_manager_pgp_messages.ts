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
import { type EncryptedKeyHandle } from "./key_manager_core";
import { unlock_private_key } from "./key_manager_pgp_unlocked_cache";
import { with_decrypted_key } from "./key_manager_pgp_usage";
import { with_aes_kw_fallback } from "./webcrypto_aes_kw";

export type sender_verification_status =
  | "verified"
  | "invalid"
  | "unsigned"
  | "no_keys"
  | "unknown";

export interface decrypted_message_result {
  plaintext: string;
  verification: sender_verification_status;
  has_signature: boolean;
}

export interface sender_signing_key {
  armored_secret_key: string;
  passphrase: string;
}

async function parse_signing_keys(
  signing_key: sender_signing_key | sender_signing_key[] | undefined,
): Promise<openpgp.PrivateKey[] | undefined> {
  if (!signing_key) return undefined;

  const inputs = Array.isArray(signing_key) ? signing_key : [signing_key];
  const parsed: openpgp.PrivateKey[] = [];

  for (const input of inputs) {
    try {
      const decrypted = await openpgp.decryptKey({
        ["privateKey" as const]: await openpgp.readPrivateKey({
          armoredKey: input.armored_secret_key,
        }),
        passphrase: input.passphrase,
      });

      parsed.push(decrypted);
    } catch {
      continue;
    }
  }

  return parsed.length > 0 ? parsed : undefined;
}

export interface detached_signature_result {
  signature: string;
  micalg: string;
}

const HASH_ALGORITHM_MICALG: Record<number, string> = {
  1: "pgp-md5",
  2: "pgp-sha1",
  3: "pgp-ripemd160",
  8: "pgp-sha256",
  9: "pgp-sha384",
  10: "pgp-sha512",
  11: "pgp-sha224",
  12: "pgp-sha3-256",
  14: "pgp-sha3-512",
};

export async function sign_detached(
  data: Uint8Array,
  signing_key: sender_signing_key | sender_signing_key[],
): Promise<detached_signature_result | null> {
  const signing_keys = await parse_signing_keys(signing_key);

  if (!signing_keys) return null;

  try {
    const signature = await openpgp.sign({
      message: await openpgp.createMessage({ binary: data }),
      signingKeys: signing_keys,
      detached: true,
      format: "armored",
    });

    const armored =
      typeof signature === "string" ? signature : signature.toString();
    let micalg = "pgp-sha512";

    try {
      const parsed = await openpgp.readSignature({ armoredSignature: armored });
      const packet = parsed.packets[0];
      const hash_algorithm = packet?.hashAlgorithm;

      if (typeof hash_algorithm === "number") {
        micalg = HASH_ALGORITHM_MICALG[hash_algorithm] ?? micalg;
      }
    } catch {
      micalg = "pgp-sha512";
    }

    return { signature: armored, micalg };
  } catch {
    return null;
  }
}

export async function has_usable_signing_key(
  signing_key: sender_signing_key | sender_signing_key[],
): Promise<boolean> {
  const parsed = await parse_signing_keys(signing_key);

  return !!parsed && parsed.length > 0;
}

export async function select_private_key_matching_public(
  armored_private_keys: (string | null | undefined)[],
  armored_public_key: string,
): Promise<string | null> {
  let public_fingerprint: string;

  try {
    const public_key = await openpgp.readKey({
      armoredKey: armored_public_key,
    });

    public_fingerprint = public_key.getFingerprint();
  } catch {
    return null;
  }

  for (const armored of armored_private_keys) {
    if (!armored) continue;
    try {
      const private_key = await openpgp.readPrivateKey({ armoredKey: armored });

      if (private_key.getFingerprint() === public_fingerprint) {
        return armored;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function derive_public_keys_from_private(
  armored_private_keys: string[],
): Promise<string[]> {
  const derived: string[] = [];

  for (const armored of armored_private_keys) {
    try {
      const private_key = await openpgp.readPrivateKey({ armoredKey: armored });

      derived.push(private_key.toPublic().armor());
    } catch {
      continue;
    }
  }

  return derived;
}

async function parse_verification_keys(
  verification_keys: string[] | undefined,
): Promise<openpgp.Key[]> {
  if (!verification_keys || verification_keys.length === 0) return [];

  const parsed: openpgp.Key[] = [];

  for (const armored of verification_keys) {
    try {
      parsed.push(await openpgp.readKey({ armoredKey: armored }));
    } catch {
      continue;
    }
  }

  return parsed;
}

async function evaluate_signatures(
  signatures: { verified: Promise<boolean> }[] | undefined,
  keys_provided: boolean,
): Promise<{ status: sender_verification_status; has_signature: boolean }> {
  const list = signatures || [];
  const has_signature = list.length > 0;

  if (!has_signature) return { status: "unsigned", has_signature: false };
  if (!keys_provided) return { status: "no_keys", has_signature: true };

  let any_valid = false;
  let any_invalid = false;

  for (const sig of list) {
    try {
      const ok = await sig.verified;

      if (ok) any_valid = true;
      else any_invalid = true;
    } catch {
      any_invalid = true;
    }
  }

  if (any_valid) return { status: "verified", has_signature: true };
  if (any_invalid) return { status: "invalid", has_signature: true };

  return { status: "unknown", has_signature: true };
}

export async function encrypt_message(
  plaintext: string,
  recipient_public_key: string,
  signing_key?: sender_signing_key | sender_signing_key[],
): Promise<string> {
  const public_key = await openpgp.readKey({
    armoredKey: recipient_public_key,
  });

  const signing_keys = await parse_signing_keys(signing_key);
  const encrypted = await with_aes_kw_fallback(async () =>
    openpgp.encrypt({
      message: await openpgp.createMessage({ text: plaintext }),
      encryptionKeys: public_key,
      signingKeys: signing_keys,
      format: "armored",
    }),
  );

  return typeof encrypted === "string" ? encrypted : encrypted.toString();
}

export async function encrypt_message_multi(
  plaintext: string,
  recipient_public_keys: string[],
  signing_key?: sender_signing_key | sender_signing_key[],
): Promise<string> {
  if (recipient_public_keys.length === 0) {
    throw new Error("At least one recipient public key is required");
  }

  const parse_results = await Promise.all(
    recipient_public_keys.map(async (key) => {
      try {
        return await openpgp.readKey({ armoredKey: key });
      } catch {
        return null;
      }
    }),
  );

  const valid_keys = parse_results.filter((k): k is openpgp.Key => k !== null);

  if (valid_keys.length === 0) {
    throw new Error("No valid PGP keys found among provided recipient keys");
  }

  const signing_keys = await parse_signing_keys(signing_key);
  const encrypted = await with_aes_kw_fallback(async () =>
    openpgp.encrypt({
      message: await openpgp.createMessage({ text: plaintext }),
      encryptionKeys: valid_keys,
      signingKeys: signing_keys,
      format: "armored",
    }),
  );

  return typeof encrypted === "string" ? encrypted : encrypted.toString();
}

export async function decrypt_message_verified(
  ciphertext: string,
  secret_key: string,
  passphrase: string,
  verification_keys?: string[],
): Promise<decrypted_message_result> {
  const secret_key_obj = await unlock_private_key(secret_key, passphrase);

  const parsed_verification_keys = await parse_verification_keys(verification_keys);
  const result = await with_aes_kw_fallback(async () =>
    openpgp.decrypt({
      message: await openpgp.readMessage({ armoredMessage: ciphertext }),
      decryptionKeys: secret_key_obj,
      verificationKeys:
        parsed_verification_keys.length > 0
          ? parsed_verification_keys
          : undefined,
    }),
  );

  const evaluated = await evaluate_signatures(
    result.signatures as { verified: Promise<boolean> }[] | undefined,
    parsed_verification_keys.length > 0,
  );

  return {
    plaintext: result.data.toString(),
    verification: evaluated.status,
    has_signature: evaluated.has_signature,
  };
}

export async function decrypt_message(
  ciphertext: string,
  secret_key: string,
  passphrase: string,
): Promise<string> {
  const result = await decrypt_message_verified(ciphertext, secret_key, passphrase);

  return result.plaintext;
}

export async function decrypt_message_verified_with_any_key(
  ciphertext: string,
  secret_keys: (string | null | undefined)[],
  passphrase: string,
  verification_keys?: string[],
): Promise<decrypted_message_result> {
  const keys = secret_keys.filter((k): k is string => !!k);

  if (keys.length === 0) {
    throw new Error("no decryption key available");
  }

  let last_error: unknown;

  for (const key of keys) {
    try {
      return await decrypt_message_verified(
        ciphertext,
        key,
        passphrase,
        verification_keys,
      );
    } catch (error) {
      last_error = error;
    }
  }

  throw last_error ?? new Error("no decryption key matched the message");
}

export async function decrypt_message_with_any_key(
  ciphertext: string,
  secret_keys: (string | null | undefined)[],
  passphrase: string,
): Promise<string> {
  const result = await decrypt_message_verified_with_any_key(
    ciphertext,
    secret_keys,
    passphrase,
  );

  return result.plaintext;
}

export async function decrypt_message_with_handle_verified(
  ciphertext: string,
  key_handle: EncryptedKeyHandle,
  passphrase: Uint8Array,
  verification_keys?: string[],
): Promise<decrypted_message_result> {
  return with_decrypted_key(key_handle, passphrase, async (private_key) => {
    const decoder = new TextDecoder();
    const passphrase_string = decoder.decode(passphrase);

    return decrypt_message_verified(
      ciphertext,
      private_key,
      passphrase_string,
      verification_keys,
    );
  });
}

export async function decrypt_message_with_handle(
  ciphertext: string,
  key_handle: EncryptedKeyHandle,
  passphrase: Uint8Array,
): Promise<string> {
  const result = await decrypt_message_with_handle_verified(
    ciphertext,
    key_handle,
    passphrase,
  );

  return result.plaintext;
}
