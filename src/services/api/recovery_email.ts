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
const RETIRED_KEY_PREFIX = "undefined";
const MAX_RECOVERY_EMAIL_LENGTH = 254;
const MAX_RECOVERY_EMAIL_LOCAL_LENGTH = 64;
const RESEAL_ENDPOINT = "/core/v1/recovery/email/reseal";
const UNDISPLAYABLE_CHARACTER_PATTERN =
  /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u;
const DEFERRED_RESEAL_CODES: ReadonlySet<string> = new Set([
  "NETWORK_ERROR",
  "TIMEOUT_ERROR",
  "SERVER_ERROR",
  "RATE_LIMIT_EXCEEDED",
  "UNAUTHORIZED",
  "FORBIDDEN",
]);

export const INVALID_RECOVERY_EMAIL_CODE = "INVALID_RECOVERY_EMAIL";
export const RECOVERY_EMAIL_KEY_UNAVAILABLE_CODE =
  "RECOVERY_EMAIL_KEY_UNAVAILABLE";

export type RecoveryEmailResealOutcome = "done" | "deferred" | "failed";

type RecoveryEmailKeySource = "current" | "retained" | "retired";

interface OpenedRecoveryEmail {
  address: string;
  source: RecoveryEmailKeySource;
}

const RECOVERY_EMAIL_PATTERN =
  /^[\p{L}\p{N}\p{M}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}-]{0,61}[\p{L}\p{N}\p{M}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}-]{0,61}[\p{L}\p{N}\p{M}])?)*$/u;

export function normalize_recovery_email(email: string): string {
  return email.trim().toLowerCase();
}

export function is_valid_recovery_email(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_RECOVERY_EMAIL_LENGTH) {
    return false;
  }
  if (new TextEncoder().encode(value).length > MAX_RECOVERY_EMAIL_LENGTH) {
    return false;
  }
  if (value.indexOf("@") > MAX_RECOVERY_EMAIL_LOCAL_LENGTH) return false;

  return RECOVERY_EMAIL_PATTERN.test(value);
}

function has_unprintable_character(value: string): boolean {
  return UNDISPLAYABLE_CHARACTER_PATTERN.test(value);
}

export function is_readable_recovery_email(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_RECOVERY_EMAIL_LENGTH) {
    return false;
  }
  if (has_unprintable_character(value)) return false;

  const separator = value.indexOf("@");

  if (separator <= 0 || separator === value.length - 1) return false;

  return separator === value.lastIndexOf("@");
}

