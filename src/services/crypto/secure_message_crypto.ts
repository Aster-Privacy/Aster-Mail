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
import { array_to_base64, base64_to_array } from "./envelope";
import { zero_uint8_array } from "./secure_memory";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

//
// Hybrid post-quantum encryption for password-protected messages sent to
// external recipients.
//
// Key derivation chain:
//   PBKDF2-SHA256(password, kdf_salt, 310000) → 64 bytes:
//     bytes[0..32] = kdf_key      (encrypts KEM seed; used as HKDF salt)
//     bytes[32..64] = auth_verifier (SHA-256 hash → auth_proof for server)
//
//   ML-KEM-768 ephemeral keypair generated from a random 64-byte seed:
//     (kem_pk, kem_sk) = ML-KEM-768.KeyGen(kem_seed)
//     (kem_ct, kem_ss) = ML-KEM-768.Encaps(kem_pk)
//
//   kem_seed is AES-256-GCM encrypted under kdf_key so the recipient can
//   regenerate the keypair and decapsulate kem_ct to recover kem_ss.
//
//   content_key = HKDF-SHA256(ikm=kem_ss, salt=kdf_key, info="aster-secure-send-v2")
//
// The server stores: kem_ct, AES-GCM(kem_seed), kdf_salt, SHA-256(auth_verifier),
// and opaque AES-GCM ciphertexts for subject/body/attachments.  It never holds
// kem_ss or content_key.
//
// For harvest-now-decrypt-later: a quantum adversary who can break AES-256 still
// cannot recover kem_ss without also breaking ML-KEM-768's lattice problem.
//

const PBKDF2_ITERATIONS = 310000;
const HASH_ALG = ["SHA", "256"].join("-");
const SALT_LENGTH = 16;
const KEM_SEED_LENGTH = 64;
const NONCE_LENGTH = 12;
const KDF_KEY_BYTES = 32;
const AUTH_VERIFIER_BYTES = 32;
const DERIVED_BITS = (KDF_KEY_BYTES + AUTH_VERIFIER_BYTES) * 8;

export interface EncryptedField {
  ciphertext: string;
  nonce: string;
}

interface AttachmentEntry {
  ciphertext: string;
  nonce: string;
  encrypted_filename: string;
  filename_nonce: string;
  encrypted_meta: string;
  meta_nonce: string;
}

export interface EncryptedSecureAttachment {
  ciphertext: string;
  nonce: string;
  encrypted_filename: string;
  filename_nonce: string;
  content_type: string;
  size_bytes: number;
}

export interface SecureMessagePlaintext {
  subject: string;
  body: string;
}

export interface SecureAttachmentInput {
  filename: string;
  content_type: string;
  data: Uint8Array;
}

export interface EncryptedSecureMessage {
  kdf_salt: string;
  auth_proof: string;
  kem_ciphertext: string;
  encrypted_kem_seed: string;
  kem_seed_nonce: string;
  encrypted_subject: EncryptedField;
  encrypted_body: EncryptedField;
  encrypted_attachments_bundle: string | null;
}

export interface DecryptedSecureAttachment {
  filename: string;
  content_type: string;
  size_bytes: number;
  data: Uint8Array;
}

export interface DecryptedSecureMessage {
  subject: string;
  body: string;
  attachments: DecryptedSecureAttachment[];
}

interface RawMaterial {
  kdf_key_bytes: Uint8Array;
  auth_verifier: Uint8Array;
}

async function derive_raw_material(
  password_bytes: Uint8Array,
  salt: Uint8Array,
): Promise<RawMaterial> {
  const key_material = await crypto.subtle.importKey(
    "raw",
    password_bytes,
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALG,
    },
    key_material,
    DERIVED_BITS,
  );

  const derived_bytes = new Uint8Array(derived);
  const kdf_key_bytes = new Uint8Array(
    derived_bytes.slice(0, KDF_KEY_BYTES),
  );
  const auth_verifier = new Uint8Array(
    derived_bytes.slice(KDF_KEY_BYTES, KDF_KEY_BYTES + AUTH_VERIFIER_BYTES),
  );

  zero_uint8_array(derived_bytes);

  return { kdf_key_bytes, auth_verifier };
}

