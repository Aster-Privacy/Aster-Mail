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

import { api_client } from "./client";
import { save_email_recovery_backup } from "./recovery";

import { hash_recovery_email } from "@/services/crypto/key_manager";
import {
  generate_recovery_key,
  encrypt_vault_backup,
  clear_recovery_key,
} from "@/services/crypto/recovery_key";

const HASH_ALG = ["SHA", "256"].join("-");

interface GetRecoveryEmailApiResponse {
  encrypted_email: string | null;
  email_nonce: string | null;
  verified: boolean | null;
}

interface RecoveryEmailData {
  email: string | null;
  verified: boolean;
}

interface SaveRecoveryEmailApiResponse {
  success: boolean;
}

interface ResendVerificationApiResponse {
  success: boolean;
}

let cached_recovery_data: RecoveryEmailData | null = null;
let backup_ensured = false;

async function derive_recovery_email_key(
  vault: EncryptedVault,
): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(
    vault.identity_key + "astermail-recovery-email-v1",
  );
  const hash = await crypto.subtle.digest(HASH_ALG, key_material);

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

export async function ensure_email_recovery_backup(
  vault: EncryptedVault,
): Promise<void> {
  if (backup_ensured) return;
  backup_ensured = true;

  try {
    const check = await api_client.get<GetRecoveryEmailApiResponse>(
      "/core/v1/recovery/email",
    );

    if (check.error || !check.data?.verified) return;

    const email_vault_key = generate_recovery_key();
    const backup = await encrypt_vault_backup(vault, email_vault_key);

    const key_b64 = btoa(String.fromCharCode(...email_vault_key));

    await save_email_recovery_backup(
      backup.encrypted_data,
      backup.nonce,
      backup.salt,
      key_b64,
    );

    clear_recovery_key(email_vault_key);
  } catch {
    backup_ensured = false;
  }
}

export async function get_recovery_email(
  vault: EncryptedVault | null,
): Promise<{ data: RecoveryEmailData }> {
  if (!vault) {
    return { data: { email: null, verified: false } };
  }

  if (cached_recovery_data) {
    if (cached_recovery_data.verified) {
      ensure_email_recovery_backup(vault);
    }

    return { data: cached_recovery_data };
  }

  try {
    const response = await api_client.get<GetRecoveryEmailApiResponse>(
      "/core/v1/recovery/email",
    );

    if (response.error || !response.data) {
      return { data: { email: null, verified: false } };
    }

    const { encrypted_email, email_nonce, verified } = response.data;

    if (!encrypted_email || !email_nonce) {
      return { data: { email: null, verified: false } };
    }

    const email = await decrypt_recovery_email(
      encrypted_email,
      email_nonce,
      vault,
    );

    cached_recovery_data = { email, verified: verified ?? false };

    if (cached_recovery_data.verified) {
      ensure_email_recovery_backup(vault);
    }

    return { data: cached_recovery_data };
  } catch {
    return { data: { email: null, verified: false } };
  }
}

export async function save_recovery_email(
  email: string,
  vault: EncryptedVault,
): Promise<{ data: { success: boolean }; code?: string }> {
  try {
    const { encrypted, nonce } = await encrypt_recovery_email(email, vault);
    const email_hash = await hash_recovery_email(email);

    const response = await api_client.put<SaveRecoveryEmailApiResponse>(
      "/core/v1/recovery/email",
      {
        encrypted_email: encrypted,
        email_nonce: nonce,
        email_hash,
        plaintext_email: email,
      },
    );

    const success = !response.error && response.data?.success === true;

    if (success) {
      cached_recovery_data = { email, verified: false };

      try {
        const email_vault_key = generate_recovery_key();
        const backup = await encrypt_vault_backup(vault, email_vault_key);

        const key_b64 = btoa(String.fromCharCode(...email_vault_key));

        await save_email_recovery_backup(
          backup.encrypted_data,
          backup.nonce,
          backup.salt,
          key_b64,
        );

        clear_recovery_key(email_vault_key);
      } catch {}
    }

    return { data: { success }, code: response.code };
  } catch {
    return { data: { success: false } };
  }
}

export async function resend_recovery_verification(
  plaintext_email?: string,
): Promise<{
  data: { success: boolean };
}> {
  const email = plaintext_email || cached_recovery_data?.email;

  if (!email) {
    return { data: { success: false } };
  }

  try {
    const response = await api_client.post<ResendVerificationApiResponse>(
      "/core/v1/recovery/email/resend",
      { plaintext_email: email },
    );

    return {
      data: { success: !response.error && response.data?.success === true },
    };
  } catch {
    return { data: { success: false } };
  }
}

export async function remove_recovery_email(): Promise<{
  data: { success: boolean };
}> {
  try {
    const response = await api_client.delete<{ success: boolean }>(
      "/core/v1/recovery/email",
    );

    const success = !response.error && response.data?.success === true;

    if (success) {
      cached_recovery_data = null;
      backup_ensured = false;
    }

    return { data: { success } };
  } catch {
    return { data: { success: false } };
  }
}

export async function check_recovery_email_verified(): Promise<boolean> {
  try {
    const response = await api_client.get<GetRecoveryEmailApiResponse>(
      "/core/v1/recovery/email",
    );

    if (response.error || !response.data) {
      return false;
    }

    const verified = response.data.verified === true;

    if (verified && cached_recovery_data) {
      cached_recovery_data = { ...cached_recovery_data, verified: true };
    }

    return verified;
  } catch {
    return false;
  }
}

export function clear_recovery_email_cache(): void {
  cached_recovery_data = null;
  backup_ensured = false;
}
