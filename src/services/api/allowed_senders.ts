import { api_client, type ApiResponse } from "./client";

import {
  get_or_create_derived_encryption_crypto_key,
  get_derived_encryption_key,
} from "@/services/crypto/memory_key_store";
import { get_key, store_key } from "@/services/crypto/crypto_key_cache";

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function base64_to_array(base64: string): Uint8Array {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  } catch {
    throw new Error("Invalid base64 data");
  }
}

function normalize_email(email: string): string {
  return email.toLowerCase().trim();
}

const ALLOWED_SENDERS_HMAC_KEY_ID = "allowed_senders_hmac_key";

async function get_hmac_key(): Promise<CryptoKey> {
  const cached = get_key(ALLOWED_SENDERS_HMAC_KEY_ID);

  if (cached) {
    return cached;
  }

  const raw_key = get_derived_encryption_key();

  if (!raw_key) {
    throw new Error("No encryption key available");
  }

  const encoder = new TextEncoder();
  const info = encoder.encode("allowed-senders-hmac-v1");
  const combined = new Uint8Array(raw_key.byteLength + info.length);

  combined.set(raw_key, 0);
  combined.set(info, raw_key.byteLength);

  const hash = await crypto.subtle.digest("SHA-256", combined);

  const hmac_key = await crypto.subtle.importKey(
    "raw",
    hash,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  store_key(ALLOWED_SENDERS_HMAC_KEY_ID, hmac_key, "hmac");

  return hmac_key;
}

async function get_allowed_senders_encryption_key(): Promise<CryptoKey> {
  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) {
    throw new Error("No encryption key available");
  }

  return key;
}

export async function generate_sender_token(
  email: string,
  is_domain: boolean = false,
): Promise<string> {
  const hmac_key = await get_hmac_key();
  const normalized = is_domain
    ? email.toLowerCase().trim()
    : normalize_email(email);
  const prefix = is_domain ? "domain:" : "email:";
  const encoder = new TextEncoder();
  const data = encoder.encode(prefix + normalized);
  const hash = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(hash));
}

async function generate_integrity_hash(
  encrypted_data: string,
  nonce: string,
): Promise<string> {
  const hmac_key = await get_hmac_key();
  const encoder = new TextEncoder();
  const combined = `${encrypted_data}:${nonce}:allowed-senders-v1`;
  const data = encoder.encode(combined);
  const hash = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(hash));
}

async function verify_integrity_hash(
  encrypted_data: string,
  nonce: string,
  hash: string,
): Promise<boolean> {
  const hmac_key = await get_hmac_key();
  const encoder = new TextEncoder();
  const combined = `${encrypted_data}:${nonce}:allowed-senders-v1`;
  const data = encoder.encode(combined);
  const expected_hash = base64_to_array(hash);

  return crypto.subtle.verify("HMAC", hmac_key, expected_hash, data);
}

export interface AllowedSenderData {
  email: string;
  name?: string;
  allowed_at: string;
  is_domain: boolean;
}

export async function encrypt_allow_data(data: AllowedSenderData): Promise<{
  encrypted_sender_data: string;
  sender_data_nonce: string;
  integrity_hash: string;
}> {
  const key = await get_allowed_senders_encryption_key();
  const encoder = new TextEncoder();
  const payload = {
    ...data,
    _encrypted_at: new Date().toISOString(),
  };
  const plaintext = encoder.encode(JSON.stringify(payload));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    plaintext,
  );

  const encrypted_sender_data = array_to_base64(new Uint8Array(ciphertext));
  const sender_data_nonce = array_to_base64(nonce);
  const integrity_hash = await generate_integrity_hash(
    encrypted_sender_data,
    sender_data_nonce,
  );

  return { encrypted_sender_data, sender_data_nonce, integrity_hash };
}

export async function decrypt_allow_data(
  encrypted_sender_data: string,
  sender_data_nonce: string,
  integrity_hash: string,
): Promise<AllowedSenderData> {
  if (!integrity_hash) {
    throw new Error("Integrity hash is required");
  }

  const is_valid = await verify_integrity_hash(
    encrypted_sender_data,
    sender_data_nonce,
    integrity_hash,
  );

  if (!is_valid) {
    throw new Error("Allowed sender data integrity check failed");
  }

  const key = await get_allowed_senders_encryption_key();
  const ciphertext = base64_to_array(encrypted_sender_data);
  const nonce = base64_to_array(sender_data_nonce);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    ciphertext,
  );
  const decoder = new TextDecoder();
  const parsed = JSON.parse(decoder.decode(decrypted));

  return {
    email: parsed.email,
    name: parsed.name,
    allowed_at: parsed.allowed_at,
    is_domain: parsed.is_domain ?? false,
  };
}

