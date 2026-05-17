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

interface RecoveryShareData {
  code_hash: string;
  code_salt: string;
  encrypted_recovery_key: string;
  recovery_key_nonce: string;
}

interface ClientPgpKeyData {
  fingerprint: string;
  key_id: string;
  public_key_armored: string;
  ["encrypted_private_key"]: string;
  ["private_key_nonce"]: string;
  algorithm: string;
  key_size: number;
}

interface RegisterRequest {
  username: string;
  display_name?: string;
  profile_color?: string;
  email_domain?: string;
  user_hash: string;
  password_hash: string;
  password_salt: string;
  argon2_params: {
    memory: number;
    iterations: number;
    parallelism: number;
  };
  identity_key: string;
  signed_prekey: string;
  signed_prekey_signature: string;
  encrypted_vault: string;
  vault_nonce: string;
  remember_me?: boolean;
  encrypted_vault_backup?: string;
  vault_backup_nonce?: string;
  recovery_key_salt?: string;
  recovery_shares?: RecoveryShareData[];
  pgp_key?: ClientPgpKeyData;
  captcha_token?: string;
  referral_code?: string;
  client_platform?: string;
}

interface RegisterResponse {
  user_id: string;
  username: string;
  email: string;
  csrf_token: string;
  access_token?: string;
  recovery_email_required?: boolean;
}

interface GetSaltRequest {
  user_hash: string;
}

interface GetSaltResponse {
  salt: string;
}

interface LoginRequest {
  user_hash: string;
  password_hash: string;
  remember_me?: boolean;
  captcha_token?: string;
  client_platform?: string;
  is_adding_account?: boolean;
}

interface LoginResponse {
  user_id: string;
  username: string;
  email: string;
  csrf_token: string;
  encrypted_vault: string;
  vault_nonce: string;
  access_token?: string;
  needs_prekey_replenishment?: boolean;
  is_suspended?: boolean;
}

interface UserInfoResponse {
  user_id: string;
  username: string | null;
  email: string | null;
  display_name: string | null;
  profile_color: string | null;
  profile_picture: string | null;
  created_at: string;
  identity_key: string | null;
}

interface ReEncryptedAlias {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  alias_address_hash: string;
}

interface ReEncryptedContact {
  id: string;
  encrypted_data: string;
  data_nonce: string;
  contact_token: string;
}

interface RekeyRequest {
  re_encrypted_aliases?: ReEncryptedAlias[];
  re_encrypted_contacts?: ReEncryptedContact[];
}

interface RekeyResponse {
  success: boolean;
  aliases_updated: number;
  contacts_updated: number;
}

interface ChangePasswordRequest {
  current_password_hash: string;
  new_password_hash: string;
  new_password_salt: string;
  new_encrypted_vault: string;
  new_vault_nonce: string;
  re_encrypted_aliases?: ReEncryptedAlias[];
  re_encrypted_contacts?: ReEncryptedContact[];
}

interface ChangePasswordResponse {
  success: boolean;
  message: string;
  csrf_token?: string;
  access_token?: string;
}

interface LoginAlertsStatusResponse {
  enabled: boolean;
}

interface SetLoginAlertsResponse {
  success: boolean;
  enabled: boolean;
}

interface GetSessionKeyResponse {
  key: string;
}

export async function register_user(
  request: RegisterRequest,
): Promise<ApiResponse<RegisterResponse>> {
  const response = await api_client.post<RegisterResponse>(
    "/core/v1/auth/register",
    request,
  );

  if (response.data) {
    clear_csrf_cache();
    if (response.data.csrf_token) {
      api_client.set_csrf(response.data.csrf_token);
    }
    if (response.data.access_token) {
      api_client.set_dev_token(response.data.access_token, (response.data as { refresh_token?: string }).refresh_token);
    }
    api_client.set_authenticated(true);
  }

  return response;
}

export async function get_user_salt(
  request: GetSaltRequest,
): Promise<ApiResponse<GetSaltResponse>> {
  return api_client.post<GetSaltResponse>("/core/v1/auth/salt", request);
}

export async function login_user(
  request: LoginRequest,
): Promise<ApiResponse<LoginResponse>> {
  const response = await api_client.post<LoginResponse>(
    "/core/v1/auth/login",
    request,
  );

  if (response.data) {
    clear_csrf_cache();
    if (response.data.csrf_token) {
      api_client.set_csrf(response.data.csrf_token);
    }
    if (response.data.access_token) {
      api_client.set_dev_token(response.data.access_token, (response.data as { refresh_token?: string }).refresh_token);
    }
    api_client.set_authenticated(true);
  }

  return response;
}

export async function get_user_info(): Promise<ApiResponse<UserInfoResponse>> {
  return api_client.get<UserInfoResponse>("/core/v1/auth/me", {
    skip_cache: true,
  });
}

export async function logout_user(): Promise<void> {
  try {
    await api_client.post("/core/v1/auth/logout", {});
  } finally {
    api_client.set_authenticated(false);
  }
}

export function is_authenticated(): boolean {
  return api_client.is_authenticated();
}

export async function verify_auth_status(): Promise<boolean> {
  return api_client.verify_initial_auth();
}

export async function change_password(
  request: ChangePasswordRequest,
): Promise<ApiResponse<ChangePasswordResponse>> {
  return api_client.patch<ChangePasswordResponse>(
    "/core/v1/auth/me/password",
    request,
  );
}

export async function rekey_user_data(
  request: RekeyRequest,
): Promise<ApiResponse<RekeyResponse>> {
  return api_client.post<RekeyResponse>("/core/v1/auth/me/rekey", request);
}

export async function store_session_key(
  key: string,
): Promise<ApiResponse<{ message: string }>> {
  return api_client.post("/core/v1/auth/session-key", { key });
}

export async function get_session_key(): Promise<
  ApiResponse<GetSessionKeyResponse>
> {
  return api_client.get("/core/v1/auth/session-key", { skip_cache: true });
}

export async function get_login_alerts_status(): Promise<
  ApiResponse<LoginAlertsStatusResponse>
> {
  return api_client.get<LoginAlertsStatusResponse>(
    "/core/v1/auth/login-alerts",
  );
}

export async function set_login_alerts(
  enabled: boolean,
): Promise<ApiResponse<SetLoginAlertsResponse>> {
  return api_client.put<SetLoginAlertsResponse>("/core/v1/auth/login-alerts", {
    enabled,
  });
}

export type {
  RegisterRequest,
  RegisterResponse,
  GetSaltRequest,
  GetSaltResponse,
  LoginRequest,
  LoginResponse,
  UserInfoResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
};