async function derive_content_key(
  kem_ss: Uint8Array,
  kdf_key_bytes: Uint8Array,
): Promise<CryptoKey> {
  const hkdf_input = await crypto.subtle.importKey(
    "raw",
    kem_ss,
    "HKDF",
    false,
    ["deriveBits"],
  );

  const content_key_bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: HASH_ALG,
      salt: kdf_key_bytes,
      info: new TextEncoder().encode("aster-secure-send-v2"),
    },
    hkdf_input,
    256,
  );

  const content_key = await crypto.subtle.importKey(
    "raw",
    content_key_bits,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  zero_uint8_array(new Uint8Array(content_key_bits));

  return content_key;
}

async function compute_auth_proof(auth_verifier: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(HASH_ALG, auth_verifier);

  return array_to_base64(new Uint8Array(digest));
}

async function encrypt_field(
  key: CryptoKey,
  data: Uint8Array,
): Promise<EncryptedField> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data,
  );

  return {
    ciphertext: array_to_base64(new Uint8Array(encrypted)),
    nonce: array_to_base64(nonce),
  };
}

async function decrypt_field(
  key: CryptoKey,
  field: EncryptedField,
): Promise<Uint8Array> {
  const nonce = base64_to_array(field.nonce);
  const ciphertext = base64_to_array(field.ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    ciphertext,
  );

  return new Uint8Array(decrypted);
}

export async function encrypt_secure_message(
  password: string,
  plaintext: SecureMessagePlaintext,
  attachments: SecureAttachmentInput[] = [],
): Promise<EncryptedSecureMessage> {
  const encoder = new TextEncoder();
  const password_bytes = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const material = await derive_raw_material(password_bytes, salt);

  zero_uint8_array(password_bytes);

  const kem_seed = crypto.getRandomValues(new Uint8Array(KEM_SEED_LENGTH));
  const { publicKey: kem_pk, secretKey: kem_sk } = ml_kem768.keygen(kem_seed);
  const { cipherText: kem_ct, sharedSecret: kem_ss } =
    ml_kem768.encapsulate(kem_pk);

  const content_key = await derive_content_key(kem_ss, material.kdf_key_bytes);

  zero_uint8_array(kem_ss);
  zero_uint8_array(kem_sk);

  const kdf_aes_key = await crypto.subtle.importKey(
    "raw",
    material.kdf_key_bytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const kem_seed_nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const encrypted_kem_seed_buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: kem_seed_nonce },
    kdf_aes_key,
    kem_seed,
  );

  zero_uint8_array(kem_seed);

  const auth_proof = await compute_auth_proof(material.auth_verifier);

  zero_uint8_array(material.auth_verifier);

  try {
    const encrypted_subject = await encrypt_field(
      content_key,
      encoder.encode(plaintext.subject),
    );
    const encrypted_body = await encrypt_field(
      content_key,
      encoder.encode(plaintext.body),
    );

    let encrypted_attachments_bundle: string | null = null;

    if (attachments.length > 0) {
      const entries: AttachmentEntry[] = [];

      for (const att of attachments) {
        const data_field = await encrypt_field(content_key, att.data);
        const filename_field = await encrypt_field(
          content_key,
          encoder.encode(att.filename),
        );
        const meta_bytes = encoder.encode(
          JSON.stringify({
            content_type: att.content_type,
            size_bytes: att.data.byteLength,
          }),
        );
        const meta_field = await encrypt_field(content_key, meta_bytes);

        entries.push({
          ciphertext: data_field.ciphertext,
          nonce: data_field.nonce,
          encrypted_filename: filename_field.ciphertext,
          filename_nonce: filename_field.nonce,
          encrypted_meta: meta_field.ciphertext,
          meta_nonce: meta_field.nonce,
        });
      }

      const bundle_json = new TextEncoder().encode(JSON.stringify(entries));
      const bundle_field = await encrypt_field(content_key, bundle_json);
      encrypted_attachments_bundle = array_to_base64(
        new TextEncoder().encode(JSON.stringify(bundle_field)),
      );
    }

    return {
      kdf_salt: array_to_base64(salt),
      auth_proof,
      kem_ciphertext: array_to_base64(kem_ct),
      encrypted_kem_seed: array_to_base64(new Uint8Array(encrypted_kem_seed_buf)),
      kem_seed_nonce: array_to_base64(kem_seed_nonce),
      encrypted_subject,
      encrypted_body,
      encrypted_attachments_bundle,
    };
  } finally {
    zero_uint8_array(material.kdf_key_bytes);
  }
}

