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
import { api_client } from "./client";

export const MAX_ACCOUNT_KEY_HISTORY = 64;

export interface AccountKeyTokenResponse {
  token: string;
  key_fingerprint: string;
  version: number;
  updated_at: string;
}

export interface AccountKeyTokenHistoryEntry {
  token: string;
  key_fingerprint: string;
  version: number;
  archived_at: string;
}

export async function get_account_key_token(): Promise<AccountKeyTokenResponse | null> {
  const response = await api_client.get<AccountKeyTokenResponse>(
    "/crypto/v1/keys/account-key",
  );

  if (response.code === "NOT_FOUND") return null;
  if (response.error || !response.data?.token) {
    throw new Error("account key token unavailable");
  }

  return response.data;
}

export async function get_account_key_token_history(): Promise<
  AccountKeyTokenHistoryEntry[]
> {
  const response = await api_client.get<{
    entries: AccountKeyTokenHistoryEntry[];
  }>("/crypto/v1/keys/account-key/history");

  if (response.error || !Array.isArray(response.data?.entries)) {
    throw new Error("account key token history unavailable");
  }

  return response.data.entries.slice(0, MAX_ACCOUNT_KEY_HISTORY);
}

export async function put_account_key_token_if_absent(
  token: string,
  key_fingerprint: string,
): Promise<AccountKeyTokenResponse | null> {
  const response = await api_client.put<AccountKeyTokenResponse>(
    "/crypto/v1/keys/account-key",
    { token, key_fingerprint },
  );

  if (response.error || !response.data?.token) return null;

  return response.data;
}

export interface AccountKeyCapabilities {
  format_writes: boolean;
  data_conversion: boolean;
  device_recovery: boolean;
}

const CAPABILITIES_TTL_MS = 5 * 60 * 1000;
const CAPABILITIES_DISABLED: AccountKeyCapabilities = {
  format_writes: false,
  data_conversion: false,
  device_recovery: false,
};

let capabilities_cache: {
  value: AccountKeyCapabilities;
  fetched_at: number;
} | null = null;

export function reset_account_key_capabilities_cache(): void {
  capabilities_cache = null;
}

export async function get_account_key_capabilities(): Promise<AccountKeyCapabilities> {
  if (
    capabilities_cache &&
    Date.now() - capabilities_cache.fetched_at < CAPABILITIES_TTL_MS
  ) {
    return capabilities_cache.value;
  }

  try {
    const response = await api_client.get<{
      format_writes?: unknown;
      data_conversion?: unknown;
      device_recovery?: unknown;
    }>("/crypto/v1/keys/account-key/capabilities");
    const format_writes =
      !response.error && response.data?.format_writes === true;
    const value: AccountKeyCapabilities = {
      format_writes,
      data_conversion: format_writes && response.data?.data_conversion === true,
      device_recovery:
        !response.error && response.data?.device_recovery === true,
    };

    capabilities_cache = { value, fetched_at: Date.now() };

    return value;
  } catch {
    return CAPABILITIES_DISABLED;
  }
}

export interface AccountDataConversionStatus {
  enabled: boolean;
  sent_mail_done_at: string | null;
  preferences_done_at: string | null;
  converted_count: number;
  skipped_count: number;
  remaining_sent: number;
  remaining_attachments: number;
}

function is_count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export type ConversionWriteResult =
  "converted" | "already_converted" | "source_changed" | "failed";

export async function get_account_data_conversion(): Promise<AccountDataConversionStatus | null> {
  const response = await api_client.get<AccountDataConversionStatus>(
    "/crypto/v1/keys/account-key/conversion",
    { cache_ttl: 0 },
  );

  if (response.error || !response.data) return null;
  if (response.data.enabled !== true) return null;
  if (
    !is_count(response.data.remaining_sent) ||
    !is_count(response.data.remaining_attachments)
  ) {
    return null;
  }

  return response.data;
}

function conversion_write_result(response: {
  error?: string;
  data?: { status?: string };
  server_code?: string;
}): ConversionWriteResult {
  if (!response.error && response.data?.status === "converted") {
    return "converted";
  }
  if (response.server_code === "ALREADY_CONVERTED") return "already_converted";
  if (response.server_code === "CONVERSION_SOURCE_CHANGED") {
    return "source_changed";
  }

  return "failed";
}

export async function convert_sent_envelope(
  item_id: string,
  encrypted_envelope: string,
  expected_envelope_sha256: string,
): Promise<ConversionWriteResult> {
  const response = await api_client.put<{ status?: string }>(
    `/crypto/v1/keys/account-key/conversion/sent/${encodeURIComponent(item_id)}`,
    { encrypted_envelope, expected_envelope_sha256 },
  );

  return conversion_write_result(response);
}

export async function convert_attachment_meta(
  attachment_id: string,
  encrypted_meta: string,
  expected_meta_sha256: string,
): Promise<ConversionWriteResult> {
  const response = await api_client.put<{ status?: string }>(
    `/crypto/v1/keys/account-key/conversion/attachment/${encodeURIComponent(attachment_id)}`,
    { encrypted_meta, expected_meta_sha256 },
  );

  return conversion_write_result(response);
}

export interface ConversionProgress {
  sent_mail_done?: boolean;
  preferences_done?: boolean;
  converted?: number;
  skipped?: number;
}

export async function record_account_data_conversion(
  progress: ConversionProgress,
): Promise<boolean> {
  const response = await api_client.post<AccountDataConversionStatus>(
    "/crypto/v1/keys/account-key/conversion/progress",
    progress,
  );

  return !response.error;
}
