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
import { format_time_remaining } from "./send_queue_types";

import { get_active_translations } from "@/lib/i18n/translations";
import { format_bytes } from "@/lib/utils";

export interface SendRefusalSource {
  code?: string;
  server_code?: string;
  resets_at?: string;
  details?: Record<string, unknown>;
}

export interface SendRefusal {
  kind: "rate_limited" | "send_failed";
  message: string;
}

export function describe_send_refusal(
  result: SendRefusalSource,
): SendRefusal | null {
  if (result.server_code === "RECIPIENT_CONCENTRATION" && result.resets_at) {
    const domain = result.details?.domain;

    return {
      kind: "rate_limited",
      message: get_active_translations()
        .errors.recipient_concentration.replace(
          "{{domain}}",
          typeof domain === "string" && domain.length > 0
            ? domain
            : get_active_translations().errors.that_provider,
        )
        .replace("{{time}}", format_time_remaining(result.resets_at)),
    };
  }

  if (result.server_code === "TOO_MANY_RECIPIENTS") {
    const max_allowed = result.details?.max_allowed;

    return {
      kind: "send_failed",
      message: get_active_translations().errors.too_many_recipients.replace(
        "{{max}}",
        typeof max_allowed === "number" ? String(max_allowed) : "",
      ),
    };
  }

  if (result.server_code === "ATTACHMENTS_TOO_LARGE") {
    const max_bytes = result.details?.max_bytes;

    return {
      kind: "send_failed",
      message: get_active_translations().errors.attachments_too_large.replace(
        "{{size}}",
        typeof max_bytes === "number" ? format_bytes(max_bytes) : "",
      ),
    };
  }

  if (result.server_code === "TOO_MANY_ATTACHMENTS") {
    const max_allowed = result.details?.max_allowed;

    return {
      kind: "send_failed",
      message: get_active_translations().errors.too_many_attachments.replace(
        "{{max}}",
        typeof max_allowed === "number" ? String(max_allowed) : "",
      ),
    };
  }

  if (result.code === "RATE_LIMIT_EXCEEDED" && result.resets_at) {
    return {
      kind: "rate_limited",
      message: get_active_translations().errors.daily_limit_reached.replace(
        "{{time}}",
        format_time_remaining(result.resets_at),
      ),
    };
  }

  return null;
}
