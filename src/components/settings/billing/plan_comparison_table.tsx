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

type TranslateFunction = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export interface ComparisonRow {
  label: string;
  free: string;
  star: string;
  nova: string;
  supernova: string;
}

const cap = (s: string) => {
  const trimmed = s.trim();

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

export function get_plan_comparison_rows(
  t: TranslateFunction,
): ComparisonRow[] {
  return [
    {
      label: cap(t("settings.plan_f_storage", { value: "" })),
      free: "10 GB",
      star: "50 GB",
      nova: "500 GB",
      supernova: "5 TB",
    },
    {
      label: cap(t("settings.plan_f_attachments", { value: "" })),
      free: "25 MB",
      star: "50 MB",
      nova: "100 MB",
      supernova: "250 MB",
    },
    {
      label: t("settings.plan_f_signed_in_accounts"),
      free: "1",
      star: "2",
      nova: "5",
      supernova: "20",
    },
    {
      label: cap(t("settings.plan_f_aliases", { value: "" })),
      free: "5",
      star: "15",
      nova: t("settings.unlimited"),
      supernova: t("settings.unlimited"),
    },
    {
      label: cap(t("settings.plan_f_domains", { value: "" })),
      free: "1",
      star: "5",
      nova: "30",
      supernova: t("settings.unlimited"),
    },
    {
      label: cap(t("settings.plan_f_templates", { value: "" })),
      free: "3",
      star: "10",
      nova: t("settings.unlimited"),
      supernova: t("settings.unlimited"),
    },
    {
      label: cap(t("settings.plan_f_send_limit", { value: "" })),
      free: "200",
      star: "1,000",
      nova: "1,000",
      supernova: "1,000",
    },
    {
      label: cap(t("settings.plan_f_signatures", { value: "" })),
      free: "1",
      star: "5",
      nova: t("settings.unlimited"),
      supernova: t("settings.unlimited"),
    },
    {
      label: cap(t("settings.plan_f_mail_rules", { value: "" })),
      free: "2",
      star: t("settings.unlimited"),
      nova: t("settings.unlimited"),
      supernova: t("settings.unlimited"),
    },
    {
      label: cap(t("settings.plan_f_ghost_aliases", { value: "" })),
      free: "5",
      star: "25",
      nova: t("settings.unlimited"),
      supernova: t("settings.unlimited"),
    },
    {
      label: t("settings.plan_f_vacation_reply"),
      free: "-",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.plan_f_catch_all"),
      free: "-",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.plan_f_auto_forwarding"),
      free: "-",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.plan_f_quiet_hours"),
      free: "-",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.plan_f_imap_smtp"),
      free: "-",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.plan_f_external_accounts"),
      free: "-",
      star: "2",
      nova: "5",
      supernova: "5",
    },
    {
      label: t("settings.plan_f_alias_avatars"),
      free: "-",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.feature_alias_sender_pinning"),
      free: "-",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.feature_per_alias_rules"),
      free: "-",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.feature_alias_stats_restore"),
      free: "-",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.feature_soft_delete_restore"),
      free: "-",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.feature_alias_directory"),
      free: "-",
      star: "-",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.feature_instant_alias_delete"),
      free: "-",
      star: "-",
      nova: "-",
      supernova: "✓",
    },
    {
      label: t("settings.feature_reverse_alias"),
      free: "-",
      star: "-",
      nova: "✓",
      supernova: "✓",
    },
    {
      label: t("settings.plan_f_custom_themes"),
      free: "-",
      star: "✓",
      nova: "✓",
      supernova: "✓",
    },
  ];
}
