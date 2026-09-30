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

import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";

import { Spinner } from "@/components/ui/spinner";
import { type ImportStatus } from "@/services/api/email_import";

export function get_status_icon(status: ImportStatus) {
  switch (status) {
    case "completed":
      return (
        <CheckCircleIcon
          className="w-4 h-4"
          style={{ color: "var(--color-success)" }}
        />
      );
    case "processing":
    case "pending":
      return <Spinner className="text-brand" size="sm" />;
    case "failed":
    case "cancelled":
      return (
        <XCircleIcon
          className="w-4 h-4"
          style={{ color: "var(--color-danger)" }}
        />
      );
  }
}

export function get_status_label(
  status: ImportStatus,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  switch (status) {
    case "pending":
      return t("settings.status_pending");
    case "processing":
      return t("settings.status_in_progress");
    case "completed":
      return t("settings.status_completed");
    case "failed":
      return t("settings.status_failed");
    case "cancelled":
      return t("settings.status_cancelled");
  }
}

export { format_relative_time_short as format_relative_time } from "@/utils/date_utils";
