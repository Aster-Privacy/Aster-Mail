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
import { format_bytes } from "@/lib/utils";
import { show_plan_limit_upgrade } from "@/stores/upgrade_store";
import type { TranslationKey } from "@/lib/i18n/types";

import {
  FREE_MAX_ATTACHMENT_SIZE,
  MAX_PAID_ATTACHMENT_SIZE,
  get_max_attachment_size,
  get_max_total_attachments_size,
} from "./attachment_limits";

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export function describe_oversized_file(t: Translate, file_name: string) {
  const max_size = get_max_attachment_size();
  const can_upgrade =
    max_size <= FREE_MAX_ATTACHMENT_SIZE && max_size < MAX_PAID_ATTACHMENT_SIZE;

  if (can_upgrade) {
    return {
      message: t("common.file_exceeds_max_size_upgradable", {
        name: file_name,
        size: format_bytes(max_size),
        max_size: format_bytes(MAX_PAID_ATTACHMENT_SIZE),
      }),
      can_upgrade,
    };
  }

  return {
    message: t("common.file_exceeds_max_size", {
      name: file_name,
      size: format_bytes(max_size),
    }),
    can_upgrade,
  };
}

export function describe_would_exceed_total(
  t: Translate,
  file_name: string,
): string {
  return t("common.adding_file_would_exceed_limit", {
    name: file_name,
    size: format_bytes(get_max_total_attachments_size()),
  });
}

export function prompt_attachment_upgrade(message?: string): void {
  show_plan_limit_upgrade({
    resource: "attachments",
    message: message ?? null,
  });
}
