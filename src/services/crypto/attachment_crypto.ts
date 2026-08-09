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
  get_attachment_key,
  get_attachment_entry,
  type InboundAttachmentEntry,
} from "@/services/crypto/inbound_attachment_keys";
import { sanitize_download_filename } from "@/lib/attachment_utils";

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
import {
  encrypt_message_multi,
  decrypt_message_with_any_key,
} from "./key_manager";
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
  is_inline?: boolean;
}

export interface AttachmentMeta {
  filename: string;
  content_type: string;
  session_key: string;
  content_id?: string;
  is_inline?: boolean;
  size_bytes?: number;
}

export interface ResolvedAttachmentMeta {
  filename: string | null;
  content_type: string | null;
  session_key: string;
  content_id?: string;
  is_inline?: boolean;
  size_bytes: number;
  is_placeholder: boolean;
}

export interface ResolveAttachmentMetaInput {
  encrypted_meta: string;
  meta_nonce?: string;
  mail_item_id?: string;
  seq_num?: number;
  size_bytes?: number;
}

export const DEFAULT_ATTACHMENT_CONTENT_TYPE = "application/octet-stream";

const AEAD_BINDING_WRITE_ENABLED = false;

function attachment_data_aad(seq: number): Uint8Array {
  return new TextEncoder().encode(`aster-attachment-v2|att=${seq}|part=data`);
}

function write_aad(aad: Uint8Array): Uint8Array {
  return AEAD_BINDING_WRITE_ENABLED ? aad : new Uint8Array(0);
}

async function encrypt_data_with_session_key(
  data: ArrayBuffer,
  session_key: CryptoKey,
  seq: number,
): Promise<{ encrypted: ArrayBuffer; nonce: Uint8Array }> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: write_aad(attachment_data_aad(seq)),
    },
    session_key,
    data,
  );

  return { encrypted, nonce };
}

export async function encrypt_attachments_for_send(
  attachments: Attachment[],
  recipient_public_keys?: string[],
  require_recipient_encryption = false,
): Promise<EncryptedAttachmentForSend[]> {
  const has_recipient_keys = !!(
    recipient_public_keys && recipient_public_keys.length > 0
  );

  if (require_recipient_encryption && !has_recipient_keys) {
    throw new Error(
      "recipient encryption keys unavailable for encrypted attachment",
    );
  }

  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) {
    throw new Error("Passphrase not available");
  }

  const results: EncryptedAttachmentForSend[] = [];

  try {
    let seq = 0;

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
        seq,
      );

      const meta: AttachmentMeta = {
        filename: attachment.name,
        content_type: attachment.mime_type,
        session_key: array_to_base64(raw_key),
        content_id: attachment.content_id,
        is_inline: attachment.is_inline,
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

      seq += 1;
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
    is_inline: att.is_inline,
  }));
}

export function is_sealed_meta_nonce(meta_nonce?: string): boolean {
  if (!meta_nonce) return false;

  let nonce: Uint8Array;

  try {
    nonce = base64_to_array(meta_nonce);
  } catch {
    return false;
  }

  return nonce.length > 0 && nonce.some((byte) => byte !== 0);
}

async function decrypt_sealed_attachment_meta(
  encrypted_meta: string,
  meta_nonce: string,
  session_key_b64: string,
): Promise<AttachmentMeta> {
  const key_bytes = base64_to_array(session_key_b64);
  const nonce = base64_to_array(meta_nonce);
  const ciphertext = base64_to_array(encrypted_meta);

  const session_key = await crypto.subtle.importKey(
    "raw",
    key_bytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  zero_uint8_array(key_bytes);

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: new Uint8Array(0),
    },
    session_key,
    ciphertext,
  );

  const parsed = JSON.parse(new TextDecoder().decode(plaintext));

  if (!parsed || typeof parsed.filename !== "string") {
    throw new Error("sealed attachment metadata is malformed");
  }

  return {
    filename: parsed.filename,
    content_type:
      typeof parsed.content_type === "string" && parsed.content_type.length > 0
        ? parsed.content_type
        : DEFAULT_ATTACHMENT_CONTENT_TYPE,
    session_key: session_key_b64,
    content_id:
      typeof parsed.content_id === "string" ? parsed.content_id : undefined,
  };
}

