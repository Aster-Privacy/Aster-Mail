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
import type { DecryptedThreadMessage, ThreadContext } from "@/types/thread";
import type { MailItem, ThreadWithMessages } from "@/services/api/mail";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import { en } from "@/lib/i18n/translations/en";

import {
  get_thread_messages,
  create_thread,
  link_mail_to_thread,
  list_mail_items,
} from "./api/mail";
import {
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_from_memory,
} from "./crypto/memory_key_store";
import {
  decrypt_envelope_with_bytes,
  array_to_base64,
  base64_to_array,
  normalize_envelope_from,
} from "./crypto/envelope";
import {
  parse_ratchet_envelope,
  decrypt_ratchet_message,
} from "./crypto/ratchet_manager";
import { zero_uint8_array } from "./crypto/secure_memory";
import { decrypt_message } from "./crypto/key_manager";
import { decrypt_mail_metadata } from "./crypto/mail_metadata";

import { try_extract_mime_body } from "@/utils/email_crypto";

const HASH_ALG = ["SHA", "256"].join("-");
const ENVELOPE_KEY_VERSIONS = ["astermail-envelope-v1", "astermail-import-v1"];

interface DecryptedEnvelope {
  subject: string;
  body_text: string;
  body_html?: string;
  text_body?: string;
  html_body?: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  sent_at: string;
  raw_headers?: { name: string; value: string }[];
}

async function decrypt_message_envelope(
  encrypted_envelope: string,
  envelope_nonce: string,
): Promise<DecryptedEnvelope | null> {
  const nonce_bytes = envelope_nonce
    ? base64_to_array(envelope_nonce)
    : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted_envelope);
      const text = new TextDecoder().decode(encrypted_bytes);

      let parsed: DecryptedEnvelope;

      if (!text.startsWith("-----BEGIN PGP")) {
        parsed = JSON.parse(text) as DecryptedEnvelope;
      } else {
        const vault = get_vault_from_memory();
        const pass = get_passphrase_from_memory();

        if (!vault?.identity_key || !pass) return null;

        const decrypted = await decrypt_message(text, vault.identity_key, pass);

        parsed = JSON.parse(decrypted) as DecryptedEnvelope;
      }

      const from = normalize_envelope_from(parsed.from);

      if (from) parsed.from = from;

      return parsed;
    } catch {
      return null;
    }
  }

  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) return null;

  try {
    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<DecryptedEnvelope>(
        encrypted_envelope,
        passphrase_bytes,
      );

      zero_uint8_array(passphrase_bytes);

      if (result) {
        const from = normalize_envelope_from(result.from);

        if (from) result.from = from;
      }

      return result;
    }

    zero_uint8_array(passphrase_bytes);

    const vault = get_vault_from_memory();

    if (!vault?.identity_key) return null;

    const enc_bytes = base64_to_array(encrypted_envelope);

    const keys_to_try = [vault.identity_key, ...(vault.previous_keys ?? [])];

    for (const key_string of keys_to_try) {
      for (const version of ENVELOPE_KEY_VERSIONS) {
        try {
          const key_hash = await crypto.subtle.digest(
            HASH_ALG,
            new TextEncoder().encode(key_string + version),
          );
          const crypto_key = await crypto.subtle.importKey(
            "raw",
            key_hash,
            { name: "AES-GCM", length: 256 },
            false,
            ["decrypt"],
          );
          const decrypted = await decrypt_aes_gcm_with_fallback(crypto_key, enc_bytes, nonce_bytes);

          const parsed = JSON.parse(new TextDecoder().decode(decrypted));
          const from = normalize_envelope_from(parsed.from);

          if (from) parsed.from = from;

          return parsed;
        } catch {
          continue;
        }
      }
    }

    return null;
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    zero_uint8_array(passphrase_bytes);

    return null;
  }
}

export async function generate_thread_token(
  identity_key: string,
  original_email_id: string,
): Promise<string> {
  const material = new TextEncoder().encode(
    identity_key + "thread:" + original_email_id,
  );
  const hash = await crypto.subtle.digest(HASH_ALG, material);

  return array_to_base64(new Uint8Array(hash));
}

