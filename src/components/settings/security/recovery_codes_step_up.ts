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

export const TOTP_CODE_LENGTH = 6;

export function normalize_totp_input(value: string): string {
  return value.replace(/\D/g, "").slice(0, TOTP_CODE_LENGTH);
}

export function step_up_error_key(response: {
  server_code?: string;
}): TranslationKey | null {
  switch (response.server_code) {
    case "INVALID_TWO_FACTOR_CODE":
      return "settings.invalid_2fa_code";
    case "TOTP_CODE_REPLAYED":
      return "auth.two_fa_code_already_used";
    case "TOTP_REQUIRED":
      return "settings.please_enter_2fa_code";
    case "INVALID_CREDENTIALS":
      return "settings.incorrect_password_error";
  }

  return null;
}
