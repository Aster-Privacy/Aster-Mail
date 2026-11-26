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
  ExternalAccountConnectionSettings,
  ExternalAccountMode,
  SendOnlyCredentials,
  ExternalFolderLink,
  ExternalFolderSpecialUse,
  ExternalSource,
  SourceNotifySetting,
  ExternalSyncMode,
  UpdateSyncSettingsResult,
  WritebackStatus,
  CleanupAfterDays,
  CleanupSettings,
  CleanupPreview,
  CleanupRun,
  ForwardingEntry,
  ForwardingCreated,
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

import { user_facing_error } from "@/utils/user_facing_error";
import { note_bulk_mail_removed } from "@/services/search/index_removals";
import { get_active_translations } from "@/lib/i18n/translations";
import { strip_outgoing_markers } from "@/lib/outgoing_markers";
import {
  get_external_account_health_generation,
  publish_external_account_health,
} from "@/stores/external_account_health_store";

export function external_account_error_message(
  server_code: string | undefined,
): string | undefined {
  const settings = get_active_translations().settings;

  switch (server_code) {
    case "EXTERNAL_ACCOUNT_SIGN_IN_REJECTED":
      return settings.external_sign_in_rejected;
    case "EXTERNAL_ACCOUNT_SERVER_UNREACHABLE":
      return settings.external_server_unreachable;
    case "EXTERNAL_ACCOUNT_RECONNECT_REQUIRED":
      return settings.external_reconnect_required;
    case "EXTERNAL_ACCOUNT_MESSAGE_REJECTED":
      return settings.external_message_rejected;
    case "EXTERNAL_ACCOUNT_SEND_RECONNECT_REQUIRED":
      return settings.external_send_reconnect_required;
    case "EXTERNAL_SMTP_VERIFY_FAILED":
      return settings.ext_v2_smtp_verify_failed;
    case "EXTERNAL_SEND_ONLY_CREDENTIALS_INVALID":
      return settings.ext_v2_send_only_credentials_invalid;
    case "EXTERNAL_MODE_INVALID":
    case "EXTERNAL_MODE_PROTOCOL_MISMATCH":
      return settings.ext_v2_mode_invalid;
    case "EXTERNAL_MODE_UNAVAILABLE":
      return settings.ext_v2_mode_unavailable;
    case "EXTERNAL_FROM_MISSING":
    case "EXTERNAL_FROM_NOT_VERIFIED":
      return settings.ext_v2_from_not_verified;
    case "EXTERNAL_ACCOUNT_PAUSED":
      return settings.ext_v2_account_paused_send;
    case "EXTERNAL_ACCOUNT_CHANGED":
      return settings.ext_v2_account_changed;
    case "EXTERNAL_MAIL_THROTTLED":
      return settings.ext_v2_test_throttled;
    case "SEND_ONLY_ACCOUNT_LIMIT":
      return settings.ext_v2_send_only_limit_reached;
    case "EXTERNAL_ACCOUNT_LIMIT":
      return settings.ext_v2_sync_limit_reached;
    case "EXTERNAL_TWO_WAY_UNSUPPORTED_PROTOCOL":
      return settings.ext_v2_two_way_needs_imap;
    case "EXTERNAL_TWO_WAY_UNVERIFIED":
      return settings.ext_v2_two_way_unverified;
    case "EXTERNAL_TWO_WAY_NEEDS_FOLDERS":
      return settings.ext_v2_two_way_needs_folders;
    case "EXTERNAL_CLEANUP_NEEDS_TWO_WAY":
      return settings.ext_v2_cleanup_needs_two_way;
    default:
      return undefined;
  }
}