export function get_thread_context_from_email(
  email: MailItem,
): ThreadContext | null {
  if (!email.thread_token) return null;

  return {
    thread_token: email.thread_token,
    original_email_id: email.id,
  };
}

export async function fetch_and_decrypt_thread_messages(
  thread_token: string,
  our_email?: string,
): Promise<{
  messages: DecryptedThreadMessage[];
  thread_data: ThreadWithMessages | null;
}> {
  const response = await get_thread_messages(thread_token);

  if (response.error || !response.data) {
    return { messages: [], thread_data: null };
  }

  const thread_data = response.data;
  const decrypted_messages: DecryptedThreadMessage[] = [];

  const decrypt_promises = thread_data.messages.map(async (msg) => {
    const [envelope, decrypted_metadata] = await Promise.all([
      decrypt_message_envelope(msg.encrypted_envelope, msg.envelope_nonce),
      msg.encrypted_metadata && msg.metadata_nonce
        ? decrypt_mail_metadata(
            msg.encrypted_metadata,
            msg.metadata_nonce,
            msg.metadata_version,
          )
        : Promise.resolve(msg.metadata ?? null),
    ]);

    if (!envelope) {
      return {
        id: msg.id,
        item_type: msg.item_type as "received" | "sent" | "draft",
        sender_name: en.common.unknown_sender,
        sender_email: "",
        subject: "(Could not decrypt)",
        body: "",
        html_content: undefined,
        timestamp: msg.created_at,
        is_read: decrypted_metadata?.is_read ?? false,
        is_starred: decrypted_metadata?.is_starred ?? false,
        is_deleted: false,
        is_external: msg.is_external ?? false,
        send_status: msg.send_status ?? decrypted_metadata?.send_status,
        encrypted_metadata: msg.encrypted_metadata,
        metadata_nonce: msg.metadata_nonce,
      };
    }

    let resolved_html: string | undefined =
      envelope.body_html ?? envelope.html_body;

    if (resolved_html && /^content-type\s*:/im.test(resolved_html)) {
      resolved_html = try_extract_mime_body(resolved_html) || undefined;
    }
    const resolved_text = envelope.body_text ?? envelope.text_body ?? "";
    let body_content = resolved_html || resolved_text;
    let body_decrypted = false;

    if (our_email && body_content.startsWith("{")) {
      const ratchet_env = parse_ratchet_envelope(body_content);

      if (ratchet_env) {
        const vault = get_vault_from_memory();

        if (vault) {
          try {
            const decrypted = await decrypt_ratchet_message(
              our_email,
              envelope.from.email,
              ratchet_env,
              vault,
            );

            if (decrypted) {
              body_content = decrypted;
              body_decrypted = true;
            }
          } catch (error) {
            if (import.meta.env.DEV) console.error(error);
          }
        }
      }
    }

    if (body_content.includes("-----BEGIN PGP MESSAGE-----")) {
      const vault = get_vault_from_memory();
      const passphrase = get_passphrase_from_memory();

      if (vault?.identity_key && passphrase) {
        try {
          body_content = await decrypt_message(
            body_content,
            vault.identity_key,
            passphrase,
          );
          body_decrypted = true;
        } catch (error) {
          if (import.meta.env.DEV) console.error(error);
        }
      }
    }

    const pre_mime = body_content;

    body_content = try_extract_mime_body(body_content);
    const mime_extracted = body_content !== pre_mime;

    if (body_decrypted) {
      body_content = body_content.trim();
    }

    const content_is_html = /<[a-z][\s\S]*>/i.test(body_content);
    const html_had_pgp =
      resolved_html?.includes("-----BEGIN PGP MESSAGE-----") ?? false;
    const effective_html =
      (body_decrypted || mime_extracted) && content_is_html
        ? body_content
        : html_had_pgp && body_decrypted
          ? undefined
          : resolved_html;

    return {
      id: msg.id,
      item_type: msg.item_type as "received" | "sent" | "draft",
      sender_name: envelope.from.name || envelope.from.email.split("@")[0],
      sender_email: envelope.from.email,
      subject: envelope.subject,
      body: body_content,
      html_content: effective_html,
      timestamp: envelope.sent_at || msg.created_at,
      is_read: decrypted_metadata?.is_read ?? false,
      is_starred: decrypted_metadata?.is_starred ?? false,
      is_deleted: false,
      is_external: msg.is_external ?? false,
      send_status: msg.send_status ?? decrypted_metadata?.send_status,
      encrypted_metadata: msg.encrypted_metadata,
      metadata_nonce: msg.metadata_nonce,
      to_recipients: envelope.to || [],
      cc_recipients: envelope.cc || [],
      raw_headers: envelope.raw_headers,
    };
  });

  const results = await Promise.all(decrypt_promises);

  decrypted_messages.push(...results);

  decrypted_messages.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return { messages: decrypted_messages, thread_data };
}

