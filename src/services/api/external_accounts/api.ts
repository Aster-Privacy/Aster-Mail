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
  ExternalAccountData,
  ExternalAccountCredentials,
  ExternalAccountResponse,
  DecryptedExternalAccount,
  ExternalAccountSyncSettings,
  ExternalAccountFolder,
  ExternalAccountHealthStatus,
  SyncProgressEvent,
  ExternalAccountAdvancedSettings,
} from "./types";

import { api_client, type ApiResponse } from "../client";
import { array_to_base64 } from "../sender_utils";

import {
  generate_account_token,
  encrypt_account_data,
  decrypt_account_data,
} from "./crypto";
import {
  validate_account_token,
  validate_port,
  validate_hostname,
  validate_sync_settings,
  validate_advanced_settings,
} from "./validators";

export async function list_external_accounts(): Promise<
  ApiResponse<DecryptedExternalAccount[]>
> {
  try {
    const response = await api_client.get<{
      accounts: ExternalAccountResponse[];
      total: number;
    }>("/mail/v1/external_accounts");

    if (response.error) {
      return { error: response.error };
    }

    if (!response.data) {
      return { data: [] };
    }

    const decrypted = await Promise.all(
      response.data.accounts.map(async (item) => {
        try {
          const data = await decrypt_account_data(
            item.encrypted_account_data,
            item.account_data_nonce,
            item.integrity_hash,
          );

          return {
            id: item.id,
            account_token: item.account_token,
            email: data.email,
            display_name: data.display_name,
            label_name: data.label_name,
            label_color: data.label_color,
            protocol: item.protocol,
            is_enabled: item.is_enabled,
            is_verified: item.is_verified,
            last_sync_at: item.last_sync_at,
            last_sync_status: item.last_sync_status,
            email_count: item.email_count,
            created_at: item.created_at,
            updated_at: item.updated_at,
          } as DecryptedExternalAccount;
        } catch {
          const fallback_email =
            (item as { oauth_email?: string }).oauth_email || "Connected account";

          return {
            id: item.id,
            account_token: item.account_token,
            email: fallback_email,
            display_name: fallback_email,
            label_name: "",
            label_color: "",
            protocol: item.protocol,
            is_enabled: item.is_enabled,
            is_verified: item.is_verified,
            last_sync_at: item.last_sync_at,
            last_sync_status: item.last_sync_status,
            email_count: item.email_count,
            created_at: item.created_at,
            updated_at: item.updated_at,
          } as DecryptedExternalAccount;
        }
      }),
    );

    return { data: decrypted };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to list external accounts",
    };
  }
}

export async function create_external_account(
  email: string,
  display_name: string,
  label_name: string,
  label_color: string,
  credentials: ExternalAccountCredentials,
  protocol: string,
  tag_token?: string,
): Promise<ApiResponse<ExternalAccountResponse>> {
  try {
    const normalized_email = email.toLowerCase().trim();
    const account_token = await generate_account_token(normalized_email);
    const account_data: ExternalAccountData = {
      email: normalized_email,
      display_name,
      label_name,
      label_color,
      created_at: new Date().toISOString(),
    };
    const { encrypted_account_data, account_data_nonce, integrity_hash } =
      await encrypt_account_data(account_data);

    const response = await api_client.post<ExternalAccountResponse>(
      "/mail/v1/external_accounts",
      {
        account_token,
        encrypted_account_data,
        account_data_nonce,
        integrity_hash,
        credentials,
        protocol,
        is_enabled: true,
        tag_token,
      },
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to create external account" };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to create external account",
    };
  }
}

export async function update_external_account(
  account_token: string,
  email: string,
  display_name: string,
  label_name: string,
  label_color: string,
  credentials?: ExternalAccountCredentials,
  is_enabled?: boolean,
  tag_token?: string,
  protocol?: "imap" | "pop3",
): Promise<ApiResponse<ExternalAccountResponse>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  try {
    const normalized_email = email.toLowerCase().trim();
    const account_data: ExternalAccountData = {
      email: normalized_email,
      display_name,
      label_name,
      label_color,
      created_at: new Date().toISOString(),
    };
    const { encrypted_account_data, account_data_nonce, integrity_hash } =
      await encrypt_account_data(account_data);

    const response = await api_client.put<ExternalAccountResponse>(
      "/mail/v1/external_accounts/update",
      {
        account_token,
        encrypted_account_data,
        account_data_nonce,
        integrity_hash,
        credentials,
        is_enabled,
        tag_token,
        protocol,
      },
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to update external account" };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to update external account",
    };
  }
}

export async function toggle_external_account(
  account_token: string,
  is_enabled: boolean,
): Promise<ApiResponse<ExternalAccountResponse>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  try {
    const response = await api_client.patch<ExternalAccountResponse>(
      "/mail/v1/external_accounts/toggle",
      { account_token, is_enabled },
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to toggle external account" };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to toggle external account",
    };
  }
}