export async function list_external_accounts(
  fallback_name = get_active_translations().settings
    .connected_accounts_fallback_name,
): Promise<ApiResponse<DecryptedExternalAccount[]>> {
  const health_generation = get_external_account_health_generation();

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

          const oauth_email_field = (item as { oauth_email?: string })
            .oauth_email;
          const looks_like_placeholder = /^oauth-[^@]+@import$/.test(
            data.email,
          );
          const effective_email =
            looks_like_placeholder && oauth_email_field
              ? oauth_email_field
              : looks_like_placeholder
                ? data.display_name || fallback_name
                : data.email;

          const oauth_provider_field =
            (item as { oauth_provider?: string | null }).oauth_provider ?? null;
          const raw = item as {
            needs_reauth?: boolean;
            has_folder_mapping?: boolean;
            last_sync_error?: string | null;
          };

          return {
            id: item.id,
            account_token: item.account_token,
            email: effective_email,
            display_name: data.display_name,
            label_name: data.label_name,
            label_color: data.label_color,
            protocol: item.protocol,
            oauth_provider: oauth_provider_field,
            is_enabled: item.is_enabled,
            is_verified: item.is_verified,
            mode: item.mode ?? "server_sync",
            paused_reason: item.paused_reason ?? null,
            last_sync_at: item.last_sync_at,
            last_sync_status: item.last_sync_status,
            last_sync_error: raw.last_sync_error ?? null,
            needs_reauth: raw.needs_reauth ?? false,
            has_folder_mapping: raw.has_folder_mapping,
            email_count: item.email_count,
            created_at: item.created_at,
            updated_at: item.updated_at,
          } as DecryptedExternalAccount;
        } catch {
          const fallback_email =
            (item as { oauth_email?: string }).oauth_email || fallback_name;
          const oauth_provider_field =
            (item as { oauth_provider?: string | null }).oauth_provider ?? null;
          const raw = item as {
            needs_reauth?: boolean;
            has_folder_mapping?: boolean;
            last_sync_error?: string | null;
          };

          return {
            id: item.id,
            account_token: item.account_token,
            email: fallback_email,
            display_name: fallback_email,
            label_name: "",
            label_color: "",
            protocol: item.protocol,
            oauth_provider: oauth_provider_field,
            is_enabled: item.is_enabled,
            is_verified: item.is_verified,
            mode: item.mode ?? "server_sync",
            paused_reason: item.paused_reason ?? null,
            last_sync_at: item.last_sync_at,
            last_sync_status: item.last_sync_status,
            last_sync_error: raw.last_sync_error ?? null,
            needs_reauth: raw.needs_reauth ?? false,
            has_folder_mapping: raw.has_folder_mapping,
            email_count: item.email_count,
            created_at: item.created_at,
            updated_at: item.updated_at,
          } as DecryptedExternalAccount;
        }
      }),
    );

    publish_external_account_health(decrypted, Date.now(), health_generation);

    return { data: decrypted };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().errors.load_failed,
      ),
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
  sync_since_date?: string | null,
  mode: ExternalAccountMode = "server_sync",
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
        sync_since_date: sync_since_date ?? undefined,
        mode,
      },
    );

    if (response.error || !response.data) {
      return external_failure(
        response,
        get_active_translations().common.save_failed,
      );
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().common.save_failed,
      ),
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
      return external_failure(
        response,
        get_active_translations().common.save_failed,
      );
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().common.save_failed,
      ),
    };
  }
}

function external_failure<T>(
  response: ApiResponse<T>,
  fallback: string,
): ApiResponse<ExternalAccountResponse> {
  return {
    error:
      external_account_error_message(response.server_code) ||
      response.error ||
      fallback,
    server_code: response.server_code,
    status: response.status,
    details: response.details,
  };
}

async function sealed_account_data(
  email: string,
  display_name: string,
  label_name: string,
  label_color: string,
) {
  const account_data: ExternalAccountData = {
    email,
    display_name,
    label_name,
    label_color,
    created_at: new Date().toISOString(),
  };

  return encrypt_account_data(account_data);
}

export async function create_send_only_account(
  credentials: SendOnlyCredentials,
  label_name: string,
  label_color: string,
): Promise<ApiResponse<ExternalAccountResponse>> {
  const fallback = get_active_translations().common.save_failed;

  try {
    const from_address = credentials.from_address.toLowerCase().trim();
    const from_name = credentials.from_name.trim();
    const account_token = await generate_account_token(from_address);
    const sealed = await sealed_account_data(
      from_address,
      from_name,
      label_name,
      label_color,
    );
    const response = await api_client.post<ExternalAccountResponse>(
      "/mail/v1/external_accounts",
      {
        account_token,
        ...sealed,
        credentials: { ...credentials, from_address, from_name },
        protocol: "smtp",
        mode: "send_only",
        is_enabled: true,
      },
    );

    if (response.error || !response.data) {
      return external_failure(response, fallback);
    }

    return { data: response.data };
  } catch (err) {
    return { error: user_facing_error(err, fallback) };
  }
}

