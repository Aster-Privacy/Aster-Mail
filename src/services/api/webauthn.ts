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
import type { ReauthProof } from "./step_up";

import { api_client, ApiResponse } from "./client";
import { clear_csrf_cache } from "./csrf";
import { TotpVerifyResponse } from "./totp";
import {
  SECURITY_KEY_PROMPT_ERROR,
  type SecurityKeyErrorKind,
  classify_security_key_error,
  describe_security_key_error,
  security_key_error_message,
} from "./webauthn_errors";

import { get_active_translations } from "@/lib/i18n/translations";
import {
  open_passkey_name,
  passkey_name_for_server,
} from "@/services/crypto/passkey_name";

export interface HardwareKeyInfo {
  id: string;
  name_encrypted: string | null;
  type: string;
  is_passkey: boolean;
  registered_at: string;
  last_used: string | null;
}

export interface HardwareKeysListResponse {
  keys: HardwareKeyInfo[];
}

export interface HardwareKeyRegistrationOptions {
  challenge: string;
  challenge_token: string;
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: string; alg: number }[];
  timeout: number;
  attestation: string;
  authenticatorSelection: {
    residentKey: string;
    userVerification: string;
  };
  excludeCredentials?: AllowedCredential[];
}

export interface HardwareKeyRegistrationCompleteResponse {
  key_id: string;
  success: boolean;
  other_sessions_revoked?: boolean;
}

export interface AllowedCredential {
  type: string;
  id: string;
}

export interface WebAuthnAssertionOptions {
  challenge: string;
  challenge_token: string;
  rpId: string;
  allowCredentials: AllowedCredential[];
  timeout: number;
  userVerification: string;
}

export const WEBAUTHN_PROMPT_DISMISSED = "webauthn_prompt_dismissed";
export const WEBAUTHN_PROMPT_FAILED = "webauthn_prompt_failed";

export interface StepUpHardwareKeyAssertion {
  raw_id: string;
  response: {
    authenticator_data: string;
    client_data_json: string;
    signature: string;
  };
  challenge_token: string;
}

