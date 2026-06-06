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
import { api_client, type ApiResponse } from "./client";

export interface FamilyMemberInfo {
  user_id: string;
  username: string;
  email_domain: string;
  role: "owner" | "member";
  allocated_storage_bytes: number;
  storage_used_bytes: number;
  status: "active" | "grace" | "removed";
  joined_at: string;
}

export interface PendingInviteInfo {
  id: string;
  link_only: boolean;
  allocated_storage_bytes: number;
  expires_at: string;
  created_at: string;
  join_url?: string;
}

export interface FamilyGroupResponse {
  id: string;
  plan_code: string;
  plan_name: string;
  storage_pool_bytes: number;
  storage_used_bytes: number;
  status: "active" | "cancelled" | "grace";
  grace_period_end: string | null;
  members: FamilyMemberInfo[];
  pending_invites: PendingInviteInfo[];
  max_members: number;
  viewer_role: "owner" | "member";
}

export interface CreateFamilyGroupResponse {
  checkout_url: string;
  session_id: string;
}

export interface InviteMemberResponse {
  invite_id: string;
  join_url: string;
  expires_at: string;
}

export interface JoinFamilyResponse {
  family_group_id: string;
  plan_code: string;
  allocated_storage_bytes: number;
}

// Warm the shared request_cache so opening the Family tab is instant. We rely
// on api_client's request_cache (deduped + auto-invalidated on any mutation to
// /payments/v1/family) rather than a bespoke cache, so post-mutation reads are
// never stale.
export function prefetch_family_group(): void {
  void get_family_group();
}

export function get_family_group(): Promise<ApiResponse<FamilyGroupResponse>> {
  return api_client.get<FamilyGroupResponse>("/payments/v1/family");
}

export function create_family_group(
  plan_code: string,
  billing_interval: string,
  success_url?: string,
  cancel_url?: string
): Promise<ApiResponse<CreateFamilyGroupResponse>> {
  return api_client.post<CreateFamilyGroupResponse>("/payments/v1/family", {
    plan_code,
    billing_interval,
    success_url,
    cancel_url,
  });
}

export function invite_member(
  email: string | null,
  allocated_storage_bytes: number,
  captcha_token?: string
): Promise<ApiResponse<InviteMemberResponse>> {
  return api_client.post<InviteMemberResponse>("/payments/v1/family/invite", {
    email,
    allocated_storage_bytes,
    captcha_token,
  });
}

export function create_invite_link(
  allocated_storage_bytes: number,
  captcha_token?: string
): Promise<ApiResponse<InviteMemberResponse>> {
  return api_client.post<InviteMemberResponse>("/payments/v1/family/invite/link", {
    allocated_storage_bytes,
    captcha_token,
  });
}

export function revoke_invite(invite_id: string): Promise<ApiResponse<unknown>> {
  return api_client.delete<unknown>(`/payments/v1/family/invites/${invite_id}`);
}

export function join_family(token: string): Promise<ApiResponse<JoinFamilyResponse>> {
  return api_client.post<JoinFamilyResponse>("/payments/v1/family/join", { token });
}

export function remove_family_member(user_id: string): Promise<ApiResponse<unknown>> {
  return api_client.delete<unknown>(`/payments/v1/family/members/${user_id}`);
}

export function update_member_storage(
  user_id: string,
  allocated_storage_bytes: number
): Promise<ApiResponse<unknown>> {
  return api_client.patch<unknown>(`/payments/v1/family/members/${user_id}/storage`, {
    allocated_storage_bytes,
  });
}

export function transfer_family_admin(
  new_owner_user_id: string
): Promise<ApiResponse<unknown>> {
  return api_client.post<unknown>("/payments/v1/family/transfer-admin", {
    new_owner_user_id,
  });
}

export function leave_family(): Promise<ApiResponse<unknown>> {
  return api_client.post<unknown>("/payments/v1/family/leave", {});
}

export interface InvitePreview {
  plan_name: string | null;
  allocated_storage_bytes: number | null;
  require_2fa: boolean;
  valid: boolean;
}

export function preview_invite(token: string): Promise<ApiResponse<InvitePreview>> {
  return api_client.get<InvitePreview>(`/payments/v1/family/invites/${encodeURIComponent(token)}/preview`);
}