export async function delete_external_account(
  account_token: string,
): Promise<ApiResponse<{ success: boolean }>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  try {
    const response = await api_client.delete<{ success: boolean }>(
      `/mail/v1/external_accounts?account_token=${encodeURIComponent(account_token)}`,
    );

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to delete external account",
    };
  }
}

export async function bulk_delete_external_accounts(
  account_tokens: string[],
): Promise<ApiResponse<{ success: boolean; deleted_count: number }>> {
  if (!Array.isArray(account_tokens) || account_tokens.length === 0) {
    return { error: "At least one account token is required" };
  }

  for (const token of account_tokens) {
    const token_error = validate_account_token(token);

    if (token_error) {
      return { error: token_error };
    }
  }

  try {
    const response = await api_client.delete<{
      success: boolean;
      deleted_count: number;
    }>("/mail/v1/external_accounts/bulk", {
      data: { account_tokens },
    });

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to bulk delete external accounts",
    };
  }
}

export async function purge_external_account_mail(
  account_token: string,
): Promise<ApiResponse<{ success: boolean; deleted_count: number }>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  try {
    const response = await api_client.post<{
      success: boolean;
      deleted_count: number;
    }>("/mail/v1/external_accounts/purge_mail", {
      account_token,
    });

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to purge external account mail",
    };
  }
}

export async function test_external_connection(
  credentials: ExternalAccountCredentials & { protocol: string },
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  const host_error = validate_hostname(credentials.host, "IMAP host");

  if (host_error) {
    return { error: host_error };
  }

  const port_error = validate_port(credentials.port, "IMAP port");

  if (port_error) {
    return { error: port_error };
  }

  const smtp_host_error = validate_hostname(credentials.smtp_host, "SMTP host");

  if (smtp_host_error) {
    return { error: smtp_host_error };
  }

  const smtp_port_error = validate_port(credentials.smtp_port, "SMTP port");

  if (smtp_port_error) {
    return { error: smtp_port_error };
  }

  try {
    const response = await api_client.post<{
      success: boolean;
      message: string;
    }>("/mail/v1/external_accounts/test", credentials);

    if (response.error || !response.data) {
      return { error: response.error || "Failed to test external connection" };
    }

    return { data: response.data };
  } catch {
    return { error: "Failed to test external connection" };
  }
}

export async function trigger_sync(
  account_token: string,
  full_resync = false,
): Promise<
  ApiResponse<{ success: boolean; message: string; quota_exceeded: boolean }>
> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  try {
    const response = await api_client.post<{
      success: boolean;
      message: string;
      quota_exceeded: boolean;
    }>(
      "/mail/v1/external_accounts/sync",
      { account_token, full_resync },
      { timeout: 120000 },
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to trigger sync" };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to trigger sync",
    };
  }
}

export async function send_via_external_account(
  account_token: string,
  to: string[],
  cc: string[],
  bcc: string[],
  subject: string,
  body: string,
  attachments?: {
    data: string;
    filename: string;
    content_type: string;
    size_bytes: number;
  }[],
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  if (to.length === 0 && cc.length === 0 && bcc.length === 0) {
    return { error: "At least one recipient is required" };
  }

  try {
    const payload: Record<string, unknown> = {
      account_token,
      to,
      cc,
      bcc,
      subject,
      body,
    };

    if (attachments && attachments.length > 0) {
      payload.attachments = attachments;
    }

    const response = await api_client.post<{
      success: boolean;
      message: string;
    }>("/mail/v1/external_accounts/send", payload);

    if (response.error || !response.data) {
      return { error: response.error || "Failed to send via external account" };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to send via external account",
    };
  }
}

export async function list_account_folders(credentials: {
  host: string;
  port: number;
  username: string;
  password: string;
  protocol: string;
  use_tls: boolean;
}): Promise<ApiResponse<{ folders: ExternalAccountFolder[] }>> {
  const host_error = validate_hostname(credentials.host, "Host");

  if (host_error) {
    return { error: host_error };
  }

  try {
    const response = await api_client.post<{
      folders: ExternalAccountFolder[];
    }>("/mail/v1/external_accounts/folders", credentials);

    if (response.error || !response.data) {
      return { error: response.error || "Failed to list account folders" };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to list account folders",
    };
  }
}

export async function update_sync_settings(
  account_token: string,
  settings: ExternalAccountSyncSettings,
): Promise<ApiResponse<{ success: boolean }>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  const settings_error = validate_sync_settings(settings);

  if (settings_error) {
    return { error: settings_error };
  }

  try {
    const response = await api_client.put<{ success: boolean }>(
      "/mail/v1/external_accounts/sync_settings",
      { account_token, ...settings },
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to update sync settings" };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to update sync settings",
    };
  }
}

export async function get_sync_settings(
  account_token: string,
): Promise<ApiResponse<ExternalAccountSyncSettings>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  try {
    const response = await api_client.get<ExternalAccountSyncSettings>(
      `/mail/v1/external_accounts/sync_settings?account_token=${encodeURIComponent(account_token)}`,
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to get sync settings" };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to get sync settings",
    };
  }
}

