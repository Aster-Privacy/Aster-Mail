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
  ExternalAccountSyncSettings,
  ExternalAccountAdvancedSettings,
} from "./types";

const MIN_PORT = 1;
const MAX_PORT = 65535;
const MIN_TIMEOUT_SECONDS = 1;
const MAX_TIMEOUT_SECONDS = 300;
const MIN_CONCURRENT_CONNECTIONS = 1;
const MAX_CONCURRENT_CONNECTIONS = 10;
const MIN_MESSAGES_PER_SYNC = 1;
const MAX_MESSAGES_PER_SYNC = 10000;

export function validate_account_token(account_token: string): string | null {
  if (!account_token || account_token.trim().length === 0) {
    return "Account token is required";
  }

  return null;
}

export function validate_port(port: number, label: string): string | null {
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    return `${label} must be an integer between ${MIN_PORT} and ${MAX_PORT}`;
  }

  return null;
}

export function validate_hostname(host: string, label: string): string | null {
  if (!host || host.trim().length === 0) {
    return `${label} is required`;
  }

  return null;
}

export function validate_sync_settings(
  settings: ExternalAccountSyncSettings,
): string | null {
  if (
    !Number.isInteger(settings.max_messages_per_sync) ||
    settings.max_messages_per_sync < MIN_MESSAGES_PER_SYNC ||
    settings.max_messages_per_sync > MAX_MESSAGES_PER_SYNC
  ) {
    return `Max messages per sync must be an integer between ${MIN_MESSAGES_PER_SYNC} and ${MAX_MESSAGES_PER_SYNC}`;
  }

  if (settings.sync_since_date !== null) {
    const parsed = Date.parse(settings.sync_since_date);

    if (isNaN(parsed)) {
      return "Sync since date must be a valid ISO date string";
    }
  }

  if (!Array.isArray(settings.sync_folders)) {
    return "Sync folders must be an array";
  }

  return null;
}

export function validate_advanced_settings(
  settings: ExternalAccountAdvancedSettings,
): string | null {
  if (
    !Number.isInteger(settings.connection_timeout_seconds) ||
    settings.connection_timeout_seconds < MIN_TIMEOUT_SECONDS ||
    settings.connection_timeout_seconds > MAX_TIMEOUT_SECONDS
  ) {
    return `Connection timeout must be an integer between ${MIN_TIMEOUT_SECONDS} and ${MAX_TIMEOUT_SECONDS} seconds`;
  }

  if (
    !Number.isInteger(settings.idle_timeout_seconds) ||
    settings.idle_timeout_seconds < MIN_TIMEOUT_SECONDS ||
    settings.idle_timeout_seconds > MAX_TIMEOUT_SECONDS
  ) {
    return `Idle timeout must be an integer between ${MIN_TIMEOUT_SECONDS} and ${MAX_TIMEOUT_SECONDS} seconds`;
  }

  if (
    !Number.isInteger(settings.max_concurrent_connections) ||
    settings.max_concurrent_connections < MIN_CONCURRENT_CONNECTIONS ||
    settings.max_concurrent_connections > MAX_CONCURRENT_CONNECTIONS
  ) {
    return `Max concurrent connections must be an integer between ${MIN_CONCURRENT_CONNECTIONS} and ${MAX_CONCURRENT_CONNECTIONS}`;
  }

  return null;
}
