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
import type { TranslationKey } from "@/lib/i18n/types";
import type { ApiResponse } from "@/services/api/client";
import type {
  MtaStsRecordKind,
  MtaStsRecordStatus,
  MtaStsState,
  MtaStsView,
} from "@/services/api/mta_sts";

export type MtaStsBadgeColor = "gray" | "blue" | "green" | "amber";

export const MTA_STS_STATE_LABELS: Record<
  Exclude<MtaStsState, "off">,
  { label: TranslationKey; color: MtaStsBadgeColor }
> = {
  locked: { label: "settings.mta_sts_state_locked", color: "gray" },
  retiring: { label: "settings.mta_sts_state_retiring", color: "gray" },
  pending_dns: { label: "settings.mta_sts_state_pending_dns", color: "blue" },
  pending_certificate: {
    label: "settings.mta_sts_state_pending_certificate",
    color: "blue",
  },
  live: { label: "settings.mta_sts_state_live", color: "green" },
  attention: { label: "settings.mta_sts_state_attention", color: "amber" },
};

export const MTA_STS_RECORD_LABELS: Record<MtaStsRecordKind, TranslationKey> = {
  policy_host: "settings.mta_sts_record_policy_host",
  policy_id: "settings.mta_sts_record_policy_id",
  tls_reporting: "settings.mta_sts_record_tls_reporting",
};

export const MTA_STS_RECORD_STATUS_LABELS: Record<
  MtaStsRecordStatus,
  TranslationKey
> = {
  ok: "settings.mta_sts_status_ok",
  missing: "settings.mta_sts_status_missing",
  wrong: "settings.mta_sts_status_wrong",
  stale: "settings.mta_sts_status_stale",
  multiple: "settings.mta_sts_status_multiple",
};

export const MTA_STS_AUTO_CHECK_STATES: readonly MtaStsState[] = [
  "pending_dns",
  "pending_certificate",
];

export function mta_sts_row_message(
  state: MtaStsState,
  managed_dns: boolean,
): TranslationKey {
  switch (state) {
    case "locked":
      return "settings.mta_sts_row_locked";
    case "retiring":
      return "settings.mta_sts_row_retiring";
    case "pending_dns":
      return managed_dns
        ? "settings.mta_sts_row_pending_dns_managed"
        : "settings.mta_sts_row_pending_dns";
    case "pending_certificate":
      return "settings.mta_sts_row_pending_certificate";
    case "live":
      return "settings.mta_sts_row_live";
    case "attention":
      return "settings.mta_sts_row_attention";
    default:
      return "settings.mta_sts_row_off";
  }
}

export function mta_sts_attention_message(view: MtaStsView): TranslationKey {
  if (!view.entitled) return "settings.mta_sts_attention_plan";
  if (!view.domain_active) return "settings.mta_sts_attention_domain";
  if (view.hostname_status === "failed") {
    return "settings.mta_sts_attention_certificate";
  }

  return "settings.mta_sts_attention_records";
}

export function mta_sts_change_committed(
  response: ApiResponse<unknown>,
): boolean {
  return (
    response.server_code === "MTA_STS_REGISTRAR_FAILED" ||
    response.server_code === "MTA_STS_RECORD_CONFLICT"
  );
}

export function mta_sts_action_error(
  response: ApiResponse<unknown>,
): TranslationKey {
  switch (response.server_code) {
    case "MTA_STS_THROTTLED":
      return "settings.mta_sts_error_throttled";
    case "MTA_STS_REGISTRAR_FAILED":
      return "settings.mta_sts_error_registrar";
    case "MTA_STS_RECORD_CONFLICT":
      return "settings.mta_sts_error_record_conflict";
    case "MTA_STS_DOMAIN_IN_USE":
      return "settings.mta_sts_error_domain_in_use";
    case "MTA_STS_CAPACITY":
      return "settings.mta_sts_error_capacity";
    case "MTA_STS_DOMAIN_NOT_VERIFIED":
      return "settings.mta_sts_error_not_verified";
    case "MTA_STS_DOMAIN_UNSUPPORTED":
      return "settings.mta_sts_error_unsupported";
    case "MTA_STS_NOT_ENABLED":
      return "settings.mta_sts_error_not_enabled";
    case "PLAN_LIMIT_EXCEEDED":
      return "settings.mta_sts_row_locked";
  }
  if (response.code === "RATE_LIMIT_EXCEEDED") {
    return "settings.mta_sts_error_throttled";
  }

  return "common.something_went_wrong_try_again";
}
