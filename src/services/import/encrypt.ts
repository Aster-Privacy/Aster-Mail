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
import type { EncryptedVault } from "@/services/crypto/key_manager";
import type { ParsedEmail } from "./parser";

const HASH_ALG = ["SHA", "256"].join("-");
const IMPORT_KEY_VERSION = "astermail-import-v1";
const NONCE_LENGTH = 12;

function uint8_array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function secure_clear_array(array: Uint8Array): void {
  const max = 65536;

  for (let i = 0; i < array.length; i += max) {
    crypto.getRandomValues(array.subarray(i, Math.min(i + max, array.length)));
  }
  array.fill(0);
}

async function derive_import_encryption_key(
  vault: EncryptedVault,
): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(
    vault.identity_key + IMPORT_KEY_VERSION,
  );

  let hash_buffer: ArrayBuffer;

  try {
    hash_buffer = await crypto.subtle.digest(HASH_ALG, key_material);
  } finally {
    secure_clear_array(key_material);
  }

  return crypto.subtle.importKey(
    "raw",
    hash_buffer,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
}

export interface ImportEnvelope {
  message_id: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  date: string;
  html_body: string | null;
  text_body: string | null;
  attachment_count: number;
  source: string;
  imported_at: string;
}

export interface EncryptedImportEmail {
  message_id_hash: string;
  encrypted_envelope: string;
  envelope_nonce: string;
  received_at: string;
  thread_token?: string;
}

export async function encrypt_imported_email(
  email: ParsedEmail,
  vault: EncryptedVault,
  source: string,
  message_id_hash: string,
): Promise<EncryptedImportEmail> {
  const envelope: ImportEnvelope = {
    message_id: email.message_id,
    from: email.from,
    to: email.to,
    cc: email.cc,
    subject: email.subject,
    date: email.date.toISOString(),
    html_body: email.html_body,
    text_body: email.text_body,
    attachment_count: email.attachments.length,
    source,
    imported_at: new Date().toISOString(),
  };

  const key = await derive_import_encryption_key(vault);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(envelope));

  let ciphertext: ArrayBuffer;

  try {
    ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      plaintext,
    );
  } finally {
    secure_clear_array(plaintext);
  }

  return {
    message_id_hash,
    encrypted_envelope: uint8_array_to_base64(new Uint8Array(ciphertext)),
    envelope_nonce: uint8_array_to_base64(nonce),
    received_at: email.date.toISOString(),
  };
}

export interface ImportBatchResult {
  encrypted_emails: EncryptedImportEmail[];
  failed_count: number;
}

export async function encrypt_import_batch(
  emails: ParsedEmail[],
  vault: EncryptedVault,
  source: string,
  message_id_hashes: Map<string, string>,
): Promise<ImportBatchResult> {
  const encrypted_emails: EncryptedImportEmail[] = [];
  let failed_count = 0;

  for (const email of emails) {
    const hash = message_id_hashes.get(email.message_id);

    if (!hash) {
      failed_count++;
      continue;
    }

    try {
      const encrypted = await encrypt_imported_email(
        email,
        vault,
        source,
        hash,
      );

      encrypted_emails.push(encrypted);
    } catch {
      failed_count++;
    }
  }

  return { encrypted_emails, failed_count };
}
