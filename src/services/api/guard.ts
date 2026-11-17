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
import type {
  StepUpHardwareKeyAssertion,
  WebAuthnAssertionOptions,
} from "./webauthn";

import { api_client, type ApiResponse, type RequestConfig } from "./client";
import { GUARD_TOKEN_HEADER, type GuardHoldKind } from "./client/helpers";
import { clear_csrf_cache } from "./csrf";
import { is_totp_required_response } from "./totp";

const GUARD_BASE = "/core/v1/guard";

export const GUARD_SWITCH = {
  new_device_approval: 1,
  hold_changes: 2,
  approve_mail_apps: 4,
  recovery_wait: 8,
} as const;

export const GUARD_SCOPE = {
  forwarding_rules: 1,
  recovery_password: 2,
  security_export: 4,
} as const;

export const GUARD_ALL_SCOPES =
  GUARD_SCOPE.forwarding_rules |
  GUARD_SCOPE.recovery_password |
  GUARD_SCOPE.security_export;

export const GUARD_ENVELOPE_VERSIONS: number[] = [2];

export type GuardDeviceType = "web" | "desktop" | "mobile";

export interface GuardSwitches {
  switches: number;
  hold_scopes: number;
}

export interface GuardDeviceKeys {
  ed25519_pk: string;
  mlkem_pk: string;
  x25519_pk: string;
  action_pk: string;
  device_type: GuardDeviceType;
  name: string;
}

export interface GuardDeviceSummary {
  id: string;
  name: string;
  device_type: GuardDeviceType;
  approved_at: string | null;
  long_trusted: boolean;
}

export interface GuardPendingChange {
  id: string;
  kind: GuardHoldKind;
  apply_after: string;
  created_at: string;
  subject_key?: string | null;
  created_by_device?: string | null;
  skippable?: boolean;
  cancellable?: boolean;
}

export type GuardSkipStatus = "applied" | "failed_stale";

export interface GuardThisDevice {
  id: string;
  long_trusted: boolean;
  approved_at: string | null;
}

export interface GuardStatus extends GuardSwitches {
  version: number;
  enrolled_at: string | null;
  recovery_wait_effective: boolean;
  paused_until: string | null;
  has_rescue_code: boolean;
  this_device: GuardThisDevice | null;
  devices: GuardDeviceSummary[];
  pending_changes: GuardPendingChange[];
}

export interface GuardNewDevice {
  device_type: GuardDeviceType | null;
  name: string | null;
  ed25519_pk: string;
  mlkem_pk: string;
  x25519_pk: string;
  action_pk: string | null;
  keys_digest: string;
}

export interface GuardRequestSummary {
  id: string;
  kind: "sign_in" | "join";
  created_at: string;
  expires_at: string;
  context: string | null;
  new_device: GuardNewDevice;
  envelope_versions: number[];
}

export type StepUpAssertion = StepUpHardwareKeyAssertion;

export type StepUpProof =
  | { type: "password"; password_hash: string; totp_code: string | null }
  | { type: "hardware_key"; assertion: StepUpAssertion }
  | { type: "passkey"; assertion: StepUpAssertion };

export interface SignedAction {
  nonce: string;
  signature: string;
  proof: StepUpProof | null;
}

export type GuardSignInStatus =
  | "created"
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "completed"
  | "rescue_pending";

export interface GuardSignInStatusResponse {
  status: GuardSignInStatus;
  expires_at: string;
  apply_after: string | null;
}

export interface GuardSignInGuardPart {
  device_id: string;
  code_secret_sealed: string;
  approval_envelope: string | null;
}

export type GuardSignInComplete = Record<string, unknown> & {
  guard: GuardSignInGuardPart;
};

export interface GuardNonce {
  nonce: string;
  expires_at: string;
}

export interface GuardResume {
  device_id: string;
  nonce: string;
  signature: string;
}

export interface GuardSignInBeginBody {
  device: GuardDeviceKeys;
  envelope_versions: number[];
  number_hash: string;
  resume: GuardResume | null;
}

export interface GuardSetupBody extends GuardSwitches {
  device: GuardDeviceKeys;
  nonce: string;
  possession_signature: string;
  rescue_code: string;
  proof: StepUpProof;
}

export interface GuardSetupResponse {
  device_id: string;
  code_secret_sealed: string;
  status: GuardStatus;
}