export async function fetch_and_decrypt_virtual_group(
  ids: string[],
  our_email?: string,
): Promise<DecryptedThreadMessage[]> {
  const response = await list_mail_items({ ids });

  if (response.error || !response.data) {
    return [];
  }

  const visible_items = response.data.items.filter((item) => !item.is_spam);

  const decrypt_promises = visible_items.map(async (item) => {
    const [envelope, decrypted_metadata] = await Promise.all([
      decrypt_message_envelope(item.encrypted_envelope, item.envelope_nonce),
      item.encrypted_metadata && item.metadata_nonce
        ? decrypt_mail_metadata(
            item.encrypted_metadata,
            item.metadata_nonce,
            item.metadata_version,
          )
        : Promise.resolve(item.metadata ?? null),
    ]);

    if (!envelope) {
      return {
        id: item.id,
        item_type: item.item_type as "received" | "sent" | "draft",
        sender_name: en.common.unknown_sender,
        sender_email: "",
        subject: "(Could not decrypt)",
        body: "",
        html_content: undefined,
        timestamp: item.created_at,
        is_read: decrypted_metadata?.is_read ?? false,
        is_starred: decrypted_metadata?.is_starred ?? false,
        is_deleted: false,
        is_external: item.is_external ?? false,
        send_status: item.send_status ?? decrypted_metadata?.send_status,
        encrypted_metadata: item.encrypted_metadata,
        metadata_nonce: item.metadata_nonce,
      };
    }

    let resolved_html: string | undefined =
      envelope.body_html ?? envelope.html_body;

    if (resolved_html && /^content-type\s*:/im.test(resolved_html)) {
      resolved_html = try_extract_mime_body(resolved_html) || undefined;
    }
    const resolved_text = envelope.body_text ?? envelope.text_body ?? "";
    let body_content = resolved_html || resolved_text;
    let body_decrypted = false;

    if (our_email && body_content.startsWith("{")) {
      const ratchet_env = parse_ratchet_envelope(body_content);

      if (ratchet_env) {
        const vault = get_vault_from_memory();

        if (vault) {
          try {
            const decrypted = await decrypt_ratchet_message(
              our_email,
              envelope.from.email,
              ratchet_env,
              vault,
            );

            if (decrypted) {
              body_content = decrypted;
              body_decrypted = true;
            }
          } catch (error) {
            if (import.meta.env.DEV) console.error(error);
          }
        }
      }
    }

    if (body_content.includes("-----BEGIN PGP MESSAGE-----")) {
      const vault = get_vault_from_memory();
      const passphrase = get_passphrase_from_memory();

      if (vault?.identity_key && passphrase) {
        try {
          body_content = await decrypt_message(
            body_content,
            vault.identity_key,
            passphrase,
          );
          body_decrypted = true;
        } catch (error) {
          if (import.meta.env.DEV) console.error(error);
        }
      }
    }

    const pre_mime = body_content;

    body_content = try_extract_mime_body(body_content);
    const mime_extracted = body_content !== pre_mime;

    if (body_decrypted) {
      body_content = body_content.trim();
    }

    const content_is_html = /<[a-z][\s\S]*>/i.test(body_content);
    const html_had_pgp =
      resolved_html?.includes("-----BEGIN PGP MESSAGE-----") ?? false;
    const effective_html =
      (body_decrypted || mime_extracted) && content_is_html
        ? body_content
        : html_had_pgp && body_decrypted
          ? undefined
          : resolved_html;

    return {
      id: item.id,
      item_type: item.item_type as "received" | "sent" | "draft",
      sender_name: envelope.from.name || envelope.from.email.split("@")[0],
      sender_email: envelope.from.email,
      subject: envelope.subject,
      body: body_content,
      html_content: effective_html,
      timestamp: envelope.sent_at || item.message_ts || item.created_at,
      is_read: decrypted_metadata?.is_read ?? false,
      is_starred: decrypted_metadata?.is_starred ?? false,
      is_deleted: false,
      is_external: item.is_external ?? false,
      send_status: item.send_status ?? decrypted_metadata?.send_status,
      encrypted_metadata: item.encrypted_metadata,
      metadata_nonce: item.metadata_nonce,
      to_recipients: envelope.to || [],
      cc_recipients: envelope.cc || [],
      raw_headers: envelope.raw_headers,
    };
  });

  const results = await Promise.all(decrypt_promises);

  results.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return results;
}

