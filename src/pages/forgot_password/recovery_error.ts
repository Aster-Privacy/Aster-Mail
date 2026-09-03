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
import type { ApiResponse } from "@/services/api/client/helpers";
import { format_time_remaining } from "@/services/send_queue_types";

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export function recovery_error_message(
  response: ApiResponse<unknown>,
  t: Translate,
): string {
  if (response.server_code === "RATE_LIMIT_EXCEEDED" && response.resets_at) {
    return t("auth.recovery_locked_out", {
      time: format_time_remaining(response.resets_at),
    });
  }

  if (response.server_code === "INVALID_RECOVERY_CODE") {
    return t("auth.invalid_recovery_code");
  }

  return response.error || t("auth.invalid_recovery_code");
}