export async function update_send_only_account(
  account_token: string,
  credentials: SendOnlyCredentials,
  label_name: string,
  label_color: string,
): Promise<ApiResponse<ExternalAccountResponse>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  const fallback = get_active_translations().common.save_failed;

  try {
    const from_address = credentials.from_address.toLowerCase().trim();
    const from_name = credentials.from_name.trim();
    const sealed = await sealed_account_data(
      from_address,
      from_name,
      label_name,
      label_color,
    );
    const response = await api_client.put<ExternalAccountResponse>(
      "/mail/v1/external_accounts/update",
      {
        account_token,
        ...sealed,
        credentials: { ...credentials, from_address, from_name },
        protocol: "smtp",
        mode: "send_only",
      },
    );

    if (response.error || !response.data) {
      return external_failure(response, fallback);
    }

    return { data: response.data };
  } catch (err) {
    return { error: user_facing_error(err, fallback) };
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
      return {
        error: response.error || get_active_translations().common.save_failed,
      };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().common.save_failed,
      ),
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

    if (!response.error) note_bulk_mail_removed();

    return response;
  } catch (err) {
    return {
      error: user_facing_error(err, get_active_translations().errors.generic),
    };
  }
}

export async function bulk_delete_external_accounts(
  account_tokens: string[],
): Promise<ApiResponse<{ success: boolean; deleted_count: number }>> {
  if (!Array.isArray(account_tokens) || account_tokens.length === 0) {
    return { error: get_active_translations().errors.invalid_request };
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

    if (!response.error) note_bulk_mail_removed();

    return response;
  } catch (err) {
    return {
      error: user_facing_error(err, get_active_translations().errors.generic),
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

    if (!response.error) note_bulk_mail_removed();

    return response;
  } catch (err) {
    return {
      error: user_facing_error(err, get_active_translations().errors.generic),
    };
  }
}

export async function test_external_connection(
  credentials: ExternalAccountCredentials & { protocol: string },
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  const host_error = validate_hostname(
    credentials.host,
    get_active_translations().settings.incoming_server_required,
  );

  if (host_error) {
    return { error: host_error };
  }

  const port_error = validate_port(credentials.port);

  if (port_error) {
    return { error: port_error };
  }

  const smtp_host_error = validate_hostname(
    credentials.smtp_host,
    get_active_translations().settings.smtp_server_required,
  );

  if (smtp_host_error) {
    return { error: smtp_host_error };
  }

  const smtp_port_error = validate_port(credentials.smtp_port);

  if (smtp_port_error) {
    return { error: smtp_port_error };
  }

  try {
    const response = await api_client.post<{
      success: boolean;
      message: string;
    }>("/mail/v1/external_accounts/test", credentials);

    if (response.error || !response.data) {
      return {
        error:
          response.error ||
          get_active_translations().settings.connection_test_failed,
      };
    }

    return { data: response.data };
  } catch {
    return { error: get_active_translations().settings.connection_test_failed };
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
      return {
        error: response.error || get_active_translations().errors.generic,
      };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(err, get_active_translations().errors.generic),
    };
  }
}

export async function cancel_sync(
  account_token: string,
): Promise<ApiResponse<{ success: boolean }>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  try {
    const response = await api_client.post<{ success: boolean }>(
      "/mail/v1/external_accounts/sync/cancel",
      { account_token },
    );

    if (response.error || !response.data) {
      return {
        error: response.error || get_active_translations().errors.generic,
      };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(err, get_active_translations().errors.generic),
    };
  }
}