export function get_thread_message_count(
  messages: DecryptedThreadMessage[],
): number {
  return messages.filter((m) => !m.is_deleted).length;
}

export function get_latest_expanded_id(
  messages: DecryptedThreadMessage[],
): string | null {
  const visible_messages = messages.filter((m) => !m.is_deleted);

  if (visible_messages.length === 0) return null;

  return visible_messages[visible_messages.length - 1].id;
}

export async function get_or_create_thread_token(
  original_email_id: string,
  existing_thread_token?: string,
): Promise<string | null> {
  if (existing_thread_token) {
    return existing_thread_token;
  }

  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) return null;

  const material = new TextEncoder().encode(
    "astermail-thread:" + original_email_id,
  );
  const hash = await crypto.subtle.digest(HASH_ALG, material);
  const thread_token = array_to_base64(new Uint8Array(hash));

  const encrypted_meta = await encrypt_thread_meta({
    created_from: original_email_id,
    created_at: new Date().toISOString(),
  });

  if (!encrypted_meta) return null;

  const create_result = await create_thread({
    thread_token,
    encrypted_meta: encrypted_meta.encrypted,
    meta_nonce: encrypted_meta.nonce,
  });

  if (create_result.error && !create_result.error.includes("already exists")) {
    return null;
  }

  const link_result = await link_mail_to_thread(
    original_email_id,
    thread_token,
  );

  if (link_result.error) {
    zero_uint8_array(passphrase_bytes);

    return null;
  }

  zero_uint8_array(passphrase_bytes);

  return thread_token;
}

async function encrypt_thread_meta(
  meta: Record<string, unknown>,
): Promise<{ encrypted: string; nonce: string } | null> {
  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) return null;

  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const nonce = crypto.getRandomValues(new Uint8Array(12));

    const key_material = await crypto.subtle.importKey(
      "raw",
      passphrase_bytes,
      "PBKDF2",
      false,
      ["deriveKey"],
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: HASH_ALG,
      },
      key_material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );

    const plaintext = new TextEncoder().encode(JSON.stringify(meta));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      plaintext,
    );

    const combined = new Uint8Array(
      salt.length + nonce.length + ciphertext.byteLength,
    );

    combined.set(salt, 0);
    combined.set(nonce, salt.length);
    combined.set(new Uint8Array(ciphertext), salt.length + nonce.length);

    zero_uint8_array(passphrase_bytes);

    return {
      encrypted: array_to_base64(combined),
      nonce: array_to_base64(new Uint8Array([1])),
    };
  } catch {
    return null;
  }
}
