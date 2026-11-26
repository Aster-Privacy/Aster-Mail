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
import type { TranslationKey } from "@/lib/i18n/types";

import { ignore_error } from "@/lib/ignore_error";
import { ENVELOPE_VERSIONS } from "@/lib/crypto/device_envelope";
import { has_tauri_runtime } from "@/lib/tauri_runtime";

export type DeviceAuthErrorCode =
  "challenge_failed" | "login_failed" | "code_generation_failed";

export const GUARD_DEVICE_REQUIRED = "GUARD_DEVICE_REQUIRED";
export const GUARD_DEVICE_PENDING = "GUARD_DEVICE_PENDING";

export class DeviceAuthError extends Error {
  code: DeviceAuthErrorCode;
  status: number | undefined;
  server_code: string | undefined;
  i18n_key: TranslationKey;
  constructor(
    code: DeviceAuthErrorCode,
    status?: number,
    server_code?: string,
  ) {
    super(code);
    this.code = code;
    this.status = status;
    this.server_code = server_code;
    this.i18n_key =
      code === "challenge_failed"
        ? "errors.device_challenge_mismatch"
        : code === "login_failed"
          ? "errors.device_repair_required"
          : "auth.pair_device_failed";
  }
}

export interface DevicePubkeys {
  device_id: string | null;
  ed25519_pk: string;
  mlkem_pk: string;
  x25519_pk: string;
  machine_name: string;
  action_pk?: string | null;
}

export interface DeviceCodeResult {
  code: string;
  expires_in: number;
}

export interface DeviceCodeStatus {
  status: "pending" | "confirmed" | "expired" | "activation_pending";
  device_id?: string;
  sealed_envelope?: string;
  activates_at?: string;
}

export function is_tauri(): boolean {
  return has_tauri_runtime();
}

async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const core = await import("@tauri-apps/api/core");

  return core.invoke<T>(cmd, args);
}

export const PASSPHRASE_PIN_LOCKED = "passphrase_pin_locked";
const DEVICE_ACCOUNT_MISMATCH = "device_account_mismatch";

let verified_device_login: { account_id: string; device_id: string } | null =
  null;

export function device_id_verified_for(account_id: string): string | null {
  return verified_device_login?.account_id === account_id
    ? verified_device_login.device_id
    : null;
}

function is_pin_locked_error(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return message.includes(PASSPHRASE_PIN_LOCKED);
}

