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
import { } from "@/services/crypto/constants";
import type { TranslationKey } from "@/lib/i18n/types";


import { en } from "@/lib/i18n/translations/en";
import { } from "@/services/crypto/secure_memory";
import { } from "@/services/crypto/legacy_keks";


export const RESERVED_ALIAS_NAMES = new Set([
  "noreply",
  "admin",
  "administrator",
  "postmaster",
  "webmaster",
  "support",
  "abuse",
  "mailer",
  "daemon",
  "root",
  "hostmaster",
  "info",
  "contact",
  "help",
  "system",
  "mail",
  "no-reply",
]);

export function validate_local_part(local_part: string): {
  valid: boolean;
  error?: string;
  error_key?: TranslationKey;
} {
  if (!local_part || local_part.length === 0) {
    return {
      valid: false,
      error: en.errors.alias_empty,
      error_key: "errors.alias_empty",
    };
  }

  if (local_part.length < 3) {
    return {
      valid: false,
      error: en.errors.alias_too_short,
      error_key: "errors.alias_too_short",
    };
  }

  if (local_part.length > 64) {
    return {
      valid: false,
      error: en.errors.alias_too_long,
      error_key: "errors.alias_too_long",
    };
  }

  const valid_pattern = /^[a-z0-9][a-z0-9._-]*[a-z0-9]$|^[a-z0-9]$/;

  if (!valid_pattern.test(local_part.toLowerCase())) {
    return {
      valid: false,
      error: en.errors.alias_invalid_chars,
      error_key: "errors.alias_invalid_chars",
    };
  }

  if (local_part.includes("..")) {
    return {
      valid: false,
      error: en.errors.alias_consecutive_dots,
      error_key: "errors.alias_consecutive_dots",
    };
  }

  if (/^[0-9]+$/.test(local_part)) {
    return {
      valid: false,
      error: en.errors.alias_numeric_only,
      error_key: "errors.alias_numeric_only",
    };
  }

  if (RESERVED_ALIAS_NAMES.has(local_part.toLowerCase())) {
    return {
      valid: false,
      error: en.errors.alias_not_available,
      error_key: "errors.alias_not_available",
    };
  }

  return { valid: true };
}

