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
}

const CAPABILITIES_TTL_MS = 5 * 60 * 1000;
const CAPABILITIES_DISABLED: AccountKeyCapabilities = { format_writes: false };

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
    const response = await api_client.get<{ format_writes?: unknown }>(
      "/crypto/v1/keys/account-key/capabilities",
    );
    const value: AccountKeyCapabilities = {
      format_writes: !response.error && response.data?.format_writes === true,
    };

    capabilities_cache = { value, fetched_at: Date.now() };

    return value;
  } catch {
    return CAPABILITIES_DISABLED;
  }
}