function base64url_encode_bytes(bytes: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64url_decode_to_bytes(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return bytes;
}

export async function device_challenge(
  device_id: string,
): Promise<{
  challenge_id: string;
  nonce: string;
  signature_version?: number;
}> {
  const { api_client } = await import("@/services/api/client");
  const result = await api_client.post<{
    challenge_id: string;
    nonce: string;
    signature_version?: number;
  }>("/core/v1/auth/device/challenge", { device_id });

  if (result.error || !result.data) {
    throw new DeviceAuthError("challenge_failed", result.status);
  }

  return result.data;
}

export async function device_login(
  challenge_id: string,
  signature: string,
): Promise<unknown> {
  const { api_client } = await import("@/services/api/client");
  const result = await api_client.post<unknown>("/core/v1/auth/device/login", {
    challenge_id,
    signature,
  });

  if (result.error || !result.data) {
    throw new DeviceAuthError("login_failed", result.status, result.server_code);
  }

  return result.data;
}

async function silent_device_login(
  device_id: string,
  notify = true,
  expected_account_id: string | null = null,
): Promise<void> {
  const challenge = await device_challenge(device_id);
  const signature = await invoke<string>("device_sign_challenge", {
    nonceB64: challenge.nonce,
    signatureVersion: challenge.signature_version ?? null,
  });
  const login_response = await device_login(challenge.challenge_id, signature);
  const resp = login_response as {
    access_token?: string;
    csrf_token?: string;
    refresh_token?: string;
    user_id?: unknown;
  };

  if (expected_account_id && resp.user_id !== expected_account_id) {
    throw new Error(DEVICE_ACCOUNT_MISMATCH);
  }
  verified_device_login =
    typeof resp.user_id === "string" && resp.user_id
      ? { account_id: resp.user_id, device_id }
      : null;

  if (resp.access_token) {
    const { api_client } = await import("@/services/api/client");

    api_client.set_dev_token(resp.access_token, resp.refresh_token);
    if (resp.csrf_token) {
      api_client.set_csrf(resp.csrf_token);
    }
    api_client.set_authenticated(true);
  }

  locked_device_login = null;
  const raw_b64 = await invoke<string | null>("device_get_stored_passphrase", {
    deviceId: device_id,
  }).catch((caught: unknown) => {
    if (is_pin_locked_error(caught)) {
      locked_device_login = { login_response, device_id };
      throw new Error(PASSPHRASE_PIN_LOCKED);
    }
    throw caught;
  });

  if (!raw_b64) {
    throw new Error("passphrase_null");
  }

  const passphrase = new TextDecoder().decode(
    base64url_decode_to_bytes(raw_b64),
  );

  pending_device_login = { login_response, passphrase, device_id };

  if (notify) {
    window.dispatchEvent(new CustomEvent("astermail:device-login-success"));
  }
}

export type DeviceReloginOutcome =
  "signed_in" | "rejected" | "unavailable" | "locked" | "guard_pending";

function guard_login_code(error: unknown): string | undefined {
  return error instanceof DeviceAuthError && error.code === "login_failed"
    ? error.server_code
    : undefined;
}

export function is_device_pairing_rejected(error: unknown): boolean {
  if (error instanceof DeviceAuthError) {
    return (
      error.code === "login_failed" &&
      (error.status === 401 || error.server_code === GUARD_DEVICE_REQUIRED)
    );
  }

  return error instanceof Error && error.message === "passphrase_null";
}

type ReloginStep = DeviceReloginOutcome | "guard_required";

async function relogin_step(device_id: string): Promise<ReloginStep> {
  if (!is_tauri()) return "unavailable";

  try {
    await silent_device_login(
      device_id,
      true,
      await current_account_id_or_null(),
    );

    return "signed_in";
  } catch (caught) {
    if (is_pin_locked_error(caught)) return "locked";
    if (guard_login_code(caught) === GUARD_DEVICE_PENDING) {
      return "guard_pending";
    }
    if (guard_login_code(caught) === GUARD_DEVICE_REQUIRED) {
      return "guard_required";
    }

    return is_device_pairing_rejected(caught) ? "rejected" : "unavailable";
  }
}

export async function attempt_device_relogin(
  device_id: string,
): Promise<DeviceReloginOutcome> {
  const step = await relogin_step(device_id);

  return step === "guard_required" ? "rejected" : step;
}

const RELOGIN_ATTEMPTS = 3;
const REJECTIONS_BEFORE_FORGET = 2;

function wait_ms(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function relogin_with_retries(
  device_id: string,
  is_cancelled: () => boolean,
  wait: (ms: number) => Promise<void> = wait_ms,
): Promise<DeviceReloginOutcome> {
  let rejections = 0;

  for (let attempt = 0; attempt < RELOGIN_ATTEMPTS; attempt++) {
    if (is_cancelled()) return "unavailable";
    const outcome = await relogin_step(device_id);

    if (
      outcome === "signed_in" ||
      outcome === "locked" ||
      outcome === "guard_pending"
    ) {
      return outcome;
    }
    if (outcome === "guard_required") return "rejected";
    rejections = outcome === "rejected" ? rejections + 1 : 0;
    if (rejections >= REJECTIONS_BEFORE_FORGET) return "rejected";
    if (attempt < RELOGIN_ATTEMPTS - 1 && !is_cancelled()) {
      await wait(1000 * (attempt + 1));
    }
  }

  return "unavailable";
}

const EXPIRY_RELOGIN_WINDOW_MS = 10 * 60_000;
const EXPIRY_RELOGINS_PER_WINDOW = 3;
let expiry_relogins: number[] = [];

export function keep_pairing_after_session_expiry(now = Date.now()): boolean {
  if (!is_tauri()) return false;
  expiry_relogins = expiry_relogins.filter(
    (at) => now - at < EXPIRY_RELOGIN_WINDOW_MS,
  );
  if (expiry_relogins.length >= EXPIRY_RELOGINS_PER_WINDOW) return false;
  expiry_relogins.push(now);

  return true;
}

export async function release_device_after_sign_out(options: {
  keep_pairing: boolean;
  keep_other_accounts: boolean;
  device_id: string | null | undefined;
}): Promise<void> {
  if (options.keep_pairing) return;
  if (options.keep_other_accounts) {
    await forget_device_account(options.device_id);

    return;
  }
  await clear_device_session();
}

let explicit_sign_out = false;

export function mark_explicit_sign_out(): void {
  if (!is_tauri()) return;
  explicit_sign_out = true;
}

export function clear_explicit_sign_out(): void {
  explicit_sign_out = false;
}

export function take_explicit_sign_out(): boolean {
  const value = explicit_sign_out;

  explicit_sign_out = false;

  return value;
}

export async function request_device_code(
  pubkeys: DevicePubkeys,
): Promise<DeviceCodeResult> {
  const { api_client } = await import("@/services/api/client");
  const result = await api_client.post<DeviceCodeResult>(
    "/core/v1/auth/device/code",
    {
      ed25519_pk: pubkeys.ed25519_pk,
      mlkem_pk: pubkeys.mlkem_pk,
      x25519_pk: pubkeys.x25519_pk,
      machine_name: pubkeys.machine_name,
      envelope_versions: ENVELOPE_VERSIONS,
      ...(pubkeys.action_pk ? { action_pk: pubkeys.action_pk } : {}),
    },
  );

  if (result.error || !result.data) {
    throw new DeviceAuthError("code_generation_failed", result.status);
  }

  return result.data;
}

export async function poll_device_code_status(
  code: string,
): Promise<DeviceCodeStatus> {
  const normalized = code.replace(/-/g, "");
  const { api_client } = await import("@/services/api/client");
  const result = await api_client.get<DeviceCodeStatus>(
    `/core/v1/auth/device/code/status?code=${encodeURIComponent(normalized)}`,
  );

  if (result.error || !result.data) {
    throw new Error("device_code_status_unavailable");
  }

  return result.data;
}

async function confirm_passphrase_opens_vault(
  login_response: unknown,
  passphrase: string,
): Promise<void> {
  const vault = login_response as {
    encrypted_vault?: unknown;
    vault_nonce?: unknown;
  } | null;

  if (
    typeof vault?.encrypted_vault !== "string" ||
    typeof vault.vault_nonce !== "string"
  ) {
    throw new Error("vault_missing");
  }

  const { decrypt_vault } = await import("@/services/crypto/key_manager");

  await decrypt_vault(vault.encrypted_vault, vault.vault_nonce, passphrase);
}

export interface DevicePairingResult {
  login_response: Record<string, unknown> | null;
  passphrase: string | null;
  device_id: string;
  error: string | null;
}

export async function complete_device_pairing(
  device_id: string,
  sealed_envelope: string,
): Promise<DevicePairingResult> {
  let login_response: Record<string, unknown> | null = null;
  let passphrase: string | null = null;
  let error: string | null = null;

  try {
    await invoke("device_set_id", { deviceId: device_id });
    await invoke<void>("device_unseal_vault_envelope", {
      envelopeB64: sealed_envelope,
      deviceId: device_id,
    });

    await silent_device_login(device_id, false);
    const pending = consume_pending_device_login();

    if (!pending?.passphrase) {
      throw new Error("passphrase_null");
    }
    await confirm_passphrase_opens_vault(
      pending.login_response,
      pending.passphrase,
    );
    login_response = pending.login_response as Record<string, unknown>;
    passphrase = pending.passphrase;
  } catch (err) {
    login_response = null;
    passphrase = null;
    error = err instanceof Error ? err.message : String(err);
    await forget_device_account(device_id).catch((caught) =>
      ignore_error(
        "native/desktop_device_auth:complete_device_pairing",
        caught,
      ),
    );
  }

  window.dispatchEvent(new CustomEvent("astermail:device-paired"));

  return { login_response, passphrase, device_id, error };
}

export interface PendingDeviceLogin {
  login_response: unknown;
  passphrase: string | null;
  device_id: string;
}

let pending_device_login: PendingDeviceLogin | null = null;

export function consume_pending_device_login(): PendingDeviceLogin | null {
  const data = pending_device_login;

  pending_device_login = null;

  return data;
}

interface LockedDeviceLogin {
  login_response: unknown;
  device_id: string;
}

let locked_device_login: LockedDeviceLogin | null = null;

export interface AppUnlockSource {
  is_locked: (account_id: string) => boolean;
  wait_for_unlock: (account_id: string) => Promise<boolean>;
  read_passphrase: (account_id: string) => Promise<string | null>;
}

async function load_app_unlock_source(): Promise<AppUnlockSource> {
  const session = await import("@/contexts/auth/session_passphrase");
  const wrap = await import("@/services/app_lock_wrap");

  return {
    is_locked: session.is_session_passphrase_pin_locked,
    wait_for_unlock: wrap.wait_for_app_unlock,
    read_passphrase: session.get_session_passphrase,
  };
}

export function locked_device_login_account_id(): string | null {
  const response = locked_device_login?.login_response;

  if (!response || typeof response !== "object") return null;
  const user_id = (response as { user_id?: unknown }).user_id;

  return typeof user_id === "string" && user_id ? user_id : null;
}

export async function resume_device_login_after_unlock(
  account_id: string | null | undefined,
  source?: AppUnlockSource,
  on_unlock_needed?: (account_id: string) => void,
): Promise<PendingDeviceLogin | null> {
  const locked = locked_device_login;

  locked_device_login = null;
  if (!locked || !account_id) return null;

  const unlock = source ?? (await load_app_unlock_source());

  if (unlock.is_locked(account_id)) {
    on_unlock_needed?.(account_id);
    if (!(await unlock.wait_for_unlock(account_id))) return null;
  }

  const passphrase = await unlock.read_passphrase(account_id).catch(() => null);

  if (!passphrase) return null;

  return {
    login_response: locked.login_response,
    passphrase,
    device_id: locked.device_id,
  };
}

let desktop_device_auth_run: Promise<void> | null = null;

export async function resolve_current_account_device_id(
  account_device_id: string | null | undefined,
  last_paired_device_id: string | null | undefined,
): Promise<string | null> {
  if (account_device_id) return account_device_id;
  if (!last_paired_device_id) return null;

  try {
    const {
      get_all_accounts,
      get_current_account_id,
      device_id_claimed_by_other_account,
    } = await import("@/services/account_manager");
    const current_id = await get_current_account_id();
    const others = (await get_all_accounts()).filter(
      (account) => account.id !== current_id,
    );

    if (others.length > 0) return null;
    const claimed = await device_id_claimed_by_other_account(
      current_id,
      last_paired_device_id,
    );

    return claimed ? null : last_paired_device_id;
  } catch (caught) {
    ignore_error("native/desktop_device_auth:resolve_device_id", caught);

    return null;
  }
}

async function current_account_id_or_null(): Promise<string | null> {
  const { get_current_account_id } = await import(
    "@/services/account_manager"
  );

  return get_current_account_id();
}

async function run_desktop_device_auth(
  account_device_id?: string | null,
): Promise<void> {
  try {
    const pubkeys = await invoke<DevicePubkeys>("device_get_pubkeys");
    const device_id = await resolve_current_account_device_id(
      account_device_id,
      pubkeys.device_id,
    );

    if (!device_id) {
      window.dispatchEvent(
        new CustomEvent("astermail:device-needs-pairing", {
          detail: { pubkeys },
        }),
      );

      return;
    }

    const expected_account_id = await current_account_id_or_null();

    await silent_device_login(device_id, true, expected_account_id);
  } catch (caught) {
    ignore_error("native/desktop_device_auth:init", caught);
  }
}

export function init_desktop_device_auth(
  account_device_id?: string | null,
): Promise<void> {
  if (!is_tauri()) return Promise.resolve();
  if (desktop_device_auth_run) return desktop_device_auth_run;
  desktop_device_auth_run = run_desktop_device_auth(account_device_id);

  return desktop_device_auth_run;
}

export async function read_device_passphrase(
  device_id: string | null | undefined,
): Promise<string | null> {
  if (!is_tauri() || !device_id) return null;

  try {
    const raw_b64 = await invoke<string | null>(
      "device_get_stored_passphrase",
      { deviceId: device_id },
    );

    if (!raw_b64) return null;

    return new TextDecoder().decode(base64url_decode_to_bytes(raw_b64));
  } catch {
    return null;
  }
}

async function account_device_id(account_id: string): Promise<string | null> {
  const { get_all_accounts } = await import("@/services/account_manager");
  const accounts = await get_all_accounts();

  return accounts.find((account) => account.id === account_id)?.device_id ?? null;
}

export async function seal_device_passphrase(
  account_id: string,
  record: string,
): Promise<boolean> {
  if (!is_tauri()) return false;

  try {
    const device_id = await account_device_id(account_id);

    if (!device_id) return false;

    return await invoke<boolean>("device_pin_seal_stored_passphrase", {
      deviceId: device_id,
      record,
    });
  } catch {
    return false;
  }
}

export async function restore_device_passphrase(
  account_id: string,
  passphrase: string,
): Promise<boolean> {
  if (!is_tauri() || !passphrase) return false;

  try {
    const device_id = await account_device_id(account_id);

    if (!device_id) return false;

    return await invoke<boolean>("device_pin_restore_stored_passphrase", {
      deviceId: device_id,
      passphraseB64: base64url_encode_bytes(new TextEncoder().encode(passphrase)),
    });
  } catch {
    return false;
  }
}

export async function forget_device_account(
  device_id: string | null | undefined,
): Promise<void> {
  if (!is_tauri()) return;
  desktop_device_auth_run = null;
  pending_device_login = null;
  locked_device_login = null;

  if (!device_id) return;
  if (verified_device_login?.device_id === device_id) {
    verified_device_login = null;
  }

  await invoke("device_forget_account", { deviceId: device_id });
}

async function reset_device_auth(command: string): Promise<void> {
  if (!is_tauri()) return;
  desktop_device_auth_run = null;
  pending_device_login = null;
  locked_device_login = null;
  await invoke(command);
}

export async function clear_device_session(): Promise<void> {
  await reset_device_auth("device_clear_session");
}

export async function clear_device_identity(): Promise<void> {
  await reset_device_auth("device_clear_identity");
}

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export async function revoke_paired_device(
  known_ids: readonly (string | null | undefined)[] = [],
): Promise<number> {
  if (!is_tauri()) return 0;

  const ids = new Set<string>();

  for (const id of known_ids) {
    if (id) ids.add(id);
  }

  try {
    const pubkeys = await invoke<DevicePubkeys>("device_get_pubkeys");

    if (pubkeys.device_id) ids.add(pubkeys.device_id);
  } catch (caught) {
    ignore_error("native/desktop_device_auth:revoke_paired_device", caught);
  }

  const targets = [...ids].filter((id) => DEVICE_ID_PATTERN.test(id));

  if (targets.length === 0) return 0;

  const { api_client } = await import("@/services/api/client");
  const results = await Promise.all(
    targets.map((id) =>
      api_client
        .delete<void>(`/core/v1/devices/${id}`)
        .then((response) => !response.error)
        .catch(() => false),
    ),
  );

  return results.filter(Boolean).length;
}

export async function erase_device_pairing(): Promise<void> {
  if (!is_tauri()) return;
  desktop_device_auth_run = null;
  pending_device_login = null;
  locked_device_login = null;
  expiry_relogins = [];

  let failure: unknown = null;

  try {
    await invoke("device_refresh_token_clear");
  } catch (caught) {
    failure = caught;
  }

  await invoke("device_clear_identity");

  if (failure) throw failure;
}
