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
import type { TranslationKey } from "@/lib/i18n/types";

import { server_now } from "@/lib/server_clock";

export interface GuardErrorSource {
  server_code?: string | null;
  code?: string | null;
  status?: number;
  retry_after_secs?: number;
  details?: unknown;
  held?: { apply_after?: string | null } | null;
}

export interface GuardErrorMessage {
  key: TranslationKey;
  params?: Record<string, string>;
  extra?: { key: TranslationKey; params?: Record<string, string | number> };
}

export type StepUpField = "password" | "code" | "key" | "all";

export interface StepUpRejection {
  field: StepUpField;
  message: GuardErrorMessage;
}

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

const SOON_SECS = 90;

export function format_guard_wait_time(iso: string): string {
  const ms = Date.parse(iso);

  if (Number.isNaN(ms)) return "";

  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const FIXED_KEYS: Record<string, TranslationKey> = {
  GUARD_REQUEST_GONE: "guard.error_request_gone",
  GUARD_DEVICE_REQUIRED: "guard.error_device_required",
  GUARD_NOT_ALLOWED: "guard.error_not_allowed",
  GUARD_WRONG_NUMBER: "guard.approve_number_rejected",
  GUARD_CODE_INVALID: "guard.sign_in_code_wrong",
  GUARD_DISABLED: "guard.error_disabled",
  GUARD_RESCUE_CODE_INVALID: "guard.sign_in_rescue_invalid",
  GUARD_REQUEST_CONFLICT: "guard.error_request_conflict",
  GUARD_LAST_DEVICE: "guard.error_last_device",
  GUARD_ALREADY_ON: "guard.setup_already_on",
  CLIENT_UPGRADE_REQUIRED: "guard.error_upgrade",
  GUARD_ACTION_INVALID: "guard.error_action_invalid",
  STEP_UP_REQUIRED: "guard.error_step_up",
  GUARD_INVALID_KEY: "guard.error_device_keys",
  GUARD_ENVELOPE_REQUIRED: "guard.error_device_keys",
  GUARD_ENVELOPE_UNSUPPORTED: "guard.error_device_keys",
  GUARD_DEVICE_TYPE_INVALID: "guard.error_device_keys",
  GUARD_DEVICE_UNKNOWN: "guard.error_device_unknown",
  GUARD_VETO_INVALID: "guard.error_veto_invalid",
};

const OFFLINE_CODES = new Set(["NETWORK_ERROR", "TIMEOUT_ERROR"]);

export function guard_retry_at(
  retry_after_secs: number | undefined,
  now: number = server_now(),
): string | null {
  if (typeof retry_after_secs !== "number" || !(retry_after_secs > 0)) {
    return null;
  }

  return new Date(now + retry_after_secs * 1000).toISOString();
}

function detail_text(details: unknown, field: string): string | null {
  if (!details || typeof details !== "object") return null;
  const value = (details as Record<string, unknown>)[field];

  return typeof value === "string" && value ? value : null;
}

function timed(
  with_time: TranslationKey,
  without_time: TranslationKey,
  iso: string | null,
): GuardErrorMessage {
  const time = iso ? format_guard_wait_time(iso) : "";

  return time ? { key: with_time, params: { time } } : { key: without_time };
}

function wait_message(
  with_time: TranslationKey,
  without_time: TranslationKey,
  retry_after_secs: number | undefined,
  now: number,
): GuardErrorMessage {
  if (!retry_after_secs || retry_after_secs <= SOON_SECS) {
    return { key: without_time };
  }

  return timed(with_time, without_time, guard_retry_at(retry_after_secs, now));
}

const ATTEMPTS_WARNING_AT = 5;

function detail_number(details: unknown, field: string): number | null {
  if (!details || typeof details !== "object") return null;
  const value = (details as Record<string, unknown>)[field];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function detail_flag(details: unknown, field: string): boolean {
  if (!details || typeof details !== "object") return false;

  return (details as Record<string, unknown>)[field] === true;
}

function with_attempts_left(
  message: GuardErrorMessage,
  details: unknown,
): GuardErrorMessage {
  const left = detail_number(details, "attempts_remaining");

  if (left === null || left <= 0 || left > ATTEMPTS_WARNING_AT) return message;

  return {
    ...message,
    extra: { key: "guard.step_up_attempts_left", params: { count: left } },
  };
}

export function step_up_rejection(
  source: GuardErrorSource | null | undefined,
  now: number = server_now(),
): StepUpRejection | null {
  if (!source) return null;
  const code = source.server_code ?? undefined;
  const details = source.details;

  if (code === "ACCOUNT_LOCKED") {
    const secs =
      detail_number(details, "retry_after_seconds") ?? source.retry_after_secs;

    return {
      field: "all",
      message: wait_message(
        "guard.step_up_locked",
        "guard.step_up_locked_soon",
        secs ?? undefined,
        now,
      ),
    };
  }
  if (code === "INVALID_TWO_FACTOR_CODE") {
    return {
      field: "code",
      message: with_attempts_left({ key: "guard.step_up_code_wrong" }, details),
    };
  }
  if (code === "TOTP_REQUIRED") {
    return { field: "code", message: { key: "guard.step_up_code_required" } };
  }
  if (code === "INVALID_CREDENTIALS") {
    const failed = detail_text(details, "failed_factor");

    if (failed === "security_key") {
      return {
        field: "key",
        message: with_attempts_left(
          { key: "guard.step_up_key_failed" },
          details,
        ),
      };
    }

    return {
      field: "password",
      message: with_attempts_left(
        {
          key: detail_flag(details, "password_change_held")
            ? "guard.step_up_password_wrong_held"
            : "guard.step_up_password_wrong",
        },
        details,
      ),
    };
  }
  if (code === "STEP_UP_REQUIRED") {
    return { field: "all", message: { key: "guard.error_step_up" } };
  }

  return null;
}

export function guard_error_message(
  source: GuardErrorSource | null | undefined,
  now: number = server_now(),
): GuardErrorMessage | null {
  if (!source) return null;
  const code = source.server_code ?? undefined;
  const rejection = step_up_rejection(source, now);

  if (rejection) return rejection.message;

  if (code === "GUARD_PAUSED") {
    return wait_message(
      "guard.error_paused",
      "guard.error_paused_soon",
      source.retry_after_secs,
      now,
    );
  }
  if (code === "GUARD_TOO_MANY_REQUESTS") {
    return wait_message(
      "guard.error_too_many",
      "guard.error_too_many_soon",
      source.retry_after_secs,
      now,
    );
  }
  if (code === "GUARD_DEVICE_PENDING") {
    return timed(
      "guard.error_device_pending",
      "guard.error_device_pending_soon",
      detail_text(source.details, "activates_at"),
    );
  }
  if (code === "GUARD_HELD") {
    return timed(
      "guard.error_held",
      "guard.error_held_soon",
      source.held?.apply_after ?? detail_text(source.details, "apply_after"),
    );
  }
  if (code && FIXED_KEYS[code]) return { key: FIXED_KEYS[code] };
  if (source.status === 410) return { key: "guard.error_request_gone" };
  if (source.status === 426) return { key: "guard.error_upgrade" };
  if (source.status === 429) {
    return wait_message(
      "guard.error_too_many",
      "guard.error_too_many_soon",
      source.retry_after_secs,
      now,
    );
  }
  if (source.code && OFFLINE_CODES.has(source.code)) {
    return { key: "guard.error_offline" };
  }

  return null;
}

export function guard_error_text(
  t: Translate,
  source: GuardErrorSource | null | undefined,
  fallback: TranslationKey,
  now?: number,
): string {
  const message = guard_error_message(source, now);

  return message ? render_guard_message(t, message) : t(fallback);
}

export function render_guard_message(
  t: Translate,
  message: GuardErrorMessage,
): string {
  const text = t(message.key, message.params);

  return message.extra
    ? `${text} ${t(message.extra.key, message.extra.params)}`
    : text;
}

export function guard_error_text_or_null(
  t: Translate,
  source: GuardErrorSource | null | undefined,
  now?: number,
): string | null {
  if (!source?.server_code?.startsWith("GUARD_")) return null;
  const message = guard_error_message(source, now);

  return message ? render_guard_message(t, message) : null;
}