export async function check_account_health(
  account_token: string,
): Promise<ApiResponse<ExternalAccountHealthStatus>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  try {
    const response = await api_client.post<ExternalAccountHealthStatus>(
      "/mail/v1/external_accounts/health",
      { account_token },
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to check account health" };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to check account health",
    };
  }
}

export async function get_sync_progress(
  account_token: string,
): Promise<ApiResponse<SyncProgressEvent>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  try {
    const response = await api_client.get<SyncProgressEvent>(
      `/mail/v1/external_accounts/sync_progress?account_token=${encodeURIComponent(account_token)}`,
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to get sync progress" };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to get sync progress",
    };
  }
}

export async function update_advanced_settings(
  account_token: string,
  settings: ExternalAccountAdvancedSettings,
): Promise<ApiResponse<{ success: boolean }>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  const settings_error = validate_advanced_settings(settings);

  if (settings_error) {
    return { error: settings_error };
  }

  try {
    const response = await api_client.put<{ success: boolean }>(
      "/mail/v1/external_accounts/advanced_settings",
      { account_token, ...settings },
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to update advanced settings" };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to update advanced settings",
    };
  }
}

export async function get_advanced_settings(
  account_token: string,
): Promise<ApiResponse<ExternalAccountAdvancedSettings>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  try {
    const response = await api_client.get<ExternalAccountAdvancedSettings>(
      `/mail/v1/external_accounts/advanced_settings?account_token=${encodeURIComponent(account_token)}`,
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to get advanced settings" };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to get advanced settings",
    };
  }
}

export async function test_smtp_connection(credentials: {
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  use_tls: boolean;
}): Promise<ApiResponse<{ success: boolean; message: string }>> {
  const host_error = validate_hostname(credentials.smtp_host, "SMTP host");

  if (host_error) {
    return { error: host_error };
  }

  const port_error = validate_port(credentials.smtp_port, "SMTP port");

  if (port_error) {
    return { error: port_error };
  }

  try {
    const response = await api_client.post<{
      success: boolean;
      message: string;
    }>("/mail/v1/external_accounts/test_smtp", credentials);

    if (response.error || !response.data) {
      return { error: response.error || "Failed to test SMTP connection" };
    }

    return { data: response.data };
  } catch {
    return { error: "Failed to test SMTP connection" };
  }
}

export async function start_oauth_authorize(
  provider: "google" | "microsoft" | "yahoo",
  tag_token?: Uint8Array,
): Promise<ApiResponse<{ authorize_url: string }>> {
  try {
    const provider_labels: Record<string, string> = {
      google: "Gmail",
      microsoft: "Outlook",
      yahoo: "Yahoo Mail",
    };

    const placeholder_email = `oauth-${provider}-${Date.now()}@import`;
    const account_token = await generate_account_token(placeholder_email);
    const account_data: ExternalAccountData = {
      email: placeholder_email,
      display_name: provider_labels[provider] ?? provider,
      label_name: "",
      label_color: "",
      created_at: new Date().toISOString(),
    };

    const { encrypted_account_data, account_data_nonce, integrity_hash } =
      await encrypt_account_data(account_data);

    const body: Record<string, string> = {
      provider,
      account_token,
      encrypted_account_data,
      account_data_nonce,
      integrity_hash,
    };

    if (tag_token) {
      body.tag_token = array_to_base64(tag_token);
    }

    const response = await api_client.post<{ authorize_url: string }>(
      "/mail/v1/external_accounts/oauth/authorize",
      body,
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to start OAuth" };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to start OAuth",
    };
  }
}

export async function get_dedup_stats(account_token: string): Promise<
  ApiResponse<{
    total_fetched: number;
    duplicates_skipped: number;
    last_uid: number;
  }>
> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  try {
    const response = await api_client.get<{
      total_fetched: number;
      duplicates_skipped: number;
      last_uid: number;
    }>(
      `/mail/v1/external_accounts/dedup_stats?account_token=${encodeURIComponent(account_token)}`,
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to get deduplication stats" };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to get deduplication stats",
    };
  }
}

export interface OAuthFolderInfo {
  name: string;
  delimiter: string;
  excluded: boolean;
}

export async function list_oauth_folders(
  account_token: string,
): Promise<ApiResponse<{ folders: OAuthFolderInfo[] }>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  try {
    const response = await api_client.post<{ folders: OAuthFolderInfo[] }>(
      "/mail/v1/external_accounts/oauth/folders",
      { account_token },
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to list folders" };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to list folders",
    };
  }
}

export async function save_folder_mapping(
  account_token: string,
  folder_mapping: Record<string, string>,
): Promise<ApiResponse<{ success: boolean }>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  try {
    const response = await api_client.put<{ success: boolean }>(
      "/mail/v1/external_accounts/folder_mapping",
      { account_token, folder_mapping },
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to save folder mapping" };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to save folder mapping",
    };
  }
}