async function read_row_attachment_meta(
  encrypted_meta: string,
  meta_nonce: string | undefined,
  entry: InboundAttachmentEntry | null,
): Promise<AttachmentMeta | null> {
  if (!encrypted_meta) return null;

  if (is_sealed_meta_nonce(meta_nonce) && entry?.key) {
    try {
      return await decrypt_sealed_attachment_meta(
        encrypted_meta,
        meta_nonce as string,
        entry.key,
      );
    } catch {
      return null;
    }
  }

  try {
    return await decrypt_client_authored_meta(encrypted_meta);
  } catch {
    return null;
  }
}

export async function resolve_attachment_meta(
  input: ResolveAttachmentMetaInput,
): Promise<ResolvedAttachmentMeta> {
  const entry =
    input.mail_item_id !== undefined && input.seq_num !== undefined
      ? get_attachment_entry(input.mail_item_id, input.seq_num)
      : null;

  const row_meta = await read_row_attachment_meta(
    input.encrypted_meta,
    input.meta_nonce,
    entry,
  );

  const filename = entry?.filename ?? row_meta?.filename ?? null;
  const resolved_content_type = entry?.content_type ?? row_meta?.content_type;
  const content_type =
    resolved_content_type && resolved_content_type.length > 0
      ? resolved_content_type
      : filename !== null
        ? DEFAULT_ATTACHMENT_CONTENT_TYPE
        : null;

  return {
    filename,
    content_type,
    session_key: row_meta?.session_key || entry?.key || "",
    content_id: entry?.content_id ?? row_meta?.content_id,
    is_inline: row_meta?.is_inline,
    size_bytes: entry?.size ?? row_meta?.size_bytes ?? input.size_bytes ?? 0,
    is_placeholder: filename === null,
  };
}

export async function decrypt_attachment_meta(
  encrypted_meta: string,
  meta_nonce?: string,
  mail_item_id?: string,
  seq_num?: number,
): Promise<AttachmentMeta> {
  const resolved = await resolve_attachment_meta({
    encrypted_meta,
    meta_nonce,
    mail_item_id,
    seq_num,
  });

  if (resolved.filename === null || resolved.content_type === null) {
    throw new Error("attachment metadata unavailable");
  }

  return {
    filename: resolved.filename,
    content_type: resolved.content_type,
    session_key: resolved.session_key,
    content_id: resolved.content_id,
    is_inline: resolved.is_inline,
    size_bytes: resolved.size_bytes,
  };
}

async function decrypt_client_authored_meta(
  encrypted_meta: string,
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
      const decrypted = await decrypt_message_with_any_key(
        meta_text,
        [vault.identity_key, ...(vault.previous_keys ?? [])],
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

const UNENCRYPTED_NONCE_LENGTH = 12;

function is_unencrypted_stored_attachment(data_nonce_b64: string): boolean {
  if (!data_nonce_b64) return false;

  let nonce: Uint8Array;

  try {
    nonce = base64_to_array(data_nonce_b64);
  } catch {
    return false;
  }

  return (
    nonce.length === UNENCRYPTED_NONCE_LENGTH && nonce.every((b) => b === 0)
  );
}

export async function decrypt_attachment_data(
  encrypted_data_b64: string,
  data_nonce_b64: string,
  session_key_b64: string,
  mail_item_id?: string,
  seq_num?: number,
): Promise<ArrayBuffer> {
  const resolved_key =
    session_key_b64 && session_key_b64.length > 0
      ? session_key_b64
      : mail_item_id !== undefined && seq_num !== undefined
        ? get_attachment_key(mail_item_id, seq_num)
        : "";

  if (!resolved_key || resolved_key.length === 0) {
    if (is_unencrypted_stored_attachment(data_nonce_b64)) {
      const bytes = base64_to_array(encrypted_data_b64);

      if (bytes.byteLength === 0) {
        throw new Error(
          "attachment payload is empty; storage fetch failed upstream",
        );
      }

      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
    }

    throw new Error(
      "attachment decryption key unavailable; refusing to return ciphertext",
    );
  }

  const key_bytes = base64_to_array(resolved_key);

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

  if (seq_num !== undefined) {
    try {
      return await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: nonce,
          additionalData: attachment_data_aad(seq_num),
        },
        session_key,
        encrypted_data,
      );
    } catch {
      /* legacy ciphertext authored without aad, fall through */
    }
  }

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
  link.download = sanitize_download_filename(filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