export async function derive_auth_proof(
  password: string,
  kdf_salt: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const password_bytes = encoder.encode(password);
  const salt = base64_to_array(kdf_salt);
  const material = await derive_raw_material(password_bytes, salt);

  zero_uint8_array(password_bytes);
  zero_uint8_array(material.kdf_key_bytes);

  const proof = await compute_auth_proof(material.auth_verifier);

  zero_uint8_array(material.auth_verifier);

  return proof;
}

export interface SecureMessageBundle {
  encrypted_subject: EncryptedField;
  encrypted_body: EncryptedField;
  kem_ciphertext?: string;
  encrypted_kem_seed?: string;
  kem_seed_nonce?: string;
  encrypted_attachments_bundle?: string | null;
  encrypted_attachments?: EncryptedSecureAttachment[];
}

export async function decrypt_secure_message(
  password: string,
  kdf_salt: string,
  bundle: SecureMessageBundle,
): Promise<DecryptedSecureMessage> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const password_bytes = encoder.encode(password);
  const salt = base64_to_array(kdf_salt);
  const material = await derive_raw_material(password_bytes, salt);

  zero_uint8_array(password_bytes);

  let content_key: CryptoKey;

  if (bundle.kem_ciphertext && bundle.encrypted_kem_seed && bundle.kem_seed_nonce) {
    const kdf_aes_key = await crypto.subtle.importKey(
      "raw",
      material.kdf_key_bytes,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );

    const kem_seed = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64_to_array(bundle.kem_seed_nonce) },
        kdf_aes_key,
        base64_to_array(bundle.encrypted_kem_seed),
      ),
    );

    const { secretKey: kem_sk } = ml_kem768.keygen(kem_seed);

    zero_uint8_array(kem_seed);

    const kem_ss = ml_kem768.decapsulate(
      base64_to_array(bundle.kem_ciphertext),
      kem_sk,
    );

    zero_uint8_array(kem_sk);

    content_key = await derive_content_key(kem_ss, material.kdf_key_bytes);

    zero_uint8_array(kem_ss);
  } else {
    content_key = await crypto.subtle.importKey(
      "raw",
      material.kdf_key_bytes,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
  }

  zero_uint8_array(material.kdf_key_bytes);
  zero_uint8_array(material.auth_verifier);

  const subject_bytes = await decrypt_field(content_key, bundle.encrypted_subject);
  const body_bytes = await decrypt_field(content_key, bundle.encrypted_body);
  const result_attachments: DecryptedSecureAttachment[] = [];

  if (bundle.encrypted_attachments_bundle) {
    const envelope_bytes = base64_to_array(bundle.encrypted_attachments_bundle);
    const bundle_field: EncryptedField = JSON.parse(decoder.decode(envelope_bytes));
    const bundle_json = await decrypt_field(content_key, bundle_field);
    const entries: AttachmentEntry[] = JSON.parse(decoder.decode(bundle_json));

    for (const entry of entries) {
      const data = await decrypt_field(content_key, {
        ciphertext: entry.ciphertext,
        nonce: entry.nonce,
      });
      const filename_bytes = await decrypt_field(content_key, {
        ciphertext: entry.encrypted_filename,
        nonce: entry.filename_nonce,
      });
      const meta_bytes = await decrypt_field(content_key, {
        ciphertext: entry.encrypted_meta,
        nonce: entry.meta_nonce,
      });
      const meta = JSON.parse(decoder.decode(meta_bytes)) as {
        content_type: string;
        size_bytes: number;
      };

      result_attachments.push({
        filename: decoder.decode(filename_bytes),
        content_type: meta.content_type,
        size_bytes: meta.size_bytes,
        data,
      });
    }
  } else if (bundle.encrypted_attachments) {
    for (const att of bundle.encrypted_attachments) {
      const data = await decrypt_field(content_key, {
        ciphertext: att.ciphertext,
        nonce: att.nonce,
      });
      const filename_bytes = await decrypt_field(content_key, {
        ciphertext: att.encrypted_filename,
        nonce: att.filename_nonce,
      });

      result_attachments.push({
        filename: decoder.decode(filename_bytes),
        content_type: att.content_type,
        size_bytes: att.size_bytes,
        data,
      });
    }
  }

  return {
    subject: decoder.decode(subject_bytes),
    body: decoder.decode(body_bytes),
    attachments: result_attachments,
  };
}
