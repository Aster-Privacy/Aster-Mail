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

export interface AcademicRequestFailure {
  error?: string;
  status?: number;
  server_code?: string;
}

export function academic_error_key(
  failure: AcademicRequestFailure,
  captcha_shown: boolean,
): TranslationKey {
  const code = failure.server_code;
  const message = failure.error ?? "";

  if (code === "CAPTCHA_FAILED") {
    return captcha_shown
      ? "settings.academic_captcha_required"
      : "settings.academic_captcha_unavailable";
  }
  if (code === "RATE_LIMIT_EXCEEDED" || failure.status === 429) {
    return "settings.academic_too_many_attempts";
  }
  if (code === "VALIDATION_ERROR" || message.includes("NOT_ACADEMIC_DOMAIN")) {
    return "settings.academic_invalid_email";
  }
  if (
    code === "CONFLICT" ||
    message.includes("EMAIL_ALREADY_USED") ||
    message.includes("ALREADY_VERIFIED")
  ) {
    return "settings.academic_email_in_use";
  }
  if (code === "NOT_FOUND") {
    return "settings.academic_no_pending_request";
  }

  return "settings.academic_request_failed";
}