const EXTERNAL_SEND_TIMEOUT_MS = 15 * 60_000;

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
  in_reply_to?: string,
  plain_text?: boolean,
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  if (to.length === 0 && cc.length === 0 && bcc.length === 0) {
    return { error: get_active_translations().errors.no_recipients };
  }

  try {
    const payload: Record<string, unknown> = {
      account_token,
      to,
      cc,
      bcc,
      subject,
      body: plain_text ? body : strip_outgoing_markers(body),
    };

    if (attachments && attachments.length > 0) {
      payload.attachments = attachments;
    }

    if (in_reply_to) {
      payload.in_reply_to = in_reply_to;
    }

    if (plain_text) {
      payload.plain_text = true;
    }

    const response = await api_client.post<{
      success: boolean;
      message: string;
    }>("/mail/v1/external_accounts/send", payload, {
      timeout: EXTERNAL_SEND_TIMEOUT_MS,
    });

    if (response.error || !response.data) {
      return {
        error:
          external_account_error_message(response.server_code) ||
          response.error ||
          get_active_translations().errors.failed_send_external,
        server_code: response.server_code,
      };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().errors.failed_send_external,
      ),
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
  const host_error = validate_hostname(
    credentials.host,
    get_active_translations().settings.incoming_server_required,
  );

  if (host_error) {
    return { error: host_error };
  }

  try {
    const response = await api_client.post<{
      folders: ExternalAccountFolder[];
    }>("/mail/v1/external_accounts/folders", credentials);

    if (response.error || !response.data) {
      return {
        error:
          external_account_error_message(response.server_code) ||
          response.error ||
          get_active_translations().errors.load_failed,
        server_code: response.server_code,
      };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().errors.load_failed,
      ),
    };
  }
}

export async function update_sync_settings(
  account_token: string,
  settings: ExternalAccountSyncSettings,
): Promise<ApiResponse<UpdateSyncSettingsResult>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  const settings_error = validate_sync_settings(settings);

  if (settings_error) {
    return { error: settings_error };
  }

  try {
    const response = await api_client.put<UpdateSyncSettingsResult>(
      "/mail/v1/external_accounts/sync_settings",
      { account_token, ...settings },
    );

    if (response.error || !response.data) {
      return {
        error:
          external_account_error_message(response.server_code) ||
          response.error ||
          get_active_translations().common.save_failed,
        server_code: response.server_code,
      };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().common.save_failed,
      ),
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
      return {
        error: response.error || get_active_translations().errors.load_failed,
      };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().errors.load_failed,
      ),
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
      return {
        error: response.error || get_active_translations().errors.generic,
      };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(err, get_active_translations().errors.generic),
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
      { cache_ttl: 0 },
    );

    if (response.error || !response.data) {
      return {
        error: response.error || get_active_translations().errors.load_failed,
      };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().errors.load_failed,
      ),
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
      return {
        error: response.error || get_active_translations().common.save_failed,
      };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().common.save_failed,
      ),
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
      return {
        error: response.error || get_active_translations().errors.load_failed,
      };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().errors.load_failed,
      ),
    };
  }
}

export async function get_connection_settings(
  account_token: string,
): Promise<ApiResponse<ExternalAccountConnectionSettings>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  try {
    const response = await api_client.get<ExternalAccountConnectionSettings>(
      `/mail/v1/external_accounts/connection_settings?account_token=${encodeURIComponent(account_token)}`,
    );

    if (response.error || !response.data) {
      return {
        error: response.error || get_active_translations().errors.load_failed,
      };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().errors.load_failed,
      ),
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
  const host_error = validate_hostname(
    credentials.smtp_host,
    get_active_translations().settings.smtp_server_required,
  );

  if (host_error) {
    return { error: host_error };
  }

  const port_error = validate_port(credentials.smtp_port);

  if (port_error) {
    return { error: port_error };
  }

  try {
    const response = await api_client.post<{
      success: boolean;
      message: string;
    }>("/mail/v1/external_accounts/test_smtp", credentials);

    if (response.error || !response.data) {
      return {
        error:
          response.error || get_active_translations().settings.smtp_test_failed,
      };
    }

    return { data: response.data };
  } catch {
    return { error: get_active_translations().settings.smtp_test_failed };
  }
}

export interface StartOAuthOptions {
  return_to?: string;
}