export interface GuardApproveBody {
  number: number;
  approval_envelope: string;
  action: SignedAction;
}

export interface GuardJoinBody {
  request_id: string;
  device: GuardDeviceKeys;
  envelope_versions: number[];
  number_hash: string;
  action: SignedAction;
}

export interface GuardJoinStatus {
  status: GuardSignInStatus;
  expires_at: string;
}

export interface GuardJoinComplete {
  device_id: string;
  code_secret_sealed: string;
  approval_envelope: string | null;
}

export interface GuardRescueStart {
  rescue_id: string;
  apply_after: string;
}

export type GuardRescueState = "pending" | "applied" | "vetoed" | "cancelled";

export interface GuardRescueStatus {
  status: GuardRescueState;
  apply_after: string;
}

export interface GuardChangeResult {
  status: "pending" | "applied" | "cancelled";
  result: Record<string, unknown> | null;
}

export interface GuardPanicResult {
  signed_out_sessions: number;
  removed_devices: number;
  cancelled_changes: number;
  can_reset_password_now: boolean;
}

export type GuardVetoBody =
  | { id: string; t: string }
  | { id: string; action: SignedAction };

function token_config(token: string): RequestConfig {
  return {
    headers: { [GUARD_TOKEN_HEADER]: token },
    skip_session_refresh: true,
    skip_cache: true,
  };
}

const fresh = { skip_cache: true };

function path_id(id: string): string {
  return encodeURIComponent(id);
}

export function guard_challenge(): Promise<ApiResponse<GuardNonce>> {
  return api_client.post<GuardNonce>(`${GUARD_BASE}/challenge`, {});
}

export function get_guard_status(): Promise<ApiResponse<GuardStatus>> {
  return api_client.get<GuardStatus>(GUARD_BASE, fresh);
}

export function guard_setup_nonce(): Promise<ApiResponse<GuardNonce>> {
  return api_client.post<GuardNonce>(`${GUARD_BASE}/setup/nonce`, {});
}

export function guard_setup(
  body: GuardSetupBody,
): Promise<ApiResponse<GuardSetupResponse>> {
  return api_client.post<GuardSetupResponse>(`${GUARD_BASE}/setup`, body);
}

export function put_guard_switches(
  body: GuardSwitches & { action: SignedAction },
): Promise<ApiResponse<GuardStatus>> {
  return api_client.put<GuardStatus>(`${GUARD_BASE}/switches`, body);
}

export function guard_step_up_passkey_options(): Promise<
  ApiResponse<WebAuthnAssertionOptions>
> {
  return api_client.post<WebAuthnAssertionOptions>(
    `${GUARD_BASE}/step-up/passkey/options`,
    {},
  );
}

export function guard_sign_in_resume_nonce(
  token: string,
  body: { device_id: string },
): Promise<ApiResponse<GuardNonce>> {
  return api_client.post<GuardNonce>(
    `${GUARD_BASE}/sign-in/resume-nonce`,
    body,
    token_config(token),
  );
}

export function guard_sign_in_begin(
  token: string,
  body: GuardSignInBeginBody,
): Promise<ApiResponse<{ status: GuardSignInStatus; expires_at: string }>> {
  return api_client.post<{ status: GuardSignInStatus; expires_at: string }>(
    `${GUARD_BASE}/sign-in/begin`,
    body,
    token_config(token),
  );
}

export function guard_sign_in_status(
  token: string,
): Promise<ApiResponse<GuardSignInStatusResponse>> {
  return api_client.get<GuardSignInStatusResponse>(
    `${GUARD_BASE}/sign-in/status`,
    token_config(token),
  );
}

export function guard_sign_in_code(
  token: string,
  code: string,
): Promise<ApiResponse<{ status: GuardSignInStatus }>> {
  return api_client.post<{ status: GuardSignInStatus }>(
    `${GUARD_BASE}/sign-in/code`,
    { code },
    token_config(token),
  );
}

export async function guard_sign_in_complete(
  token: string,
): Promise<ApiResponse<GuardSignInComplete>> {
  const response = await api_client.post<GuardSignInComplete>(
    `${GUARD_BASE}/sign-in/complete`,
    {},
    token_config(token),
  );
  const data = response.data;

  if (data && !is_totp_required_response(data)) {
    clear_csrf_cache();
    if (typeof data.csrf_token === "string" && data.csrf_token) {
      api_client.set_csrf(data.csrf_token);
    }
    if (typeof data.access_token === "string" && data.access_token) {
      api_client.set_dev_token(
        data.access_token,
        typeof data.refresh_token === "string" ? data.refresh_token : undefined,
      );
    }
    api_client.set_authenticated(true);
  }

  return response;
}

