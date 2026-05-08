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
export interface DevicePubkeys {
  device_id: string | null;
  ed25519_pk: string;
  mlkem_pk: string;
  x25519_pk: string;
  machine_name: string;
}

export interface DeviceCodeResult {
  code: string;
  expires_in: number;
}

export interface DeviceCodeStatus {
  status: "pending" | "confirmed" | "expired";
  device_id?: string;
  sealed_envelope?: string;
}

export function is_tauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const core = await import("@tauri-apps/api/core");

  return core.invoke<T>(cmd, args);
}

function base64url_decode_to_bytes(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return bytes;
}

async function device_challenge(
  device_id: string,
): Promise<{ challenge_id: string; nonce: string }> {
  const { api_client } = await import("@/services/api/client");
  const result = await api_client.post<{
    challenge_id: string;
    nonce: string;
  }>("/core/v1/auth/device/challenge", { device_id });

  if (result.error || !result.data) {
    throw new Error("device challenge failed");
  }

  return result.data;
}

async function device_login(
  challenge_id: string,
  signature: string,
): Promise<unknown> {
  const { api_client } = await import("@/services/api/client");
  const result = await api_client.post<unknown>(
    "/core/v1/auth/device/login",
    { challenge_id, signature },
  );

  if (result.error || !result.data) {
    throw new Error("device login failed");
  }

  return result.data;
}

async function silent_device_login(device_id: string): Promise<void> {
  const challenge = await device_challenge(device_id);
  const signature = await invoke<string>("device_sign_challenge", {
    nonceB64: challenge.nonce,
  });
  const login_response = await device_login(challenge.challenge_id, signature);
  const resp = login_response as {
    access_token?: string;
    csrf_token?: string;
  };

  if (resp.access_token) {
    const { api_client } = await import("@/services/api/client");

    api_client.set_dev_token(resp.access_token);
    if (resp.csrf_token) {
      api_client.set_csrf(resp.csrf_token);
    }
    api_client.set_authenticated(true);
  }

  const raw_b64 = await invoke<string | null>("device_get_stored_passphrase");
  const passphrase = raw_b64
    ? new TextDecoder().decode(base64url_decode_to_bytes(raw_b64))
    : null;

  pending_device_login = { login_response, passphrase };

  window.dispatchEvent(
    new CustomEvent("astermail:device-login-success", {
      detail: { login_response, passphrase },
    }),
  );
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
    },
  );

  if (result.error || !result.data) {
    throw new Error("failed to generate device code");
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
    return { status: "expired" };
  }

  return result.data;
}

export interface DevicePairingResult {
  login_response: Record<string, unknown> | null;
  passphrase: string | null;
  error: string | null;
}

export async function complete_device_pairing(
  device_id: string,
  sealed_envelope: string,
): Promise<DevicePairingResult> {
  await invoke("device_set_id", { deviceId: device_id });
  await invoke<string>("device_unseal_vault_envelope", {
    envelopeB64: sealed_envelope,
  });

  let login_response: Record<string, unknown> | null = null;
  let passphrase: string | null = null;
  let error: string | null = null;

  try {
    await silent_device_login(device_id);
    const pending = consume_pending_device_login();

    if (pending) {
      login_response = pending.login_response as Record<string, unknown>;
      passphrase = pending.passphrase;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  window.dispatchEvent(new CustomEvent("astermail:device-paired"));

  return { login_response, passphrase, error };
}

let pending_device_login: {
  login_response: unknown;
  passphrase: string | null;
} | null = null;

export function consume_pending_device_login(): {
  login_response: unknown;
  passphrase: string | null;
} | null {
  const data = pending_device_login;

  pending_device_login = null;

  return data;
}

let desktop_device_auth_initialized = false;

export async function init_desktop_device_auth(): Promise<void> {
  if (!is_tauri()) return;
  if (desktop_device_auth_initialized) return;
  desktop_device_auth_initialized = true;

  try {
    const pubkeys = await invoke<DevicePubkeys>("device_get_pubkeys");

    if (!pubkeys.device_id) {
      window.dispatchEvent(
        new CustomEvent("astermail:device-needs-pairing", {
          detail: { pubkeys },
        }),
      );

      return;
    }

    await silent_device_login(pubkeys.device_id);
  } catch {
    // Pairing failed; UI will surface needs-pairing event when applicable
  }
}

export async function clear_device_session(): Promise<void> {
  if (!is_tauri()) return;
  await invoke("device_clear_session");
}

export async function clear_device_identity(): Promise<void> {
  if (!is_tauri()) return;
  await invoke("device_clear_identity");
}