export async function start_oauth_authorize(
  provider: "google" | "microsoft" | "yahoo",
  tag_token?: Uint8Array,
  options?: StartOAuthOptions,
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

    if (options?.return_to) {
      body.return_to = options.return_to;
    }

    const response = await api_client.post<{ authorize_url: string }>(
      "/mail/v1/external_accounts/oauth/authorize",
      body,
    );

    if (response.error || !response.data) {
      return {
        error: response.error || get_active_translations().errors.generic,
      };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(err, get_active_translations().errors.generic),
    };
  }
}

export interface OAuthCompleteResult {
  success: boolean;
  provider?: string;
  reason?: string;
}

export async function complete_oauth_authorize(
  state: string,
  code: string,
): Promise<ApiResponse<OAuthCompleteResult>> {
  try {
    return await api_client.post<OAuthCompleteResult>(
      "/mail/v1/external_accounts/oauth/complete",
      { state, code },
    );
  } catch (err) {
    return {
      error: user_facing_error(err, "Failed to finish OAuth"),
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
      return {
        error: response.error || get_active_translations().errors.load_failed,
      };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().errors.load_failed,
      ),
    };
  }
}

export interface OAuthFolderInfo {
  name: string;
  delimiter: string;
  excluded: boolean;
  selectable?: boolean;
  special_use?: ExternalFolderSpecialUse | null;
}

export interface OAuthFolderList {
  folders: OAuthFolderInfo[];
  uses_labels?: boolean;
}

export async function list_oauth_folders(
  account_token: string,
): Promise<ApiResponse<OAuthFolderList>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  try {
    const response = await api_client.post<OAuthFolderList>(
      "/mail/v1/external_accounts/oauth/folders",
      { account_token },
      { timeout: 90000, retry: 1 },
    );

    if (response.error || !response.data) {
      return {
        error:
          external_account_error_message(response.server_code) ||
          response.error ||
          get_active_translations().errors.load_failed,
        server_code: response.server_code,
      };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().errors.load_failed,
      ),
    };
  }
}

export async function save_folder_mapping(
  account_token: string,
  folder_mapping: Record<string, string>,
  label_mapping: Record<string, string> = {},
  selected_folders?: string[],
  links?: ExternalFolderLink[],
): Promise<ApiResponse<{ success: boolean }>> {
  const token_error = validate_account_token(account_token);

  if (token_error) {
    return { error: token_error };
  }

  try {
    const payload: Record<string, unknown> = {
      account_token,
      folder_mapping,
      label_mapping,
    };

    if (selected_folders) {
      payload.selected_folders = selected_folders;
    }

    if (links) {
      payload.links = links;
    }

    const response = await api_client.put<{ success: boolean }>(
      "/mail/v1/external_accounts/folder_mapping",
      payload,
    );

    if (response.error || !response.data) {
      return {
        error: response.error || get_active_translations().common.save_failed,
      };
    }

    return { data: response.data };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().common.save_failed,
      ),
    };
  }
}

export async function list_external_sources(): Promise<
  ApiResponse<ExternalSource[]>
> {
  try {
    const response = await api_client.get<{ sources?: ExternalSource[] }>(
      "/mail/v1/external_accounts/sources",
    );

    if (response.error || !response.data) {
      return {
        error: response.error || get_active_translations().errors.load_failed,
      };
    }

    return { data: response.data.sources ?? [] };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().errors.load_failed,
      ),
    };
  }
}

export async function get_source_notify(): Promise<
  ApiResponse<SourceNotifySetting[]>
> {
  try {
    const response = await api_client.get<{
      sources?: SourceNotifySetting[];
    }>("/mail/v1/external_accounts/source_notify");

    if (response.error || !response.data) {
      return {
        error: response.error || get_active_translations().errors.load_failed,
      };
    }

    return { data: response.data.sources ?? [] };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().errors.load_failed,
      ),
    };
  }
}

export async function save_source_notify(
  sources: SourceNotifySetting[],
): Promise<ApiResponse<SourceNotifySetting[]>> {
  try {
    const response = await api_client.put<{
      sources?: SourceNotifySetting[];
    }>("/mail/v1/external_accounts/source_notify", { sources });

    if (response.error || !response.data) {
      return {
        error: response.error || get_active_translations().common.save_failed,
      };
    }

    return { data: response.data.sources ?? sources };
  } catch (err) {
    return {
      error: user_facing_error(
        err,
        get_active_translations().common.save_failed,
      ),
    };
  }
}

