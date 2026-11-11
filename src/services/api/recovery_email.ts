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
import type { StepUpCredentials } from "./step_up";

import { api_client } from "./client";

import { HASH_ALG } from "@/services/crypto/constants";
import { get_account_data_crypto_keys } from "@/services/crypto/legacy_keks";
import { hash_recovery_email } from "@/services/crypto/key_manager";
import { vault_identity_key_materials } from "@/services/crypto/identity_key_materials";
import { EMAIL_REGEX } from "@/lib/utils";
import { ignore_error } from "@/lib/ignore_error";

interface GetRecoveryEmailApiResponse {
  encrypted_email: string | null;
  email_nonce: string | null;
  verified: boolean | null;
  has_server_enc: boolean;
  exists?: boolean;
  step_up_required?: boolean;
}

export interface RecoveryEmailData {
  email: string | null;
  verified: boolean;
  exists: boolean;
  step_up_required: boolean;
}

export const EMPTY_RECOVERY_EMAIL: RecoveryEmailData = {
  email: null,
  verified: false,
  exists: false,
  step_up_required: false,
};

const RECOVERY_EMAIL_CONTEXT = "astermail-recovery-email-v1";
const MAX_RECOVERY_EMAIL_LENGTH = 254;
const MAX_RECOVERY_EMAIL_LOCAL_LENGTH = 64;

export function normalize_recovery_email(email: string): string {
  return email.trim().toLowerCase();
}

export function is_valid_recovery_email(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_RECOVERY_EMAIL_LENGTH) {
    return false;
  }
  if (value.indexOf("@") > MAX_RECOVERY_EMAIL_LOCAL_LENGTH) return false;

  return EMAIL_REGEX.test(value);
}

export function parse_recovery_email_plaintext(bytes: BufferSource): string {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();

  if (!is_valid_recovery_email(text)) {
    throw new Error("recovery email plaintext is not an email address");
  }

  return text;
}

interface SaveRecoveryEmailApiResponse {
  success: boolean;
}

interface ResendVerificationApiResponse {
  success: boolean;
}

const RECOVERY_CACHE_TTL_MS = 30_000;

let cached_recovery_data: RecoveryEmailData | null = null;
let cached_recovery_at = 0;

function set_cached_recovery_data(data: RecoveryEmailData | null) {
  cached_recovery_data = data;
  cached_recovery_at = data ? Date.now() : 0;
}

function read_cached_recovery_data(): RecoveryEmailData | null {
  if (!cached_recovery_data) return null;
  if (Date.now() - cached_recovery_at > RECOVERY_CACHE_TTL_MS) {
    set_cached_recovery_data(null);

    return null;
  }

  return cached_recovery_data;
}

async function derive_recovery_email_key_from(
  identity_key: string,
): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(
    identity_key + RECOVERY_EMAIL_CONTEXT,
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

function derive_recovery_email_key(vault: EncryptedVault): Promise<CryptoKey> {
  return derive_recovery_email_key_from(vault.identity_key);
}

async function open_recovery_email(
  key: CryptoKey,
  ciphertext: Uint8Array,
  iv: Uint8Array,
): Promise<ArrayBuffer | null> {
  try {
    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
  } catch {
    return null;
  }
}

export async function encrypt_recovery_email(
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
  const encrypted_data = Uint8Array.from(atob(encrypted), (c) =>
    c.charCodeAt(0),
  );
  const nonce_data = Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0));

  for (const identity_key of vault_identity_key_materials(vault)) {
    const opened = await open_recovery_email(
      await derive_recovery_email_key_from(identity_key),
      encrypted_data,
      nonce_data,
    );

    if (opened) return parse_recovery_email_plaintext(opened);
  }

  for (const key of get_account_data_crypto_keys(RECOVERY_EMAIL_CONTEXT)) {
    const opened = await open_recovery_email(key, encrypted_data, nonce_data);

    if (opened) return parse_recovery_email_plaintext(opened);
  }

  throw new Error("recovery email cannot be decrypted");
}

export async function reencrypt_recovery_email(
  encrypted: string,
  nonce: string,
  old_vault: EncryptedVault,
  new_vault: EncryptedVault,
): Promise<{ encrypted_email: string; email_nonce: string } | null> {
  try {
    const address = await decrypt_recovery_email(encrypted, nonce, old_vault);

    if (!address) {
      return null;
    }

    const reencrypted = await encrypt_recovery_email(address, new_vault);

    return {
      encrypted_email: reencrypted.encrypted,
      email_nonce: reencrypted.nonce,
    };
  } catch (caught) {
    ignore_error("services/api/recovery_email:reencrypt", caught);

    return null;
  }
}