export function guard_sign_in_rescue(
  token: string,
  rescue_code: string,
): Promise<ApiResponse<GuardRescueStart>> {
  return api_client.post<GuardRescueStart>(
    `${GUARD_BASE}/sign-in/rescue`,
    { rescue_code },
    token_config(token),
  );
}

export function guard_rescue_status(
  rescue_id: string,
): Promise<ApiResponse<GuardRescueStatus>> {
  return api_client.get<GuardRescueStatus>(
    `${GUARD_BASE}/sign-in/rescue/status?id=${path_id(rescue_id)}`,
    { skip_cache: true, skip_session_refresh: true },
  );
}

export function list_guard_requests(): Promise<
  ApiResponse<{ requests: GuardRequestSummary[] }>
> {
  return api_client.get<{ requests: GuardRequestSummary[] }>(
    `${GUARD_BASE}/requests`,
    fresh,
  );
}

export function approve_guard_request(
  id: string,
  body: GuardApproveBody,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.post<{ status: string }>(
    `${GUARD_BASE}/requests/${path_id(id)}/approve`,
    body,
  );
}

export function deny_guard_request(
  id: string,
  action: SignedAction,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.post<{ status: string }>(
    `${GUARD_BASE}/requests/${path_id(id)}/deny`,
    { action },
  );
}

export function guard_join(
  body: GuardJoinBody,
): Promise<ApiResponse<{ request_id: string; expires_at: string }>> {
  return api_client.post<{ request_id: string; expires_at: string }>(
    `${GUARD_BASE}/join`,
    body,
  );
}

export function get_guard_join_status(
  request_id: string,
): Promise<ApiResponse<GuardJoinStatus>> {
  return api_client.get<GuardJoinStatus>(
    `${GUARD_BASE}/join/${path_id(request_id)}`,
    fresh,
  );
}

export function guard_join_complete(body: {
  request_id: string;
}): Promise<ApiResponse<GuardJoinComplete>> {
  return api_client.post<GuardJoinComplete>(
    `${GUARD_BASE}/join/complete`,
    body,
  );
}

export function list_guard_changes(): Promise<
  ApiResponse<{ changes: GuardPendingChange[] }>
> {
  return api_client.get<{ changes: GuardPendingChange[] }>(
    `${GUARD_BASE}/changes`,
    fresh,
  );
}

export function cancel_guard_change(
  id: string,
  action: SignedAction,
): Promise<ApiResponse<{ cancelled: boolean }>> {
  return api_client.post<{ cancelled: boolean }>(
    `${GUARD_BASE}/changes/${path_id(id)}/cancel`,
    { action },
  );
}

export function skip_guard_change(
  id: string,
  action: SignedAction,
  proof: StepUpProof | null,
): Promise<ApiResponse<{ status: GuardSkipStatus }>> {
  return api_client.post<{ status: GuardSkipStatus }>(
    `${GUARD_BASE}/changes/${path_id(id)}/skip`,
    { action: { ...action, proof: proof ?? action.proof } },
  );
}

export function get_guard_change_result(
  id: string,
): Promise<ApiResponse<GuardChangeResult>> {
  return api_client.get<GuardChangeResult>(
    `${GUARD_BASE}/changes/${path_id(id)}/result`,
    fresh,
  );
}

export function remove_guard_device(
  id: string,
  action: SignedAction,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.post<{ status: string }>(
    `${GUARD_BASE}/devices/${path_id(id)}/remove`,
    { action },
  );
}

export function guard_panic(
  action: SignedAction,
): Promise<ApiResponse<GuardPanicResult>> {
  return api_client.post<GuardPanicResult>(`${GUARD_BASE}/panic`, {
    action,
  });
}

export function guard_veto(
  body: GuardVetoBody,
): Promise<ApiResponse<{ status: "vetoed" }>> {
  return api_client.post<{ status: "vetoed" }>(`${GUARD_BASE}/veto`, body, {
    skip_session_refresh: !("action" in body),
  });
}