type ExternalFailure = "load" | "save";

function external_v2_failure<T>(
  response: ApiResponse<unknown>,
  kind: ExternalFailure,
): ApiResponse<T> {
  const t = get_active_translations();

  return {
    error:
      external_account_error_message(response.server_code) ||
      response.error ||
      (kind === "load" ? t.errors.load_failed : t.common.save_failed),
    server_code: response.server_code,
    status: response.status,
  };
}

function external_exception<T>(
  err: unknown,
  kind: ExternalFailure,
): ApiResponse<T> {
  const t = get_active_translations();

  return {
    error: user_facing_error(
      err,
      kind === "load" ? t.errors.load_failed : t.common.save_failed,
    ),
  };
}

const EXTERNAL_BASE = "/mail/v1/external_accounts";

function token_query(account_token: string): string {
  return `account_token=${encodeURIComponent(account_token)}`;
}

export async function get_writeback_status(
  account_token: string,
): Promise<ApiResponse<WritebackStatus>> {
  const token_error = validate_account_token(account_token);

  if (token_error) return { error: token_error };

  try {
    const response = await api_client.get<WritebackStatus>(
      `${EXTERNAL_BASE}/writeback_status?${token_query(account_token)}`,
    );

    if (response.error || !response.data) {
      return external_v2_failure(response, "load");
    }

    return { data: response.data };
  } catch (err) {
    return external_exception(err, "load");
  }
}

export async function set_sync_mode(
  account_token: string,
  mode: ExternalSyncMode,
): Promise<ApiResponse<UpdateSyncSettingsResult>> {
  const current = await get_sync_settings(account_token);

  if (current.error || !current.data) {
    return { error: current.error, server_code: current.server_code };
  }

  return update_sync_settings(account_token, {
    sync_frequency: current.data.sync_frequency,
    sync_folders: current.data.sync_folders,
    max_messages_per_sync: current.data.max_messages_per_sync,
    sync_since_date: current.data.sync_since_date,
    mode,
  });
}

function normalize_cleanup(raw: CleanupSettings): CleanupSettings {
  const days = raw.after_days;

  return {
    after_days: days === 7 || days === 30 || days === 90 ? days : null,
    confirmed: raw.confirmed === true,
    paused_reason: raw.paused_reason ?? null,
  };
}

function normalize_reasons(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }

  return out;
}

export async function get_cleanup_settings(
  account_token: string,
): Promise<ApiResponse<CleanupSettings>> {
  const token_error = validate_account_token(account_token);

  if (token_error) return { error: token_error };

  try {
    const response = await api_client.get<CleanupSettings>(
      `${EXTERNAL_BASE}/cleanup?${token_query(account_token)}`,
    );

    if (response.error || !response.data) {
      return external_v2_failure(response, "load");
    }

    return { data: normalize_cleanup(response.data) };
  } catch (err) {
    return external_exception(err, "load");
  }
}

export async function save_cleanup_settings(
  account_token: string,
  after_days: CleanupAfterDays | null,
): Promise<ApiResponse<CleanupSettings>> {
  const token_error = validate_account_token(account_token);

  if (token_error) return { error: token_error };

  try {
    const response = await api_client.put<CleanupSettings>(
      `${EXTERNAL_BASE}/cleanup`,
      { account_token, after_days },
    );

    if (response.error || !response.data) {
      return external_v2_failure(response, "save");
    }

    return { data: normalize_cleanup(response.data) };
  } catch (err) {
    return external_exception(err, "save");
  }
}

export async function preview_cleanup(
  account_token: string,
): Promise<ApiResponse<CleanupPreview>> {
  const token_error = validate_account_token(account_token);

  if (token_error) return { error: token_error };

  try {
    const response = await api_client.post<CleanupPreview>(
      `${EXTERNAL_BASE}/cleanup/preview`,
      { account_token },
    );

    if (response.error || !response.data) {
      return external_v2_failure(response, "load");
    }

    return {
      data: {
        ...response.data,
        folders: response.data.folders ?? [],
        skipped_reasons: normalize_reasons(response.data.skipped_reasons),
      },
    };
  } catch (err) {
    return external_exception(err, "load");
  }
}

