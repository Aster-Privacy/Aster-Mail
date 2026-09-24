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
  BimiAdjustment,
  BimiDmarcStatus,
  BimiLogoError,
  BimiRecordStatus,
  BimiState,
} from "@/services/api/bimi";

import { BIMI_STATES } from "@/services/api/bimi";

export type BimiBadgeColor = "gray" | "blue" | "green" | "amber";

export const BIMI_STATE_LABELS: Record<
  Exclude<BimiState, "off">,
  { label: TranslationKey; color: BimiBadgeColor }
> = {
  draft: { label: "settings.bimi_state_draft", color: "gray" },
  pending: { label: "settings.bimi_state_pending", color: "blue" },
  live: { label: "settings.bimi_state_live", color: "green" },
  attention: { label: "settings.bimi_state_attention", color: "amber" },
  external: { label: "settings.bimi_state_external", color: "gray" },
};

export type BimiRule = "svg" | "square" | "size" | "vector" | "safe";

export const BIMI_RULES: { rule: BimiRule; label: TranslationKey }[] = [
  { rule: "svg", label: "settings.bimi_rule_svg" },
  { rule: "square", label: "settings.bimi_rule_square" },
  { rule: "size", label: "settings.bimi_rule_size" },
  { rule: "vector", label: "settings.bimi_rule_vector" },
  { rule: "safe", label: "settings.bimi_rule_safe" },
];

export const BIMI_ERROR_RULES: Record<BimiLogoError, BimiRule> = {
  too_large: "size",
  too_complex: "size",
  not_utf8: "svg",
  malformed: "svg",
  doctype_entities: "svg",
  not_svg: "svg",
  empty: "svg",
  missing_view_box: "square",
  not_square: "square",
  script_content: "safe",
  external_reference: "safe",
  invalid_reference: "safe",
  raster_image: "vector",
  text_not_outlined: "vector",
  unsupported_style: "vector",
  unsupported_element: "vector",
  invalid_value: "vector",
};

export const BIMI_DMARC_MESSAGES: Record<BimiDmarcStatus, TranslationKey> = {
  ready: "settings.bimi_dmarc_ready",
  missing: "settings.bimi_dmarc_missing",
  invalid: "settings.bimi_dmarc_invalid",
  not_enforced: "settings.bimi_dmarc_not_enforced",
  partial: "settings.bimi_dmarc_partial",
  subdomain_policy_none: "settings.bimi_dmarc_subdomain_policy_none",
  organization_not_enforced: "settings.bimi_dmarc_organization_not_enforced",
};

export const BIMI_RECORD_MESSAGES: Record<BimiRecordStatus, TranslationKey> = {
  missing: "settings.bimi_record_missing",
  published: "settings.bimi_record_published",
  conflict: "settings.bimi_record_conflict",
  external: "settings.bimi_record_external",
};

export const BIMI_LOGO_ERROR_MESSAGES: Record<BimiLogoError, TranslationKey> = {
  too_large: "settings.bimi_err_too_large",
  not_utf8: "settings.bimi_err_not_utf8",
  malformed: "settings.bimi_err_malformed",
  doctype_entities: "settings.bimi_err_doctype_entities",
  not_svg: "settings.bimi_err_not_svg",
  empty: "settings.bimi_err_empty",
  missing_view_box: "settings.bimi_err_missing_view_box",
  not_square: "settings.bimi_err_not_square",
  too_complex: "settings.bimi_err_too_complex",
  script_content: "settings.bimi_err_script_content",
  external_reference: "settings.bimi_err_external_reference",
  invalid_reference: "settings.bimi_err_invalid_reference",
  raster_image: "settings.bimi_err_raster_image",
  text_not_outlined: "settings.bimi_err_text_not_outlined",
  unsupported_style: "settings.bimi_err_unsupported_style",
  unsupported_element: "settings.bimi_err_unsupported_element",
  invalid_value: "settings.bimi_err_invalid_value",
};

export const BIMI_ADJUSTMENT_MESSAGES: Record<BimiAdjustment, TranslationKey> =
  {
    set_tiny_ps_profile: "settings.bimi_adj_set_tiny_ps_profile",
    added_title: "settings.bimi_adj_added_title",
    removed_size: "settings.bimi_adj_removed_size",
    removed_position: "settings.bimi_adj_removed_position",
    derived_view_box: "settings.bimi_adj_derived_view_box",
    removed_doctype: "settings.bimi_adj_removed_doctype",
    removed_metadata: "settings.bimi_adj_removed_metadata",
    removed_editor_data: "settings.bimi_adj_removed_editor_data",
    converted_inline_styles: "settings.bimi_adj_converted_inline_styles",
    removed_unsupported_attributes:
      "settings.bimi_adj_removed_unsupported_attributes",
  };

export function normalize_bimi_state(
  value: string | null | undefined,
): BimiState {
  if (!value) return "off";

  return (BIMI_STATES as readonly string[]).includes(value)
    ? (value as BimiState)
    : "draft";
}

export function bimi_row_message(
  state: BimiState,
  managed_dns: boolean,
): TranslationKey {
  switch (state) {
    case "draft":
      return "settings.bimi_row_draft";
    case "pending":
      return managed_dns
        ? "settings.bimi_row_pending_managed"
        : "settings.bimi_row_pending";
    case "live":
      return "settings.bimi_row_live";
    case "attention":
      return "settings.bimi_row_attention";
    case "external":
      return "settings.bimi_row_external";
    default:
      return "settings.bimi_row_off";
  }
}

export function bimi_action_error(
  response: ApiResponse<unknown>,
): TranslationKey {
  switch (response.server_code) {
    case "BIMI_UPLOAD_THROTTLED":
    case "BIMI_ACTION_THROTTLED":
      return "settings.bimi_error_throttled";
    case "BIMI_LOGO_REQUIRED":
      return "settings.bimi_error_logo_required";
    case "BIMI_DOMAIN_NOT_ACTIVE":
      return "settings.bimi_error_domain_not_active";
    case "PAYLOAD_TOO_LARGE":
      return "settings.bimi_error_file_too_large";
    case "BIMI_RECORD_CONFLICT":
      return "settings.bimi_record_external";
  }
  if (response.code === "RATE_LIMIT_EXCEEDED") {
    return "settings.bimi_error_throttled";
  }

  return "common.something_went_wrong_try_again";
}
