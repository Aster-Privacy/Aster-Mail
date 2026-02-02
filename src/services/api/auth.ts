import { api_client, ApiResponse } from "./client";
import { clear_csrf_cache } from "./csrf";

interface DefaultFolderData {
  label_token: string;
  encrypted_name: string;
  name_nonce: string;
  encrypted_color?: string;
  color_nonce?: string;
  sort_order: number;
  folder_type: string;
  is_password_protected: boolean;
}

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
  encrypted_private_key: string;
  private_key_nonce: string;
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
  default_folders?: DefaultFolderData[];
  remember_me?: boolean;
  referral_code?: string;
  encrypted_vault_backup?: string;
  vault_backup_nonce?: string;
  recovery_key_salt?: string;
  recovery_shares?: RecoveryShareData[];
  pgp_key?: ClientPgpKeyData;
}

interface RegisterResponse {
  user_id: string;
  username: string;
  email: string;
  csrf_token: string;
  access_token?: string;
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
}

interface LoginResponse {
  user_id: string;
  username: string;
  email: string;
  csrf_token: string;
  encrypted_vault: string;
  vault_nonce: string;
  access_token?: string;
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

interface ChangePasswordRequest {
  current_password_hash: string;
  new_password_hash: string;
  new_password_salt: string;
  new_encrypted_vault: string;
  new_vault_nonce: string;
}

interface ChangePasswordResponse {
  success: boolean;
  message: string;
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
    if (response.data.access_token) {
      api_client.set_dev_token(response.data.access_token);
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
  const response = await api_client.post<LoginResponse>("/core/v1/auth/login", request);

  if (response.data) {
    clear_csrf_cache();
    if (response.data.access_token) {
      api_client.set_dev_token(response.data.access_token);
    }
    api_client.set_authenticated(true);
  }

  return response;
}

export async function get_user_info(): Promise<ApiResponse<UserInfoResponse>> {
  return api_client.get<UserInfoResponse>("/core/v1/auth/me");
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
  return api_client.check_auth_status();
}

export async function change_password(
  request: ChangePasswordRequest,
): Promise<ApiResponse<ChangePasswordResponse>> {
  return api_client.patch<ChangePasswordResponse>("/core/v1/auth/me/password", request);
}

export async function get_login_alerts_status(): Promise<
  ApiResponse<LoginAlertsStatusResponse>
> {
  return api_client.get<LoginAlertsStatusResponse>("/core/v1/auth/login-alerts");
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
