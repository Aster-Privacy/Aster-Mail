import type { EncryptedVault } from "@/services/crypto/key_manager";

import { api_client } from "./client";

interface GetRecoveryEmailApiResponse {
  encrypted_email: string | null;
  email_nonce: string | null;
}

interface SaveRecoveryEmailApiResponse {
  success: boolean;
}

async function derive_recovery_email_key(
  vault: EncryptedVault,
): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(
    vault.identity_key + "astermail-recovery-email-v1",
  );
  const hash = await crypto.subtle.digest("SHA-256", key_material);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt_recovery_email(
  email: string,
  vault: EncryptedVault,
): Promise<{ encrypted: string; nonce: string }> {
  const key = await derive_recovery_email_key(vault);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(email);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data,
  );

  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    nonce: btoa(String.fromCharCode(...nonce)),
  };
}

async function decrypt_recovery_email(
  encrypted: string,
  nonce: string,
  vault: EncryptedVault,
): Promise<string> {
  const key = await derive_recovery_email_key(vault);
  const encrypted_data = Uint8Array.from(atob(encrypted), (c) =>
    c.charCodeAt(0),
  );
  const nonce_data = Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0));

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce_data },
    key,
    encrypted_data,
  );

  return new TextDecoder().decode(decrypted);
}

export async function get_recovery_email(
  vault: EncryptedVault | null,
): Promise<{ data: string | null }> {
  if (!vault) {
    return { data: null };
  }

  try {
    const response =
      await api_client.get<GetRecoveryEmailApiResponse>("/core/v1/recovery/email");

    if (response.error || !response.data) {
      return { data: null };
    }

    const { encrypted_email, email_nonce } = response.data;

    if (!encrypted_email || !email_nonce) {
      return { data: null };
    }

    const email = await decrypt_recovery_email(
      encrypted_email,
      email_nonce,
      vault,
    );

    return { data: email };
  } catch {
    return { data: null };
  }
}

export async function save_recovery_email(
  email: string,
  vault: EncryptedVault,
): Promise<{ data: { success: boolean } }> {
  try {
    const { encrypted, nonce } = await encrypt_recovery_email(email, vault);

    const response = await api_client.put<SaveRecoveryEmailApiResponse>(
      "/core/v1/recovery/email",
      {
        encrypted_email: encrypted,
        email_nonce: nonce,
      },
    );

    return {
      data: { success: !response.error && response.data?.success === true },
    };
  } catch {
    return { data: { success: false } };
  }
}
