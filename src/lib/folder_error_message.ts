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

export const MAX_FOLDER_NAME_LENGTH = 100;

type TranslateFn = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export function create_folder_error_message(
  code: string | undefined,
  t: TranslateFn,
): string {
  switch (code) {
    case "PLAN_LIMIT_EXCEEDED":
      return t("common.folder_plan_limit_reached");
    case "DUPLICATE":
      return t("common.folder_already_exists");
    case "INVALID_NAME":
      return t("common.folder_name_too_long", {
        max: MAX_FOLDER_NAME_LENGTH,
      });
    default:
      return t("common.failed_to_create_folder_error");
  }
}
