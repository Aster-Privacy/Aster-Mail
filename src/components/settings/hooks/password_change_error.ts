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

const FINGERPRINT_MISMATCH_CODE = "FINGERPRINT_MISMATCH";

const SERVER_ERROR_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  [FINGERPRINT_MISMATCH_CODE]: "settings.password_change_fingerprint_mismatch",
};

export function resolve_password_change_error(
  server_error: string,
  translate: (key: TranslationKey) => string,
): string {
  const normalized = server_error.trim().toUpperCase();
  const translation_key = SERVER_ERROR_TRANSLATION_KEYS[normalized];

  return translation_key ? translate(translation_key) : server_error;
}
