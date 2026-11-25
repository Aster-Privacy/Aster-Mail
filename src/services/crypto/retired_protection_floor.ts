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
export type ProtectionBaseline = object;

type JsonObject = Record<string, unknown>;

export const PROTECTIVE_WHEN_TRUE: readonly string[] = [
  "block_external_images",
  "encrypt_emails",
  "require_encryption",
  "show_encryption_indicators",
  "warn_external_recipients",
  "obscure_subject_when_encrypted",
  "block_external_content",
  "block_remote_images",
  "block_remote_fonts",
  "block_remote_css",
  "block_tracking_pixels",
  "show_tracking_protection",
  "confirm_before_permanent_delete",
  "session_timeout_enabled",
  "forward_secrecy_enabled",
  "biometric_app_lock_enabled",
  "biometric_send_enabled",
  "biometric_settings_enabled",
];

export const PROTECTIVE_WHEN_FALSE: readonly string[] = [
  "send_read_receipts",
  "auto_discover_keys",
  "publish_to_wkd",
  "publish_to_keyservers",
  "external_link_warning_dismissed",
];

export const RANKED_PROTECTIONS: Record<string, readonly string[]> = {
  load_remote_images: ["always", "ask", "never"],
  protected_folder_lock_mode: ["session", "on_leave"],
};

const STRONGEST_BLOCKING_MODE = "both";
const BLOCKING_MODES: readonly string[] = ["trackers", "images", "both"];

const LOWER_IS_PROTECTIVE: readonly string[] = ["session_timeout_minutes"];

export function is_plain_object(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function boolean_holds(
  opened: unknown,
  baseline: unknown,
  protective: boolean,
): boolean {
  if (typeof opened !== "boolean") return false;
  if (opened === protective) return true;

  return typeof baseline === "boolean" && baseline === opened;
}

function ranked_holds(
  order: readonly string[],
  opened: unknown,
  baseline: unknown,
): boolean {
  if (typeof opened !== "string") return false;

  const opened_rank = order.indexOf(opened);

  if (opened_rank < 0) return false;
  if (opened_rank === order.length - 1) return true;
  if (typeof baseline !== "string") return false;

  const baseline_rank = order.indexOf(baseline);

  return baseline_rank >= 0 && opened_rank >= baseline_rank;
}

function blocking_mode_holds(opened: unknown, baseline: unknown): boolean {
  if (typeof opened !== "string" || !BLOCKING_MODES.includes(opened)) {
    return false;
  }

  return opened === STRONGEST_BLOCKING_MODE || opened === baseline;
}

function lower_number_holds(opened: unknown, baseline: unknown): boolean {
  if (typeof opened !== "number" || !Number.isFinite(opened) || opened <= 0) {
    return false;
  }

  return typeof baseline === "number" && opened <= baseline;
}

function protection_holds(
  key: string,
  opened: unknown,
  baseline: unknown,
): boolean | null {
  if (PROTECTIVE_WHEN_TRUE.includes(key)) {
    return boolean_holds(opened, baseline, true);
  }
  if (PROTECTIVE_WHEN_FALSE.includes(key)) {
    return boolean_holds(opened, baseline, false);
  }
  if (key in RANKED_PROTECTIONS) {
    return ranked_holds(RANKED_PROTECTIONS[key], opened, baseline);
  }
  if (key === "external_content_blocking_mode") {
    return blocking_mode_holds(opened, baseline);
  }
  if (LOWER_IS_PROTECTIVE.includes(key)) {
    return lower_number_holds(opened, baseline);
  }

  return null;
}

export function floor_retired_preferences(
  opened: JsonObject,
  baseline: ProtectionBaseline,
): boolean {
  const values = baseline as Readonly<Record<string, unknown>>;
  let changed = false;

  for (const key of Object.keys(opened)) {
    const holds = protection_holds(key, opened[key], values[key]);

    if (holds !== false) continue;

    changed = true;
    if (values[key] === undefined) {
      delete opened[key];
    } else {
      opened[key] = values[key];
    }
  }

  return changed;
}

export function floor_retired_dev_mode(opened: JsonObject): boolean {
  if (opened.enabled === false || !("enabled" in opened)) return false;

  opened.enabled = false;

  return true;
}

export function floor_retired_bytes(
  bytes: Uint8Array,
  apply: (opened: JsonObject) => boolean,
): Uint8Array | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    return null;
  }

  if (!is_plain_object(parsed) || !apply(parsed)) return bytes.slice();

  return new TextEncoder().encode(JSON.stringify(parsed));
}
