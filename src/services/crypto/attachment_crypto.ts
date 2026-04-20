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
import type { Attachment } from "@/components/compose/compose_shared";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";

import {
  encrypt_envelope_with_bytes,
  array_to_base64,
  base64_to_array,
  NONCE_LENGTH,
} from "./envelope";
import { decrypt_envelope_with_bytes } from "./envelope";
import {
  get_passphrase_bytes,
  get_vault_from_memory,
} from "./memory_key_store";
import { encrypt_message_multi, decrypt_message } from "./key_manager";
import { zero_uint8_array } from "./secure_memory";

export interface EncryptedAttachmentForSend {
  encrypted_data: string;
  data_nonce: string;
  sender_encrypted_meta: string;
  sender_meta_nonce: string;
  recipient_encrypted_meta?: string;
  size_bytes: number;
}

export interface ExternalAttachmentForSend {
  data: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  content_id?: string;
}

export interface AttachmentMeta {
  filename: string;
  content_type: string;
  session_key: string;
  content_id?: string;
}

async function encrypt_data_with_session_key(
  data: ArrayBuffer,
  session_key: CryptoKey,
): Promise<{ encrypted: ArrayBuffer; nonce: Uint8Array }> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    session_key,
    data,
  );

  return { encrypted, nonce };
}

export async function encrypt_attachments_for_send(
  attachments: Attachment[],
  recipient_public_keys?: string[],
): Promise<EncryptedAttachmentForSend[]> {
  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) {
    throw new Error("Passphrase not available");
  }

  const results: EncryptedAttachmentForSend[] = [];

  try {
    for (const attachment of attachments) {
      const raw_key = crypto.getRandomValues(new Uint8Array(32));

      const session_key = await crypto.subtle.importKey(
        "raw",
        raw_key,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"],
      );

      const { encrypted, nonce } = await encrypt_data_with_session_key(
        attachment.data,
        session_key,
      );

      const meta: AttachmentMeta = {
        filename: attachment.name,
        content_type: attachment.mime_type,
        session_key: array_to_base64(raw_key),
        content_id: attachment.content_id,
      };

      zero_uint8_array(raw_key);

      const sender_meta = await encrypt_envelope_with_bytes(
        meta,
        passphrase_bytes,
      );

      const meta_nonce_placeholder = crypto.getRandomValues(
        new Uint8Array(NONCE_LENGTH),
      );

      let recipient_encrypted_meta: string | undefined;

      if (recipient_public_keys && recipient_public_keys.length > 0) {
        const meta_json = JSON.stringify(meta);
        const pgp_encrypted = await encrypt_message_multi(
          meta_json,
          recipient_public_keys,
        );

        recipient_encrypted_meta = array_to_base64(
          new TextEncoder().encode(pgp_encrypted),
        );
      } else {
        recipient_encrypted_meta = array_to_base64(
          new TextEncoder().encode(JSON.stringify(meta)),
        );
      }

      results.push({
        encrypted_data: array_to_base64(new Uint8Array(encrypted)),
        data_nonce: array_to_base64(nonce),
        sender_encrypted_meta: sender_meta.encrypted,
        sender_meta_nonce: array_to_base64(meta_nonce_placeholder),
        recipient_encrypted_meta,
        size_bytes: attachment.size_bytes,
      });
    }

    return results;
  } finally {
    zero_uint8_array(passphrase_bytes);
  }
}

export function prepare_external_attachments(
  attachments: Attachment[],
): ExternalAttachmentForSend[] {
  return attachments.map((att) => ({
    data: array_to_base64(new Uint8Array(att.data)),
    filename: att.name,
    content_type: att.mime_type,
    size_bytes: att.size_bytes,
    content_id: att.content_id,
  }));
}

export async function decrypt_attachment_meta(
  encrypted_meta: string,
  _meta_nonce?: string,
): Promise<AttachmentMeta> {
  const meta_bytes = base64_to_array(encrypted_meta);
  const meta_text = new TextDecoder().decode(meta_bytes);

  try {
    const parsed = JSON.parse(meta_text);

    if (
      parsed &&
      typeof parsed.filename === "string" &&
      typeof parsed.content_type === "string" &&
      typeof parsed.session_key === "string"
    ) {
      return parsed as AttachmentMeta;
    }
  } catch {
    /* not plaintext JSON, continue with decryption */
  }

  if (meta_text.startsWith("-----BEGIN PGP MESSAGE-----")) {
    const vault = get_vault_from_memory();
    const passphrase_bytes = get_passphrase_bytes();

    if (!vault?.identity_key || !passphrase_bytes) {
      throw new Error("Vault not available for decryption");
    }

    try {
      const passphrase_string = new TextDecoder().decode(passphrase_bytes);
      const decrypted = await decrypt_message(
        meta_text,
        vault.identity_key,
        passphrase_string,
      );

      return JSON.parse(decrypted) as AttachmentMeta;
    } finally {
      passphrase_bytes.fill(0);
    }
  }

  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) {
    throw new Error("Passphrase not available");
  }

  try {
    const result = await decrypt_envelope_with_bytes(
      encrypted_meta,
      passphrase_bytes,
    );

    return result as AttachmentMeta;
  } finally {
    zero_uint8_array(passphrase_bytes);
  }
}

export async function decrypt_attachment_data(
  encrypted_data_b64: string,
  data_nonce_b64: string,
  session_key_b64: string,
): Promise<ArrayBuffer> {
  if (!session_key_b64 || session_key_b64.length === 0) {
    return base64_to_array(encrypted_data_b64).buffer;
  }

  const key_bytes = base64_to_array(session_key_b64);

  if (key_bytes.length === 0) {
    return base64_to_array(encrypted_data_b64).buffer;
  }

  const encrypted_data = base64_to_array(encrypted_data_b64);
  const nonce = base64_to_array(data_nonce_b64);

  const session_key = await crypto.subtle.importKey(
    "raw",
    key_bytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  zero_uint8_array(key_bytes);

  return decrypt_aes_gcm_with_fallback(session_key, encrypted_data, nonce);
}

export function download_decrypted_attachment(
  data: ArrayBuffer,
  filename: string,
  content_type: string,
): void {
  const blob = new Blob([data], { type: content_type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
