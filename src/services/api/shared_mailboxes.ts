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
import { api_client, type ApiResponse } from "@/services/api/client";

export interface SharedMailboxGrantInfo {
  member_user_id: string;
  username: string | null;
  email_domain: string | null;
  credential_epoch: number;
  created_at: string;
}

export interface MyGrant {
  wrapped_grant: string;
  credential_epoch: number;
  encrypted_vault: string;
  vault_nonce: string;
  vault_updated_at: string;
  granted_by: string;
  granted_by_username: string;
  granted_by_email_domain: string;
}

export interface SharedMailboxInfo {
  id: string;
  mailbox_user_id: string;
  username: string;
  email_domain: string;
  encrypted_display_name: string | null;
  display_name_nonce: string | null;
  status: string;
  credential_epoch: number;
  rotation_required: boolean;
  allocated_storage_bytes: number;
  storage_used_bytes: number;
  created_at: string;
  my_grant: MyGrant | null;
  grants: SharedMailboxGrantInfo[];
}

export interface ListSharedMailboxesResponse {
  mailboxes: SharedMailboxInfo[];
  max_shared_mailboxes: number;
  viewer_is_owner: boolean;
}

export interface CreateSharedMailboxParams {
  username: string;
  email_domain: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  user_hash: string;
  password_hash: string;
  password_salt: string;
  argon2_params: { memory: number; iterations: number; parallelism: number };
  identity_key: string;
  signed_prekey: string;
  signed_prekey_signature: string;
  encrypted_vault: string;
  vault_nonce: string;
  vault_format: number;
  wrapped_grant: string;
  allocated_storage_bytes: number;
}

export interface RotateSharedMailboxParams {
  password_hash: string;
  password_salt: string;
  argon2_params: { memory: number; iterations: number; parallelism: number };
  encrypted_vault: string;
  vault_nonce: string;
  vault_format: number;
  expected_vault_updated_at: string;
  grants: { member_user_id: string; wrapped_grant: string }[];
}

export function list_shared_mailboxes(): Promise<
  ApiResponse<ListSharedMailboxesResponse>
> {
  return api_client.get<ListSharedMailboxesResponse>(
    "/payments/v1/family/shared-mailboxes",
  );
}

export function create_shared_mailbox(
  params: CreateSharedMailboxParams,
): Promise<ApiResponse<SharedMailboxInfo>> {
  return api_client.post<SharedMailboxInfo>(
    "/payments/v1/family/shared-mailboxes",
    params,
  );
}

export function add_shared_mailbox_grant(
  mailbox_id: string,
  member_user_id: string,
  wrapped_grant: string,
  credential_epoch: number,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.post<{ success: boolean }>(
    `/payments/v1/family/shared-mailboxes/${mailbox_id}/grants`,
    { member_user_id, wrapped_grant, credential_epoch },
  );
}

export function revoke_shared_mailbox_grant(
  mailbox_id: string,
  member_user_id: string,
): Promise<ApiResponse<{ success: boolean; rotation_required: boolean }>> {
  return api_client.delete<{ success: boolean; rotation_required: boolean }>(
    `/payments/v1/family/shared-mailboxes/${mailbox_id}/grants/${member_user_id}`,
  );
}

export function rotate_shared_mailbox(
  mailbox_id: string,
  params: RotateSharedMailboxParams,
): Promise<ApiResponse<{ success: boolean; credential_epoch: number }>> {
  return api_client.post<{ success: boolean; credential_epoch: number }>(
    `/payments/v1/family/shared-mailboxes/${mailbox_id}/rotate`,
    params,
  );
}

export function delete_shared_mailbox(
  mailbox_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/payments/v1/family/shared-mailboxes/${mailbox_id}`,
  );
}
