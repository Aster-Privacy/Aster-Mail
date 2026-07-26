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
import type { use_i18n } from "@/lib/i18n";

type Translate = ReturnType<typeof use_i18n>["t"];

export function format_relative_time(t: Translate, iso: string): string {
  const parsed = new Date(iso).getTime();

  if (Number.isNaN(parsed)) return "";

  const diff = Date.now() - parsed;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 2) return t("settings.fam_org_time_just_now");
  if (mins < 60) return t("settings.fam_org_time_minutes", { count: mins });
  if (hours < 24)
    return hours === 1
      ? t("settings.fam_org_time_hour", { count: hours })
      : t("settings.fam_org_time_hours", { count: hours });
  if (days < 30)
    return days === 1
      ? t("settings.fam_org_time_yesterday")
      : t("settings.fam_org_time_days", { count: days });

  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years >= 1)
    return years === 1
      ? t("settings.fam_org_time_year", { count: years })
      : t("settings.fam_org_time_years", { count: years });

  return months === 1
    ? t("settings.fam_org_time_month", { count: months })
    : t("settings.fam_org_time_months", { count: months });
}

export function format_created_at(iso: string, locale: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
