//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { array_to_base64, base64_to_array } from "./base64";

import {
  load_opaque_client,
  OpaqueRejectedError,
  type OpaqueClient,
} from "./opaque_wasm";

import { api_client, type ApiResponse } from "@/services/api/client";

const LOGIN_V3_INFO = "aster-login-v3";
const LOGIN_V3_INPUT_BYTES = 32;
const PENDING_SIGN_IN_TTL_MS = 5 * 60 * 1000;
const START_PATH = "/core/v1/auth/login/v3/start";
const FINISH_PATH = "/core/v1/auth/login/v3/finish";
const ENROLL_START_PATH = "/core/v1/auth/me/password-v3/start";
const ENROLL_FINISH_PATH = "/core/v1/auth/me/password-v3/finish";
const LOGIN_VERSION = 3;

export function read_login_v3_flag(value: unknown): boolean {
  return value === true;
}

export async function derive_login_v3_input(
  v1_proof: string,
): Promise<Uint8Array> {
  const proof_bytes = base64_to_array(v1_proof);

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      proof_bytes,
      "HKDF",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(32),
        info: new TextEncoder().encode(LOGIN_V3_INFO),
      },
      key,
      LOGIN_V3_INPUT_BYTES * 8,
    );

    return new Uint8Array(bits);
  } finally {
    proof_bytes.fill(0);
  }
}

let pending_sign_in: {
  user_hash: string;
  v1_proof: string;
  created_at: number;
} | null = null;

export function set_pending_login_v3(user_hash: string, v1_proof: string): void {
  pending_sign_in = { user_hash, v1_proof, created_at: Date.now() };
}

export function clear_pending_login_v3(): void {
  pending_sign_in = null;
}

export function take_pending_login_v3(user_hash: string): string | null {
  const pending = pending_sign_in;

  pending_sign_in = null;

  if (
    !pending ||
    pending.user_hash !== user_hash ||
    Date.now() - pending.created_at > PENDING_SIGN_IN_TTL_MS
  ) {
    return null;
  }

  return pending.v1_proof;
}

export interface LoginV3Request {
  user_hash: string;
  remember_me?: boolean;
  captcha_token?: string;
  client_platform?: string;
}

interface LoginV3StartResponse {
  state_id?: unknown;
  credential_response?: unknown;
}

function is_method_unavailable(response: ApiResponse<unknown>): boolean {
  return response.status === 404 || response.status === 503;
}

function invalid_credentials<T>(): ApiResponse<T> {
  return {
    error: "Invalid credentials",
    code: "UNAUTHORIZED",
    status: 401,
    server_code: "INVALID_CREDENTIALS",
  };
}

export async function sign_in_v3<T>(
  request: LoginV3Request,
  v1_proof: string,
): Promise<ApiResponse<T> | null> {
  let client: OpaqueClient;
  let input: Uint8Array;

  try {
    client = await load_opaque_client();
    input = await derive_login_v3_input(v1_proof);
  } catch {
    return null;
  }

  try {
    let started;

    try {
      started = client.login_start(input);
    } catch {
      return null;
    }

    const start_response = await api_client.post<LoginV3StartResponse>(
      START_PATH,
      {
        user_hash: request.user_hash,
        credential_request: array_to_base64(started.message),
        remember_me: request.remember_me,
        captcha_token: request.captcha_token,
        client_platform: request.client_platform,
      },
    );

    if (!start_response.data) {
      started.state.fill(0);

      return is_method_unavailable(start_response)
        ? null
        : (start_response as ApiResponse<T>);
    }

    const { state_id, credential_response } = start_response.data;
    let finalization: Uint8Array;

    try {
      if (typeof state_id !== "string" || typeof credential_response !== "string") {
        throw new OpaqueRejectedError();
      }
      finalization = client.login_finish(
        started.state,
        input,
        base64_to_array(credential_response),
      );
    } catch {
      return invalid_credentials<T>();
    } finally {
      started.state.fill(0);
    }

    return await api_client.post<T>(FINISH_PATH, {
      state_id,
      credential_finalization: array_to_base64(finalization),
    });
  } finally {
    input.fill(0);
  }
}

interface EnrollStartResponse {
  registration_response?: unknown;
}

interface EnrollFinishResponse {
  login_version?: unknown;
}

export async function enroll_login_v3(
  v1_proof: string,
  password_proof: string,
): Promise<boolean> {
  let input: Uint8Array | null = null;

  try {
    const client = await load_opaque_client();

    input = await derive_login_v3_input(v1_proof);

    const started = client.registration_start(input);

    try {
      const start_response = await api_client.post<EnrollStartResponse>(
        ENROLL_START_PATH,
        { registration_request: array_to_base64(started.message) },
      );
      const registration_response = start_response.data?.registration_response;

      if (typeof registration_response !== "string") {
        return false;
      }

      const upload = client.registration_finish(
        started.state,
        input,
        base64_to_array(registration_response),
      );
      const finish_response = await api_client.post<EnrollFinishResponse>(
        ENROLL_FINISH_PATH,
        {
          password_hash: password_proof,
          registration_upload: array_to_base64(upload),
        },
      );

      return finish_response.data?.login_version === LOGIN_VERSION;
    } finally {
      started.state.fill(0);
    }
  } catch {
    return false;
  } finally {
    input?.fill(0);
  }
}