export async function get_recovery_email(
  vault: EncryptedVault | null,
): Promise<{ data: RecoveryEmailData }> {
  if (!vault) {
    return { data: EMPTY_RECOVERY_EMAIL };
  }

  const cached = read_cached_recovery_data();

  if (cached) {
    return { data: cached };
  }

  try {
    const response = await api_client.get<GetRecoveryEmailApiResponse>(
      "/core/v1/recovery/email",
    );

    if (response.error || !response.data) {
      return { data: EMPTY_RECOVERY_EMAIL };
    }

    const { encrypted_email, email_nonce, verified, has_server_enc } =
      response.data;
    const exists =
      response.data.exists ?? Boolean(encrypted_email && email_nonce);
    const step_up_required =
      response.data.step_up_required ?? Boolean(verified);

    if (!encrypted_email || !email_nonce) {
      const empty_data: RecoveryEmailData = {
        email: null,
        verified: verified ?? false,
        exists,
        step_up_required,
      };

      set_cached_recovery_data(empty_data);

      return { data: empty_data };
    }

    let email: string | null = null;
    let decrypt_failed = false;

    try {
      email = await decrypt_recovery_email(encrypted_email, email_nonce, vault);
    } catch (caught) {
      decrypt_failed = true;
      ignore_error("services/api/recovery_email:decrypt", caught);
    }

    const recovery_data: RecoveryEmailData = {
      email,
      verified: verified ?? false,
      exists,
      step_up_required,
    };

    if (!decrypt_failed) {
      set_cached_recovery_data(recovery_data);
    }

    if (
      is_valid_recovery_email(email) &&
      recovery_data.verified &&
      !has_server_enc
    ) {
      hash_recovery_email(email)
        .then((email_hash) =>
          api_client.post("/core/v1/recovery/email/server-enc", {
            plaintext_email: email,
            email_hash,
          }),
        )
        .catch((caught) =>
          ignore_error(
            "services/api/recovery_email:get_recovery_email",
            caught,
          ),
        );
    }

    return { data: recovery_data };
  } catch {
    return { data: EMPTY_RECOVERY_EMAIL };
  }
}

export async function save_recovery_email(
  email: string,
  vault: EncryptedVault,
  credentials?: StepUpCredentials,
): Promise<{ data: { success: boolean }; code?: string; error?: string }> {
  try {
    const normalized = normalize_recovery_email(email);

    if (!is_valid_recovery_email(normalized)) {
      return { data: { success: false } };
    }

    const { encrypted, nonce } = await encrypt_recovery_email(
      normalized,
      vault,
    );
    const email_hash = await hash_recovery_email(normalized);

    const response = await api_client.put<SaveRecoveryEmailApiResponse>(
      "/core/v1/recovery/email",
      {
        encrypted_email: encrypted,
        email_nonce: nonce,
        email_hash,
        plaintext_email: normalized,
        password_hash: credentials?.password_hash,
        totp_code: credentials?.totp_code,
      },
    );

    const success = !response.error && response.data?.success === true;

    if (success) {
      cached_recovery_data = {
        email: normalized,
        verified: false,
        exists: true,
        step_up_required: false,
      };
    }

    return { data: { success }, code: response.code, error: response.error };
  } catch {
    return { data: { success: false } };
  }
}

export async function resend_recovery_verification(
  plaintext_email?: string,
): Promise<{ data: { success: boolean }; code?: string; error?: string }> {
  const candidate = plaintext_email || cached_recovery_data?.email;
  const email = candidate ? normalize_recovery_email(candidate) : null;

  try {
    const response = await api_client.post<ResendVerificationApiResponse>(
      "/core/v1/recovery/email/resend",
      is_valid_recovery_email(email) ? { plaintext_email: email } : {},
    );

    return {
      data: { success: !response.error && response.data?.success === true },
      code: response.code,
      error: response.error,
    };
  } catch {
    return { data: { success: false } };
  }
}

export async function resend_pending_verification(
  user_hash: string,
): Promise<{ data: { success: boolean } }> {
  try {
    const response = await api_client.post<ResendVerificationApiResponse>(
      "/core/v1/recovery/email/resend-pending",
      { user_hash },
    );

    return {
      data: { success: !response.error && response.data?.success === true },
    };
  } catch {
    return { data: { success: false } };
  }
}

export type RecoveryEmailLinkStatus = "verified" | "not_verified" | "unreachable";

export async function get_recovery_email_link_status(
  token: string,
): Promise<RecoveryEmailLinkStatus> {
  try {
    const response = await api_client.post<{ verified: boolean }>(
      "/core/v1/recovery/email/link-status",
      { token },
    );

    if (response.error || !response.data) {
      return "unreachable";
    }

    return response.data.verified === true ? "verified" : "not_verified";
  } catch {
    return "unreachable";
  }
}

export async function remove_recovery_email(
  credentials: StepUpCredentials,
): Promise<{ data: { success: boolean }; code?: string; error?: string }> {
  try {
    const response = await api_client.delete<{ success: boolean }>(
      "/core/v1/recovery/email",
      {
        data: {
          password_hash: credentials.password_hash,
          totp_code: credentials.totp_code,
        },
      },
    );

    const success = !response.error && response.data?.success === true;

    if (success) {
      cached_recovery_data = null;
    }

    return { data: { success }, code: response.code, error: response.error };
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
      cached_recovery_data = {
        ...cached_recovery_data,
        verified: true,
        exists: true,
        step_up_required: true,
      };
    }

    return verified;
  } catch {
    return false;
  }
}

export async function prime_server_recovery_email(
  vault: EncryptedVault | null,
): Promise<void> {
  await get_recovery_email(vault);
}

export function clear_recovery_email_cache(): void {
  cached_recovery_data = null;
}
