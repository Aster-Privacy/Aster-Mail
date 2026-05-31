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

//
// Zero-knowledge encryption for password-protected messages sent to external
// recipients. The sender's browser derives a content key and an auth verifier
// from the shared password; the server only ever stores opaque ciphertext and a
// hash of the auth verifier, so it can neither read the content nor derive the
// content key. The recipient's browser repeats the derivation to decrypt.
//
// One PBKDF2 pass over (password, salt) yields 64 bytes split into:
//   - bytes[0..32]  content key   (AES-GCM, never leaves the client)
//   - bytes[32..64] auth verifier (the client proves knowledge to the server)
//

const PBKDF2_ITERATIONS = 310000;
const HASH_ALG = ["SHA", "256"].join("-");
const SALT_LENGTH = 16;
const NONCE_LENGTH = 12;
const CONTENT_KEY_BYTES = 32;
const AUTH_VERIFIER_BYTES = 32;
const DERIVED_BITS = (CONTENT_KEY_BYTES + AUTH_VERIFIER_BYTES) * 8;

export interface EncryptedField {
  ciphertext: string;
  nonce: string;
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
  encrypted_subject: EncryptedField;
  encrypted_body: EncryptedField;
  encrypted_attachments: EncryptedSecureAttachment[];
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

interface SecureMaterial {
  content_key: CryptoKey;
  auth_verifier: Uint8Array;
}

async function derive_material(
  password_bytes: Uint8Array,
  salt: Uint8Array,
): Promise<SecureMaterial> {
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
  const content_key_bytes = derived_bytes.slice(0, CONTENT_KEY_BYTES);
  const auth_verifier = derived_bytes.slice(
    CONTENT_KEY_BYTES,
    CONTENT_KEY_BYTES + AUTH_VERIFIER_BYTES,
  );

  const content_key = await crypto.subtle.importKey(
    "raw",
    content_key_bytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  zero_uint8_array(content_key_bytes);
  zero_uint8_array(derived_bytes);

  return { content_key, auth_verifier };
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

  const material = await derive_material(password_bytes, salt);

  zero_uint8_array(password_bytes);

  try {
    const encrypted_subject = await encrypt_field(
      material.content_key,
      encoder.encode(plaintext.subject),
    );
    const encrypted_body = await encrypt_field(
      material.content_key,
      encoder.encode(plaintext.body),
    );

    const encrypted_attachments: EncryptedSecureAttachment[] = [];

    for (const attachment of attachments) {
      const data_field = await encrypt_field(
        material.content_key,
        attachment.data,
      );
      const filename_field = await encrypt_field(
        material.content_key,
        encoder.encode(attachment.filename),
      );

      encrypted_attachments.push({
        ciphertext: data_field.ciphertext,
        nonce: data_field.nonce,
        encrypted_filename: filename_field.ciphertext,
        filename_nonce: filename_field.nonce,
        content_type: attachment.content_type,
        size_bytes: attachment.data.byteLength,
      });
    }

    const auth_proof = await compute_auth_proof(material.auth_verifier);

    zero_uint8_array(material.auth_verifier);

    return {
      kdf_salt: array_to_base64(salt),
      auth_proof,
      encrypted_subject,
      encrypted_body,
      encrypted_attachments,
    };
  } finally {
    zero_uint8_array(material.auth_verifier);
  }
}

export async function derive_auth_proof(
  password: string,
  kdf_salt: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const password_bytes = encoder.encode(password);
  const salt = base64_to_array(kdf_salt);

  const material = await derive_material(password_bytes, salt);

  zero_uint8_array(password_bytes);

  const proof = await compute_auth_proof(material.auth_verifier);

  zero_uint8_array(material.auth_verifier);

  return proof;
}

export interface SecureMessageBundle {
  encrypted_subject: EncryptedField;
  encrypted_body: EncryptedField;
  encrypted_attachments: EncryptedSecureAttachment[];
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

  const material = await derive_material(password_bytes, salt);

  zero_uint8_array(password_bytes);
  zero_uint8_array(material.auth_verifier);

  const subject_bytes = await decrypt_field(
    material.content_key,
    bundle.encrypted_subject,
  );
  const body_bytes = await decrypt_field(
    material.content_key,
    bundle.encrypted_body,
  );

  const attachments: DecryptedSecureAttachment[] = [];

  for (const attachment of bundle.encrypted_attachments) {
    const data = await decrypt_field(material.content_key, {
      ciphertext: attachment.ciphertext,
      nonce: attachment.nonce,
    });
    const filename_bytes = await decrypt_field(material.content_key, {
      ciphertext: attachment.encrypted_filename,
      nonce: attachment.filename_nonce,
    });

    attachments.push({
      filename: decoder.decode(filename_bytes),
      content_type: attachment.content_type,
      size_bytes: attachment.size_bytes,
      data,
    });
  }

  return {
    subject: decoder.decode(subject_bytes),
    body: decoder.decode(body_bytes),
    attachments,
  };
}
