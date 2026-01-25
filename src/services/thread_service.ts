import type { DecryptedThreadMessage, ThreadContext } from "@/types/thread";
import type { MailItem, ThreadWithMessages } from "@/services/api/mail";

import {
  get_thread_messages,
  create_thread,
  link_mail_to_thread,
} from "./api/mail";
import { get_passphrase_bytes } from "./crypto/memory_key_store";
import {
  decrypt_envelope_with_bytes,
  array_to_base64,
  base64_to_array,
} from "./crypto/envelope";
import { zero_uint8_array } from "./crypto/secure_memory";

interface DecryptedEnvelope {
  subject: string;
  body_text: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  sent_at: string;
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
      const json = new TextDecoder().decode(encrypted_bytes);

      return JSON.parse(json) as DecryptedEnvelope;
    } catch {
      return null;
    }
  }

  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) return null;

  try {
    const result = await decrypt_envelope_with_bytes<DecryptedEnvelope>(
      encrypted_envelope,
      passphrase_bytes,
    );

    zero_uint8_array(passphrase_bytes);

    return result;
  } catch {
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
  const hash = await crypto.subtle.digest("SHA-256", material);

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
    const envelope = await decrypt_message_envelope(
      msg.encrypted_envelope,
      msg.envelope_nonce,
    );

    if (!envelope) {
      return {
        id: msg.id,
        item_type: msg.item_type as "received" | "sent" | "draft",
        sender_name: "Unknown",
        sender_email: "",
        subject: "(Could not decrypt)",
        body: "",
        timestamp: msg.created_at,
        is_read: msg.is_read,
        is_starred: msg.is_starred ?? false,
        is_deleted: false,
        encrypted_metadata: msg.encrypted_metadata,
        metadata_nonce: msg.metadata_nonce,
      };
    }

    return {
      id: msg.id,
      item_type: msg.item_type as "received" | "sent" | "draft",
      sender_name: envelope.from.name || envelope.from.email.split("@")[0],
      sender_email: envelope.from.email,
      subject: envelope.subject,
      body: envelope.body_text,
      timestamp: envelope.sent_at || msg.created_at,
      is_read: msg.is_read,
      is_starred: msg.is_starred ?? false,
      is_deleted: false,
      encrypted_metadata: msg.encrypted_metadata,
      metadata_nonce: msg.metadata_nonce,
    };
  });

  const results = await Promise.all(decrypt_promises);

  decrypted_messages.push(...results);

  decrypted_messages.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return { messages: decrypted_messages, thread_data };
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
  const hash = await crypto.subtle.digest("SHA-256", material);
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
        hash: "SHA-256",
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