export interface AllowedSenderResponse {
  id: string;
  sender_token: string;
  encrypted_sender_data: string;
  sender_data_nonce: string;
  integrity_hash: string;
  is_domain: boolean;
  created_at: string;
}

export interface DecryptedAllowedSender {
  id: string;
  sender_token: string;
  email: string;
  name?: string;
  allowed_at: string;
  is_domain: boolean;
  created_at: string;
}

export async function list_allowed_senders(
  limit: number = 500,
  offset: number = 0,
): Promise<ApiResponse<DecryptedAllowedSender[]>> {
  try {
    const response = await api_client.get<{
      allowed_senders: AllowedSenderResponse[];
      total: number;
    }>(`/contacts/v1/allowed_senders?limit=${limit}&offset=${offset}`);

    if (response.error) {
      return { error: response.error };
    }

    if (!response.data) {
      return { data: [] };
    }

    const decrypted = await Promise.all(
      response.data.allowed_senders.map(async (item) => {
        const data = await decrypt_allow_data(
          item.encrypted_sender_data,
          item.sender_data_nonce,
          item.integrity_hash,
        );

        return {
          id: item.id,
          sender_token: item.sender_token,
          email: data.email,
          name: data.name,
          allowed_at: data.allowed_at,
          is_domain: item.is_domain,
          created_at: item.created_at,
        };
      }),
    );

    return { data: decrypted };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to list allowed senders",
    };
  }
}

export async function allow_sender(
  email: string,
  name?: string,
  is_domain: boolean = false,
): Promise<ApiResponse<DecryptedAllowedSender>> {
  try {
    const sender_token = await generate_sender_token(email, is_domain);
    const allow_data: AllowedSenderData = {
      email: is_domain ? email.toLowerCase().trim() : normalize_email(email),
      name,
      allowed_at: new Date().toISOString(),
      is_domain,
    };
    const { encrypted_sender_data, sender_data_nonce, integrity_hash } =
      await encrypt_allow_data(allow_data);

    const response = await api_client.post<AllowedSenderResponse>(
      "/contacts/v1/allowed_senders",
      {
        sender_token,
        encrypted_sender_data,
        sender_data_nonce,
        integrity_hash,
        is_domain,
      },
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to allow sender" };
    }

    return {
      data: {
        id: response.data.id,
        sender_token: response.data.sender_token,
        email: allow_data.email,
        name: allow_data.name,
        allowed_at: allow_data.allowed_at,
        is_domain: response.data.is_domain,
        created_at: response.data.created_at,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to allow sender",
    };
  }
}

export async function remove_allowed_sender(
  email: string,
  is_domain: boolean = false,
): Promise<ApiResponse<{ success: boolean }>> {
  try {
    const sender_token = await generate_sender_token(email, is_domain);
    const response = await api_client.delete<{ success: boolean }>(
      `/contacts/v1/allowed_senders?sender_token=${encodeURIComponent(sender_token)}`,
    );

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to remove allowed sender",
    };
  }
}

export async function remove_allowed_sender_by_token(
  sender_token: string,
): Promise<ApiResponse<{ success: boolean }>> {
  try {
    const response = await api_client.delete<{ success: boolean }>(
      `/contacts/v1/allowed_senders?sender_token=${encodeURIComponent(sender_token)}`,
    );

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to remove allowed sender",
    };
  }
}

export async function bulk_remove_allowed_senders_by_tokens(
  sender_tokens: string[],
): Promise<ApiResponse<{ success: boolean; removed_count: number }>> {
  try {
    const response = await api_client.delete<{
      success: boolean;
      removed_count: number;
    }>("/contacts/v1/allowed_senders/bulk", {
      body: JSON.stringify({ sender_tokens }),
    });

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to bulk remove allowed senders",
    };
  }
}

export async function check_allowed_senders(
  emails: string[],
): Promise<Set<string>> {
  if (emails.length === 0) {
    return new Set();
  }

  try {
    const token_to_email = new Map<string, string>();

    await Promise.all(
      emails.map(async (email) => {
        const token = await generate_sender_token(email);

        token_to_email.set(token, normalize_email(email));
      }),
    );

    const tokens = Array.from(token_to_email.keys());
    const response = await api_client.get<{ allowed_tokens: string[] }>(
      `/contacts/v1/allowed_senders/check?tokens=${encodeURIComponent(tokens.join(","))}`,
    );

    if (response.error || !response.data) {
      return new Set();
    }

    const allowed_emails = new Set<string>();

    for (const token of response.data.allowed_tokens) {
      const email = token_to_email.get(token);

      if (email) {
        allowed_emails.add(email);
      }
    }

    return allowed_emails;
  } catch {
    return new Set();
  }
}

export async function is_sender_allowed(email: string): Promise<boolean> {
  const allowed = await check_allowed_senders([email]);

  return allowed.has(normalize_email(email));
}
