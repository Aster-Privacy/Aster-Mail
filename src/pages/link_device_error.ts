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
import type { TranslationKey } from "@/lib/i18n";

export interface LinkErrorResponse {
  error?: string;
  code?: string;
  resets_at?: string;
}

export interface LinkErrorClassification {
  key: TranslationKey;
  restart: boolean;
}

export function classify_link_error(
  response: LinkErrorResponse,
): LinkErrorClassification {
  const raw = (response.error || "").toLowerCase();
  const code = (response.code || "").toUpperCase();

  if (code === "NETWORK_ERROR" || code === "TIMEOUT_ERROR") {
    return { key: "errors.connection_failed", restart: false };
  }
  if (
    code === "CONFLICT" ||
    raw.includes("already enrolled") ||
    raw.includes("already linked")
  ) {
    return { key: "auth.link_device_already_linked", restart: false };
  }
  if (
    code === "RATE_LIMIT_EXCEEDED" ||
    Boolean(response.resets_at) ||
    raw.includes("rate limit") ||
    raw.includes("too many")
  ) {
    return { key: "auth.link_device_rate_limited", restart: false };
  }
  if (raw.includes("suspend")) {
    return { key: "auth.link_device_account_suspended", restart: false };
  }
  if (
    code === "NOT_FOUND" ||
    raw.includes("expired") ||
    raw.includes("not found") ||
    raw.includes("no longer") ||
    raw.includes("invalid or expired")
  ) {
    return { key: "auth.link_device_expired_code", restart: true };
  }

  return { key: "auth.link_device_failed", restart: false };
}