function base64_url_to_array_buffer(base64_url: string): ArrayBuffer {
  let base64 = base64_url.replace(/-/g, "+").replace(/_/g, "/");

  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

function array_buffer_to_base64_url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function list_hardware_keys(): Promise<
  ApiResponse<HardwareKeysListResponse>
> {
  const response = await api_client.get<HardwareKeysListResponse>(
    "/core/v1/auth/hardware-keys",
  );

  if (!response.data?.keys) return response;

  const keys = await Promise.all(
    response.data.keys.map(async (key) => ({
      ...key,
      name_encrypted: await open_passkey_name(key.name_encrypted),
    })),
  );

  return { ...response, data: { ...response.data, keys } };
}

export async function initiate_hardware_key_registration(
  proof?: ReauthProof,
): Promise<ApiResponse<HardwareKeyRegistrationOptions>> {
  return api_client.post<HardwareKeyRegistrationOptions>(
    "/core/v1/auth/hardware-keys/register/initiate",
    proof ?? {},
  );
}

export async function complete_hardware_key_registration(request: {
  id: string;
  raw_id: string;
  response: {
    attestation_object: string;
    client_data_json: string;
  };
  type: string;
  name_encrypted: string | null;
  challenge_token: string;
  is_passkey: boolean;
}): Promise<ApiResponse<HardwareKeyRegistrationCompleteResponse>> {
  return api_client.post<HardwareKeyRegistrationCompleteResponse>(
    "/core/v1/auth/hardware-keys/register/complete",
    {
      ...request,
      name_encrypted: await passkey_name_for_server(request.name_encrypted),
    },
  );
}

export async function remove_hardware_key(
  key_id: string,
  credentials?: ReauthProof,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/core/v1/auth/hardware-keys/${key_id}`,
    credentials ? { data: credentials } : undefined,
  );
}

export async function rename_hardware_key(
  key_id: string,
  friendly_name: string | null,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.put<{ success: boolean }>(
    `/core/v1/auth/hardware-keys/${key_id}`,
    { friendly_name: await passkey_name_for_server(friendly_name) },
  );
}

export async function initiate_webauthn_assertion(
  pending_login_token: string,
): Promise<ApiResponse<WebAuthnAssertionOptions>> {
  return api_client.post<WebAuthnAssertionOptions>(
    "/core/v1/auth/hardware-keys/assert/initiate",
    { pending_login_token },
  );
}

export async function verify_webauthn_assertion(request: {
  id: string;
  raw_id: string;
  response: {
    authenticator_data: string;
    client_data_json: string;
    signature: string;
  };
  type: string;
  challenge_token: string;
  pending_login_token: string;
  remember_me?: boolean;
}): Promise<ApiResponse<TotpVerifyResponse>> {
  const response = await api_client.post<TotpVerifyResponse>(
    "/core/v1/auth/hardware-keys/assert/verify",
    request,
  );

  if (response.data) {
    clear_csrf_cache();
    if (response.data.access_token) {
      api_client.set_dev_token(
        response.data.access_token,
        (response.data as { refresh_token?: string }).refresh_token,
      );
    }
    api_client.set_authenticated(true);
  }

  return response;
}

export function build_registration_public_key(
  options: HardwareKeyRegistrationOptions,
): PublicKeyCredentialCreationOptions {
  return {
    challenge: base64_url_to_array_buffer(options.challenge),
    rp: { name: options.rp.name, id: options.rp.id },
    user: {
      id: base64_url_to_array_buffer(
        btoa(options.user.id)
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, ""),
      ),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredParams.map((p) => ({
      type: p.type as PublicKeyCredentialType,
      alg: p.alg,
    })),
    timeout: options.timeout,
    attestation: options.attestation as AttestationConveyancePreference,
    authenticatorSelection: {
      residentKey: options.authenticatorSelection
        .residentKey as ResidentKeyRequirement,
      userVerification: options.authenticatorSelection
        .userVerification as UserVerificationRequirement,
    },
    excludeCredentials: (options.excludeCredentials ?? []).map((c) => ({
      type: c.type as PublicKeyCredentialType,
      id: base64_url_to_array_buffer(c.id),
    })),
  };
}

export async function perform_webauthn_registration(
  options: HardwareKeyRegistrationOptions,
  friendly_name: string | null,
): Promise<ApiResponse<HardwareKeyRegistrationCompleteResponse>> {
  const public_key = build_registration_public_key(options);
  const started_at = Date.now();

  let credential: PublicKeyCredential | null;

  try {
    credential = (await navigator.credentials.create({
      publicKey: public_key,
    })) as PublicKeyCredential | null;
  } catch (err) {
    return {
      data: undefined,
      error: describe_security_key_error(
        err,
        "register",
        Date.now() - started_at,
        options.timeout,
      ),
      server_code: SECURITY_KEY_PROMPT_ERROR,
    };
  }

  if (!credential) {
    return {
      data: undefined,
      error: security_key_error_message("canceled"),
      server_code: SECURITY_KEY_PROMPT_ERROR,
    };
  }

  const attestation_response =
    credential.response as AuthenticatorAttestationResponse;

  return complete_hardware_key_registration({
    id: array_buffer_to_base64_url(credential.rawId),
    raw_id: array_buffer_to_base64_url(credential.rawId),
    response: {
      attestation_object: btoa(
        Array.from(
          new Uint8Array(attestation_response.attestationObject),
          (b) => String.fromCharCode(b),
        ).join(""),
      ),
      client_data_json: btoa(
        Array.from(new Uint8Array(attestation_response.clientDataJSON), (b) =>
          String.fromCharCode(b),
        ).join(""),
      ),
    },
    type: credential.type,
    name_encrypted: friendly_name,
    challenge_token: options.challenge_token,
    is_passkey: false,
  });
}

const SIGN_IN_TRANSPORTS: AuthenticatorTransport[] = [
  "internal",
  "hybrid",
  "usb",
  "nfc",
  "ble",
];

export function build_sign_in_request_options(
  options: WebAuthnAssertionOptions,
  discoverable = false,
): PublicKeyCredentialRequestOptions {
  return {
    challenge: base64_url_to_array_buffer(options.challenge),
    rpId: options.rpId,
    allowCredentials: discoverable
      ? []
      : options.allowCredentials.map((c) => ({
          type: c.type as PublicKeyCredentialType,
          id: base64_url_to_array_buffer(c.id),
          transports: [...SIGN_IN_TRANSPORTS],
        })),
    timeout: options.timeout,
    userVerification: options.userVerification as UserVerificationRequirement,
    ...(discoverable ? ({ hints: ["client-device"] } as object) : {}),
  };
}

function sign_in_prompt_failure(
  kind: SecurityKeyErrorKind,
): ApiResponse<TotpVerifyResponse> {
  const errors = get_active_translations().errors;

  switch (kind) {
    case "canceled":
    case "not_recognized":
      return {
        data: undefined,
        error: errors.passkey_sign_in_not_found,
        server_code: WEBAUTHN_PROMPT_DISMISSED,
      };
    case "timed_out":
      return {
        data: undefined,
        error: errors.passkey_sign_in_timed_out,
        server_code: WEBAUTHN_PROMPT_DISMISSED,
      };
    case "not_supported":
      return {
        data: undefined,
        error: errors.passkey_sign_in_not_supported,
        server_code: WEBAUTHN_PROMPT_FAILED,
      };
    default:
      return {
        data: undefined,
        error: errors.authentication_failed_webauthn,
        server_code: WEBAUTHN_PROMPT_FAILED,
      };
  }
}

export async function perform_webauthn_assertion(
  options: WebAuthnAssertionOptions,
  pending_login_token: string,
  remember_me?: boolean,
  discoverable = false,
): Promise<ApiResponse<TotpVerifyResponse>> {
  const public_key = build_sign_in_request_options(options, discoverable);
  const started_at = Date.now();

  let credential: PublicKeyCredential | null;

  try {
    credential = (await navigator.credentials.get({
      publicKey: public_key,
    })) as PublicKeyCredential | null;
  } catch (err) {
    return sign_in_prompt_failure(
      classify_security_key_error(
        err,
        "verify",
        Date.now() - started_at,
        options.timeout,
      ),
    );
  }

  if (!credential) {
    return sign_in_prompt_failure("not_recognized");
  }

  const assertion_response =
    credential.response as AuthenticatorAssertionResponse;

  return verify_webauthn_assertion({
    id: array_buffer_to_base64_url(credential.rawId),
    raw_id: array_buffer_to_base64_url(credential.rawId),
    response: {
      authenticator_data: array_buffer_to_base64_url(
        assertion_response.authenticatorData,
      ),
      client_data_json: array_buffer_to_base64_url(
        assertion_response.clientDataJSON,
      ),
      signature: array_buffer_to_base64_url(assertion_response.signature),
    },
    type: credential.type,
    challenge_token: options.challenge_token,
    pending_login_token,
    remember_me,
  });
}

export async function initiate_step_up_assertion(): Promise<
  ApiResponse<WebAuthnAssertionOptions>
> {
  return api_client.post<WebAuthnAssertionOptions>(
    "/core/v1/auth/hardware-keys/step-up/options",
    {},
  );
}

export async function perform_step_up_webauthn_assertion(): Promise<StepUpHardwareKeyAssertion> {
  const options_res = await initiate_step_up_assertion();

  if (options_res.error || !options_res.data) {
    throw new Error(
      options_res.error ||
        get_active_translations().errors.authentication_failed_webauthn,
    );
  }

  return perform_webauthn_assertion_with_options(options_res.data);
}

export async function step_up_key_assertion_if_enrolled(
  totp_required: boolean,
): Promise<StepUpHardwareKeyAssertion | undefined> {
  if (totp_required) return undefined;
  const keys = await list_hardware_keys();

  if (!keys.data) {
    throw new Error(keys.error || get_active_translations().errors.load_failed);
  }

  return keys.data.keys.length > 0
    ? perform_step_up_webauthn_assertion()
    : undefined;
}

export async function perform_webauthn_assertion_with_options(
  options: WebAuthnAssertionOptions,
): Promise<StepUpHardwareKeyAssertion> {
  return request_assertion(options, {
    challenge: base64_url_to_array_buffer(options.challenge),
    rpId: options.rpId,
    allowCredentials: options.allowCredentials.map((c) => ({
      type: c.type as PublicKeyCredentialType,
      id: base64_url_to_array_buffer(c.id),
    })),
    timeout: options.timeout,
    userVerification: options.userVerification as UserVerificationRequirement,
  });
}

function passkey_request_options(
  options: WebAuthnAssertionOptions,
): PublicKeyCredentialRequestOptions {
  return {
    challenge: base64_url_to_array_buffer(options.challenge),
    rpId: options.rpId,
    allowCredentials: [],
    timeout: options.timeout,
    userVerification: "required",
    ...({ hints: ["client-device"] } as object),
  };
}

export async function perform_passkey_assertion_with_options(
  options: WebAuthnAssertionOptions,
): Promise<StepUpHardwareKeyAssertion> {
  return request_assertion(options, passkey_request_options(options));
}

async function request_assertion(
  options: WebAuthnAssertionOptions,
  public_key: PublicKeyCredentialRequestOptions,
): Promise<StepUpHardwareKeyAssertion> {
  const started_at = Date.now();

  let credential: PublicKeyCredential | null;

  try {
    credential = (await navigator.credentials.get({
      publicKey: public_key,
      mediation: "required" as CredentialMediationRequirement,
    })) as PublicKeyCredential | null;
  } catch (err) {
    throw new Error(
      describe_security_key_error(
        err,
        "verify",
        Date.now() - started_at,
        options.timeout,
      ),
    );
  }

  if (!credential) {
    throw new Error(security_key_error_message("not_recognized"));
  }

  const assertion_response =
    credential.response as AuthenticatorAssertionResponse;

  return {
    raw_id: array_buffer_to_base64_url(credential.rawId),
    response: {
      authenticator_data: array_buffer_to_base64_url(
        assertion_response.authenticatorData,
      ),
      client_data_json: array_buffer_to_base64_url(
        assertion_response.clientDataJSON,
      ),
      signature: array_buffer_to_base64_url(assertion_response.signature),
    },
    challenge_token: options.challenge_token,
  };
}

export function is_webauthn_supported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}