export async function confirm_cleanup(
  account_token: string,
  preview_run_id: string,
): Promise<ApiResponse<CleanupSettings>> {
  const token_error = validate_account_token(account_token);

  if (token_error) return { error: token_error };

  try {
    const response = await api_client.post<CleanupSettings>(
      `${EXTERNAL_BASE}/cleanup/confirm`,
      { account_token, preview_run_id },
    );

    if (response.error || !response.data) {
      return external_v2_failure(response, "save");
    }

    return { data: normalize_cleanup(response.data) };
  } catch (err) {
    return external_exception(err, "save");
  }
}

export async function list_cleanup_runs(
  account_token: string,
  limit = 20,
): Promise<ApiResponse<CleanupRun[]>> {
  const token_error = validate_account_token(account_token);

  if (token_error) return { error: token_error };

  try {
    const response = await api_client.get<{ runs?: CleanupRun[] }>(
      `${EXTERNAL_BASE}/cleanup/log?${token_query(account_token)}&limit=${limit}`,
    );

    if (response.error || !response.data) {
      return external_v2_failure(response, "load");
    }

    return {
      data: (response.data.runs ?? []).map((run) => ({
        ...run,
        folders: run.folders ?? [],
        skipped_reasons: normalize_reasons(run.skipped_reasons),
      })),
    };
  } catch (err) {
    return external_exception(err, "load");
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function forwarding_path(id: string, action: string): string | null {
  if (!UUID_PATTERN.test(id)) return null;

  return `${EXTERNAL_BASE}/forwarding/${id}/${action}`;
}

export async function list_forwarding_addresses(): Promise<
  ApiResponse<ForwardingEntry[]>
> {
  try {
    const response = await api_client.get<{ forwarding?: ForwardingEntry[] }>(
      `${EXTERNAL_BASE}/forwarding`,
    );

    if (response.error || !response.data) {
      return external_v2_failure(response, "load");
    }

    return { data: response.data.forwarding ?? [] };
  } catch (err) {
    return external_exception(err, "load");
  }
}

export async function create_forwarding_address(
  account_id: string | null,
  tag_token: string | null,
): Promise<ApiResponse<ForwardingCreated>> {
  if (account_id !== null && !UUID_PATTERN.test(account_id)) {
    return { error: get_active_translations().common.save_failed };
  }

  try {
    const response = await api_client.post<ForwardingCreated>(
      `${EXTERNAL_BASE}/forwarding`,
      { account_id, tag_token },
    );

    if (response.error || !response.data) {
      return external_v2_failure(response, "save");
    }

    return { data: response.data };
  } catch (err) {
    return external_exception(err, "save");
  }
}

export async function set_forwarding_label(
  id: string,
  sealed: { encrypted_label: string; label_nonce: string },
): Promise<ApiResponse<{ updated: boolean }>> {
  const path = forwarding_path(id, "label");

  if (!path) return { error: get_active_translations().common.save_failed };

  try {
    const response = await api_client.put<{ updated: boolean }>(path, sealed);

    if (response.error || !response.data) {
      return external_v2_failure(response, "save");
    }

    return { data: response.data };
  } catch (err) {
    return external_exception(err, "save");
  }
}

export async function revoke_forwarding_address(
  id: string,
): Promise<ApiResponse<{ revoked: boolean }>> {
  const path = forwarding_path(id, "revoke");

  if (!path) return { error: get_active_translations().common.save_failed };

  try {
    const response = await api_client.post<{ revoked: boolean }>(path, {});

    if (response.error || !response.data) {
      return external_v2_failure(response, "save");
    }

    return { data: response.data };
  } catch (err) {
    return external_exception(err, "save");
  }
}

export async function rotate_forwarding_address(
  id: string,
): Promise<ApiResponse<ForwardingCreated>> {
  const path = forwarding_path(id, "rotate");

  if (!path) return { error: get_active_translations().common.save_failed };

  try {
    const response = await api_client.post<ForwardingCreated>(path, {});

    if (response.error || !response.data) {
      return external_v2_failure(response, "save");
    }

    return { data: response.data };
  } catch (err) {
    return external_exception(err, "save");
  }
}
