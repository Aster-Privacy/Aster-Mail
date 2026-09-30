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
import { get_active_translations } from "@/lib/i18n/translations";

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
    return get_active_translations().errors.invalid_request;
  }

  return null;
}

function range_error(min: number, max: number): string {
  return get_active_translations()
    .errors.number_out_of_range.replace("{{min}}", String(min))
    .replace("{{max}}", String(max));
}

export function validate_port(port: number): string | null {
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    return get_active_translations().settings.smtp_port_error;
  }

  return null;
}

export function validate_hostname(
  host: string,
  required_message: string,
): string | null {
  if (!host || host.trim().length === 0) {
    return required_message;
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
    return range_error(MIN_MESSAGES_PER_SYNC, MAX_MESSAGES_PER_SYNC);
  }

  if (settings.sync_since_date !== null) {
    const parsed = Date.parse(settings.sync_since_date);

    if (isNaN(parsed)) {
      return get_active_translations().errors.invalid_date;
    }
  }

  if (!Array.isArray(settings.sync_folders)) {
    return get_active_translations().errors.invalid_request;
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
    return range_error(MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS);
  }

  if (
    !Number.isInteger(settings.idle_timeout_seconds) ||
    settings.idle_timeout_seconds < MIN_TIMEOUT_SECONDS ||
    settings.idle_timeout_seconds > MAX_TIMEOUT_SECONDS
  ) {
    return range_error(MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS);
  }

  if (
    !Number.isInteger(settings.max_concurrent_connections) ||
    settings.max_concurrent_connections < MIN_CONCURRENT_CONNECTIONS ||
    settings.max_concurrent_connections > MAX_CONCURRENT_CONNECTIONS
  ) {
    return range_error(MIN_CONCURRENT_CONNECTIONS, MAX_CONCURRENT_CONNECTIONS);
  }

  return null;
}
