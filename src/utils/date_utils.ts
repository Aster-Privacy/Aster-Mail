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

type TranslateFn = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export function format_relative_time(
  timestamp: string,
  t?: TranslateFn,
): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);

  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diff_ms = now.getTime() - date.getTime();
  const diff_seconds = Math.floor(diff_ms / 1000);
  const diff_minutes = Math.floor(diff_seconds / 60);
  const diff_hours = Math.floor(diff_minutes / 60);
  const diff_days = Math.floor(diff_hours / 24);
  const diff_weeks = Math.floor(diff_days / 7);
  const diff_months = Math.floor(diff_days / 30);

  if (diff_seconds < 60) {
    return t ? t("common.just_now") : "Just now";
  }
  if (diff_minutes < 60) {
    return t
      ? t("common.minutes_ago_long", { count: diff_minutes })
      : `${diff_minutes} minute${diff_minutes === 1 ? "" : "s"} ago`;
  }
  if (diff_hours < 24) {
    return t
      ? t("common.hours_ago_long", { count: diff_hours })
      : `${diff_hours} hour${diff_hours === 1 ? "" : "s"} ago`;
  }
  if (diff_days < 7) {
    return t
      ? t("common.days_ago_long", { count: diff_days })
      : `${diff_days} day${diff_days === 1 ? "" : "s"} ago`;
  }
  if (diff_weeks < 4) {
    return t
      ? t("common.weeks_ago_long", { count: diff_weeks })
      : `${diff_weeks} week${diff_weeks === 1 ? "" : "s"} ago`;
  }
  if (diff_months < 12) {
    return t
      ? t("common.months_ago_long", { count: diff_months })
      : `${diff_months} month${diff_months === 1 ? "" : "s"} ago`;
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
