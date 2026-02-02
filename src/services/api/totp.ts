import { api_client, ApiResponse } from "./client";
import { clear_csrf_cache } from "./csrf";

export interface TotpSetupInitiateResponse {
  secret: string;
  otpauth_uri: string;
  setup_token: string;
}

export interface TotpSetupVerifyRequest {
  code: string;
  setup_token: string;
}

export interface TotpSetupVerifyResponse {
  success: boolean;
  backup_codes: string[];
}

export interface TotpVerifyRequest {
  code: string;
  pending_login_token: string;
}

export interface TotpVerifyResponse {
  user_id: string;
  username: string;
  email: string;
  csrf_token: string;
  encrypted_vault: string;
  vault_nonce: string;
  access_token?: string;
}

export interface TotpBackupCodeRequest {
  code: string;
  pending_login_token: string;
}

export interface TotpStatusResponse {
  enabled: boolean;
  backup_codes_remaining: number;
  verified_at?: string;
}

export interface TotpDisableRequest {
  code: string;
  password_hash: string;
}

export interface TotpDisableResponse {
  success: boolean;
}

export interface TotpRegenerateBackupCodesRequest {
  code: string;
}

export interface TotpRegenerateBackupCodesResponse {
  backup_codes: string[];
}

export interface TotpRequiredResponse {
  totp_required: boolean;
  pending_login_token: string;
}

export async function initiate_totp_setup(): Promise<
  ApiResponse<TotpSetupInitiateResponse>
> {
  return api_client.post<TotpSetupInitiateResponse>(
    "/core/v1/auth/totp/setup/initiate",
    {},
  );
}

export async function verify_totp_setup(
  request: TotpSetupVerifyRequest,
): Promise<ApiResponse<TotpSetupVerifyResponse>> {
  return api_client.post<TotpSetupVerifyResponse>(
    "/core/v1/auth/totp/setup/verify",
    request,
  );
}

export async function verify_totp_login(
  request: TotpVerifyRequest,
): Promise<ApiResponse<TotpVerifyResponse>> {
  const response = await api_client.post<TotpVerifyResponse>(
    "/core/v1/auth/totp/verify",
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

export async function verify_backup_code_login(
  request: TotpBackupCodeRequest,
): Promise<ApiResponse<TotpVerifyResponse>> {
  const response = await api_client.post<TotpVerifyResponse>(
    "/core/v1/auth/totp/backup-code",
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

export async function get_totp_status(): Promise<
  ApiResponse<TotpStatusResponse>
> {
  return api_client.get<TotpStatusResponse>("/core/v1/auth/totp/status");
}

export async function disable_totp(
  request: TotpDisableRequest,
): Promise<ApiResponse<TotpDisableResponse>> {
  return api_client.post<TotpDisableResponse>("/core/v1/auth/totp/disable", request);
}

export async function regenerate_backup_codes(
  request: TotpRegenerateBackupCodesRequest,
): Promise<ApiResponse<TotpRegenerateBackupCodesResponse>> {
  return api_client.post<TotpRegenerateBackupCodesResponse>(
    "/core/v1/auth/totp/backup-codes/regenerate",
    request,
  );
}

export function is_totp_required_response(
  response: unknown,
): response is TotpRequiredResponse {
  return (
    typeof response === "object" &&
    response !== null &&
    "totp_required" in response &&
    (response as TotpRequiredResponse).totp_required === true
  );
}
