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
  recovery_email?: string;
  reservation_claim_token?: string;
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
  lockdown_mode_enabled?: boolean;
}

interface ReEncryptedAlias {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  alias_address_hash: string;
  encrypted_note?: string;
  note_nonce?: string;
}

interface ReEncryptedContact {
  id: string;
  encrypted_data: string;
  data_nonce: string;
  contact_token: string;
}

interface ReEncryptedPin {
  id: string;
  encrypted_sender: string;
  sender_nonce: string;
}

interface ReEncryptedAliasContact {
  id: string;
  encrypted_contact: string;
  contact_nonce: string;
}

interface ReEncryptedDestination {
  id: string;
  encrypted_destination: string;
  destination_nonce: string;
}

interface ReEncryptedDirectory {
  id: string;
  encrypted_label: string;
  label_nonce: string;
}

interface ReEncryptedDomainAddress {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  local_part_hash: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
}

interface RekeyRequest {
  re_encrypted_aliases?: ReEncryptedAlias[];
  re_encrypted_contacts?: ReEncryptedContact[];
  re_encrypted_pins?: ReEncryptedPin[];
  re_encrypted_alias_contacts?: ReEncryptedAliasContact[];
  re_encrypted_destinations?: ReEncryptedDestination[];
  re_encrypted_directories?: ReEncryptedDirectory[];
  re_encrypted_domain_addresses?: ReEncryptedDomainAddress[];
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
  re_encrypted_pins?: ReEncryptedPin[];
  re_encrypted_alias_contacts?: ReEncryptedAliasContact[];
  re_encrypted_destinations?: ReEncryptedDestination[];
  re_encrypted_directories?: ReEncryptedDirectory[];
  re_encrypted_domain_addresses?: ReEncryptedDomainAddress[];
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

export interface LoginEventEntry {
  id: string;
  device_type: string;
  browser: string;
  location: string | null;
  created_at: string;
}

interface LoginEventsResponse {
  events: LoginEventEntry[];
}

export async function get_login_events(): Promise<
  ApiResponse<LoginEventsResponse>
> {
  return api_client.get<LoginEventsResponse>("/core/v1/auth/login-events");
}

export interface InactivitySettingsResponse {
  inactivity_window_months: number;
}

export async function get_inactivity_settings(): Promise<
  ApiResponse<InactivitySettingsResponse>
> {
  return api_client.get<InactivitySettingsResponse>(
    "/core/v1/auth/inactivity-settings",
  );
}

export async function set_inactivity_settings(
  inactivity_window_months: number,
): Promise<ApiResponse<InactivitySettingsResponse>> {
  return api_client.put<InactivitySettingsResponse>(
    "/core/v1/auth/inactivity-settings",
    { inactivity_window_months },
  );
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
