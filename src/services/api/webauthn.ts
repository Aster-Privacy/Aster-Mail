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
import { api_client, ApiResponse } from "./client";
import { clear_csrf_cache } from "./csrf";
import { TotpVerifyResponse } from "./totp";
import { en } from "@/lib/i18n/translations/en";

export interface HardwareKeyInfo {
  id: string;
  name_encrypted: string | null;
  type: string;
  registered_at: string;
  last_used: string | null;
}

export interface HardwareKeysListResponse {
  keys: HardwareKeyInfo[];
}

export interface HardwareKeyRegistrationOptions {
  challenge: string;
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: string; alg: number }[];
  timeout: number;
  attestation: string;
  authenticatorSelection: {
    residentKey: string;
    userVerification: string;
  };
}

export interface HardwareKeyRegistrationCompleteResponse {
  key_id: string;
  success: boolean;
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
  return api_client.get<HardwareKeysListResponse>(
    "/core/v1/auth/hardware-keys",
  );
}

export async function initiate_hardware_key_registration(): Promise<
  ApiResponse<HardwareKeyRegistrationOptions>
> {
  return api_client.post<HardwareKeyRegistrationOptions>(
    "/core/v1/auth/hardware-keys/register/initiate",
    {},
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
}): Promise<ApiResponse<HardwareKeyRegistrationCompleteResponse>> {
  return api_client.post<HardwareKeyRegistrationCompleteResponse>(
    "/core/v1/auth/hardware-keys/register/complete",
    request,
  );
}

export async function remove_hardware_key(
  key_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/core/v1/auth/hardware-keys/${key_id}`,
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
}): Promise<ApiResponse<TotpVerifyResponse>> {
  const response = await api_client.post<TotpVerifyResponse>(
    "/core/v1/auth/hardware-keys/assert/verify",
    request,
  );

  if (response.data) {
    clear_csrf_cache();
    if (response.data.access_token) {
      api_client.set_dev_token(response.data.access_token);
    }
    api_client.set_authenticated(true);
  }

  return response;
}

export async function perform_webauthn_registration(
  options: HardwareKeyRegistrationOptions,
  friendly_name: string | null,
): Promise<ApiResponse<HardwareKeyRegistrationCompleteResponse>> {
  const public_key: PublicKeyCredentialCreationOptions = {
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
  };

  let credential: PublicKeyCredential | null;

  try {
    credential = (await navigator.credentials.create({
      publicKey: public_key,
    })) as PublicKeyCredential | null;
  } catch {
    return { data: undefined, error: en.errors.registration_failed };
  }

  if (!credential) {
    return { data: undefined, error: en.errors.registration_cancelled };
  }

  const attestation_response =
    credential.response as AuthenticatorAttestationResponse;

  return complete_hardware_key_registration({
    id: array_buffer_to_base64_url(credential.rawId),
    raw_id: array_buffer_to_base64_url(credential.rawId),
    response: {
      attestation_object: btoa(
        String.fromCharCode(
          ...new Uint8Array(attestation_response.attestationObject),
        ),
      ),
      client_data_json: btoa(
        String.fromCharCode(
          ...new Uint8Array(attestation_response.clientDataJSON),
        ),
      ),
    },
    type: credential.type,
    name_encrypted: friendly_name,
  });
}

export async function perform_webauthn_assertion(
  options: WebAuthnAssertionOptions,
  pending_login_token: string,
): Promise<ApiResponse<TotpVerifyResponse>> {
  const public_key: PublicKeyCredentialRequestOptions = {
    challenge: base64_url_to_array_buffer(options.challenge),
    rpId: options.rpId,
    allowCredentials: options.allowCredentials.map((c) => ({
      type: c.type as PublicKeyCredentialType,
      id: base64_url_to_array_buffer(c.id),
    })),
    timeout: options.timeout,
    userVerification: options.userVerification as UserVerificationRequirement,
  };

  let credential: PublicKeyCredential | null;

  try {
    credential = (await navigator.credentials.get({
      publicKey: public_key,
    })) as PublicKeyCredential | null;
  } catch {
    return { data: undefined, error: en.errors.authentication_failed_webauthn };
  }

  if (!credential) {
    return { data: undefined, error: en.errors.authentication_cancelled };
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
  });
}

export function is_webauthn_supported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}
