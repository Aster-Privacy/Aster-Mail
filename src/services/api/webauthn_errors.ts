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
import { get_active_translations } from "@/lib/i18n/translations";

export type SecurityKeyCeremony = "register" | "verify";

export type SecurityKeyErrorKind =
  | "canceled"
  | "timed_out"
  | "already_registered"
  | "not_supported"
  | "needs_pin"
  | "not_recognized"
  | "failed";

export const SECURITY_KEY_PROMPT_ERROR = "security_key_prompt_error";

const TIMEOUT_TOLERANCE_MS = 1000;

function error_name(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const name = (value as { name?: unknown }).name;

  return typeof name === "string" ? name : "";
}

export function classify_security_key_error(
  value: unknown,
  ceremony: SecurityKeyCeremony,
  elapsed_ms: number,
  timeout_ms: number,
): SecurityKeyErrorKind {
  switch (error_name(value)) {
    case "InvalidStateError":
      return ceremony === "register" ? "already_registered" : "failed";
    case "NotSupportedError":
    case "SecurityError":
      return "not_supported";
    case "ConstraintError":
      return "needs_pin";
    case "AbortError":
      return "canceled";
    case "NotAllowedError":
      if (timeout_ms > 0 && elapsed_ms >= timeout_ms - TIMEOUT_TOLERANCE_MS) {
        return "timed_out";
      }

      return ceremony === "verify" ? "not_recognized" : "canceled";
    default:
      return "failed";
  }
}

export function security_key_error_message(kind: SecurityKeyErrorKind): string {
  const common = get_active_translations().common;

  switch (kind) {
    case "canceled":
      return common.security_key_error_canceled;
    case "timed_out":
      return common.security_key_error_timed_out;
    case "already_registered":
      return common.security_key_error_already_registered;
    case "not_supported":
      return common.security_key_error_not_supported;
    case "needs_pin":
      return common.security_key_error_needs_pin;
    case "not_recognized":
      return common.security_key_error_not_recognized;
    default:
      return common.security_key_error_failed;
  }
}

export function describe_security_key_error(
  value: unknown,
  ceremony: SecurityKeyCeremony,
  elapsed_ms: number,
  timeout_ms: number,
): string {
  return security_key_error_message(
    classify_security_key_error(value, ceremony, elapsed_ms, timeout_ms),
  );
}