export function parse_recovery_email_plaintext(bytes: BufferSource): string {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();

  if (!is_readable_recovery_email(text)) {
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
let retired_reseal_scheduled = false;

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

async function retired_recovery_email_key(
  vault: EncryptedVault,
): Promise<CryptoKey | null> {
  const raw = new Uint8Array(
    await crypto.subtle.digest(
      HASH_ALG,
      new TextEncoder().encode(RETIRED_KEY_PREFIX + RECOVERY_EMAIL_CONTEXT),
    ),
  );

  if (vault.identity_key) {
    const held = vault.legacy_keks;

    if (!held || held.length === 0) return null;

    const encoded = btoa(String.fromCharCode(...raw));

    if (!held.some((entry) => entry.k === encoded)) return null;
  }

  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

function decode_base64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function encode_base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
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

async function read_recovery_email_with(
  key: CryptoKey,
  ciphertext: Uint8Array,
  iv: Uint8Array,
): Promise<string | null> {
  const opened = await open_recovery_email(key, ciphertext, iv);

  if (!opened) return null;

  try {
    return parse_recovery_email_plaintext(opened);
  } catch {
    return null;
  }
}

async function seal_recovery_email(
  email: string,
  key: CryptoKey,
): Promise<{ encrypted: string; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(email);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data,
  );

  return {
    encrypted: encode_base64(new Uint8Array(encrypted)),
    nonce: encode_base64(nonce),
  };
}

export async function encrypt_recovery_email(
  email: string,
  vault: EncryptedVault,
): Promise<{ encrypted: string; nonce: string }> {
  if (!vault.identity_key) {
    throw new Error("recovery email cannot be sealed without an identity key");
  }

  return seal_recovery_email(
    email,
    await derive_recovery_email_key_from(vault.identity_key),
  );
}

async function open_recovery_email_with_source(
  encrypted: string,
  nonce: string,
  vault: EncryptedVault,
): Promise<OpenedRecoveryEmail> {
  const encrypted_data = decode_base64(encrypted);
  const nonce_data = decode_base64(nonce);

  for (const identity_key of vault_identity_key_materials(vault)) {
    const address = await read_recovery_email_with(
      await derive_recovery_email_key_from(identity_key),
      encrypted_data,
      nonce_data,
    );

    if (address !== null) {
      return {
        address,
        source: identity_key === vault.identity_key ? "current" : "retained",
      };
    }
  }

  for (const key of get_account_data_crypto_keys(RECOVERY_EMAIL_CONTEXT)) {
    const address = await read_recovery_email_with(
      key,
      encrypted_data,
      nonce_data,
    );

    if (address !== null) return { address, source: "retained" };
  }

  const retired_key = await retired_recovery_email_key(vault);

  if (retired_key) {
    const address = await read_recovery_email_with(
      retired_key,
      encrypted_data,
      nonce_data,
    );

    if (address !== null) return { address, source: "retired" };
  }

  throw new Error("recovery email cannot be decrypted");
}

async function decrypt_recovery_email(
  encrypted: string,
  nonce: string,
  vault: EncryptedVault,
): Promise<string> {
  const opened = await open_recovery_email_with_source(encrypted, nonce, vault);

  return opened.address;
}

async function read_stored_recovery_email(): Promise<GetRecoveryEmailApiResponse | null> {
  const response = await api_client.get<GetRecoveryEmailApiResponse>(
    "/core/v1/recovery/email",
    { skip_cache: true, skip_dedup: true },
  );

  if (response.error || !response.data) return null;

  return response.data;
}

async function read_stored_with(
  key: CryptoKey,
  stored: GetRecoveryEmailApiResponse,
): Promise<string | null> {
  if (!stored.encrypted_email || !stored.email_nonce) return null;

  try {
    return await read_recovery_email_with(
      key,
      decode_base64(stored.encrypted_email),
      decode_base64(stored.email_nonce),
    );
  } catch {
    return null;
  }
}

function is_deferred_reseal_response(response: {
  code?: string;
  status?: number;
  server_code?: string;
}): boolean {
  if (response.code && DEFERRED_RESEAL_CODES.has(response.code)) return true;

  const status = response.status;

  if (status === undefined) return true;
  if (status === 401 || status === 403 || status === 405) return true;
  if (status === 429 || status >= 500) return true;

  return status === 404 && !response.server_code;
}

export async function reseal_recovery_email(
  new_identity_key: string,
  old_identity_keys: string[],
  extra_old_keys: CryptoKey[] = [],
): Promise<RecoveryEmailResealOutcome> {
  if (!new_identity_key) return "deferred";

  const current_key = await derive_recovery_email_key_from(new_identity_key);
  const before = await read_stored_recovery_email();

  if (!before) return "deferred";
  if (!before.encrypted_email || !before.email_nonce) return "done";
  if ((await read_stored_with(current_key, before)) !== null) return "done";

  const old_keys: CryptoKey[] = [];

  for (const old_identity_key of old_identity_keys) {
    if (!old_identity_key || old_identity_key === new_identity_key) continue;

    old_keys.push(await derive_recovery_email_key_from(old_identity_key));
  }

  old_keys.push(...extra_old_keys);

  const ciphertext = decode_base64(before.encrypted_email);
  const iv = decode_base64(before.email_nonce);
  let address: string | null = null;
  let opened_by_old_key = false;

  for (const old_key of old_keys) {
    const opened = await open_recovery_email(old_key, ciphertext, iv);

    if (!opened) continue;

    opened_by_old_key = true;

    try {
      address = parse_recovery_email_plaintext(opened);
    } catch {
      address = null;
    }

    break;
  }

  if (!opened_by_old_key) return "done";
  if (address === null) return "failed";

  const sealed = await seal_recovery_email(address, current_key);
  const email_hash = await hash_recovery_email(address);
  const saved = await api_client.put<SaveRecoveryEmailApiResponse>(
    RESEAL_ENDPOINT,
    {
      encrypted_email: sealed.encrypted,
      email_nonce: sealed.nonce,
      email_hash,
    },
  );

  if (saved.error && is_deferred_reseal_response(saved)) return "deferred";

  const after = await read_stored_recovery_email();

  if (!after) return "deferred";

  set_cached_recovery_data(null);

  if (!after.encrypted_email || !after.email_nonce) return "done";

  return (await read_stored_with(current_key, after)) !== null
    ? "done"
    : "failed";
}

function schedule_retired_key_reseal(vault: EncryptedVault): void {
  if (retired_reseal_scheduled || !vault.identity_key) return;

  retired_reseal_scheduled = true;

  const identity_key = vault.identity_key;

  retired_recovery_email_key(vault)
    .then((retired_key): Promise<RecoveryEmailResealOutcome> => {
      if (!retired_key) return Promise.resolve("deferred");

      return reseal_recovery_email(identity_key, [], [retired_key]);
    })
    .then((outcome) => {
      if (outcome !== "done") retired_reseal_scheduled = false;
    })
    .catch((caught) => {
      retired_reseal_scheduled = false;
      ignore_error("services/api/recovery_email:retired_reseal", caught);
    });
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
    let read_with_retired_key = false;

    try {
      const opened = await open_recovery_email_with_source(
        encrypted_email,
        email_nonce,
        vault,
      );

      email = opened.address;
      read_with_retired_key = opened.source === "retired";
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

    if (read_with_retired_key) {
      schedule_retired_key_reseal(vault);
    } else if (
      is_readable_recovery_email(email) &&
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
      return {
        data: { success: false },
        code: INVALID_RECOVERY_EMAIL_CODE,
      };
    }

    if (!vault.identity_key) {
      return {
        data: { success: false },
        code: RECOVERY_EMAIL_KEY_UNAVAILABLE_CODE,
      };
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
      is_readable_recovery_email(email) ? { plaintext_email: email } : {},
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
  retired_reseal_scheduled = false;
}
