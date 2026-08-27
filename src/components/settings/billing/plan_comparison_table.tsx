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
  category: string;
  label: string;
  free: string;
  star: string;
  nova: string;
  supernova: string;
  tip?: string;
}

const cap = (s: string) => {
  const trimmed = s.trim();

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

export function get_plan_comparison_rows(
  t: TranslateFunction,
): ComparisonRow[] {
  const unlimited = t("settings.unlimited");
  const yes = "✓";
  const no = "-";
  const limits = t("settings.category_storage_limits");
  const mail = t("settings.category_email_features");
  const aliases = t("settings.category_advanced_aliases");
  const privacy = t("settings.category_privacy");
  const apps = t("settings.category_apps_integrations");
  const support = t("settings.category_support");

  return [
    {
      category: limits,
      label: cap(t("settings.plan_f_storage", { value: "" })),
      free: "10 GB",
      star: "50 GB",
      nova: "500 GB",
      supernova: "5 TB",
    },
    {
      category: limits,
      label: cap(t("settings.plan_f_attachments", { value: "" })),
      tip: t("settings.plan_tip_attachments"),
      free: "25 MB",
      star: "50 MB",
      nova: "100 MB",
      supernova: "250 MB",
    },
    {
      category: limits,
      label: t("settings.plan_f_signed_in_accounts"),
      tip: t("settings.plan_tip_signed_in_accounts"),
      free: "1",
      star: "2",
      nova: "5",
      supernova: "20",
    },
    {
      category: limits,
      label: cap(t("settings.plan_f_send_limit", { value: "" })),
      tip: t("settings.plan_tip_send_limit"),
      free: "200",
      star: "1,000",
      nova: "1,000",
      supernova: "1,000",
    },
    {
      category: mail,
      label: cap(t("settings.plan_f_aliases", { value: "" })),
      free: "5",
      star: "15",
      nova: unlimited,
      supernova: unlimited,
    },
    {
      category: mail,
      label: cap(t("settings.plan_f_ghost_aliases", { value: "" })),
      tip: t("settings.plan_tip_ghost_aliases"),
      free: "5",
      star: "25",
      nova: unlimited,
      supernova: unlimited,
    },
    {
      category: mail,
      label: cap(t("settings.plan_f_domains", { value: "" })),
      free: "1",
      star: "5",
      nova: "30",
      supernova: unlimited,
    },
    {
      category: mail,
      label: cap(t("settings.plan_f_templates", { value: "" })),
      free: "3",
      star: "10",
      nova: unlimited,
      supernova: unlimited,
    },
    {
      category: mail,
      label: cap(t("settings.plan_f_signatures", { value: "" })),
      free: "1",
      star: "5",
      nova: unlimited,
      supernova: unlimited,
    },
    {
      category: mail,
      label: cap(t("settings.plan_f_mail_rules", { value: "" })),
      free: "2",
      star: unlimited,
      nova: unlimited,
      supernova: unlimited,
    },
    {
      category: mail,
      label: t("settings.plan_f_vacation_reply"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_catch_all"),
      tip: t("settings.catch_all_description"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_auto_forwarding"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_quiet_hours"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_auto_delete_spam"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.plan_f_smart_folders"),
      tip: t("settings.plan_tip_smart_folders"),
      free: no,
      star: no,
      nova: yes,
      supernova: yes,
    },
    {
      category: mail,
      label: t("settings.f_folder_lock"),
      tip: t("settings.plan_tip_folder_lock"),
      free: no,
      star: no,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.plan_f_alias_avatars"),
      tip: t("settings.plan_tip_alias_avatars"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.feature_alias_sender_pinning"),
      tip: t("settings.plan_tip_sender_pinning"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.feature_per_alias_rules"),
      tip: t("settings.plan_tip_alias_rules"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.feature_alias_stats_restore"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.feature_soft_delete_restore"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.feature_reverse_alias"),
      tip: t("settings.plan_tip_reverse_alias"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.feature_alias_directory"),
      tip: t("settings.plan_tip_alias_directory"),
      free: no,
      star: no,
      nova: yes,
      supernova: yes,
    },
    {
      category: aliases,
      label: t("settings.feature_instant_alias_delete"),
      tip: t("settings.plan_tip_instant_alias_delete"),
      free: no,
      star: no,
      nova: no,
      supernova: yes,
    },
    {
      category: privacy,
      label: t("settings.f_e2ee"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: privacy,
      label: t("settings.f_zero_knowledge"),
      tip: t("settings.plan_tip_zero_knowledge"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: privacy,
      label: t("settings.plan_f_tracker_protection"),
      tip: t("settings.plan_tip_tracker_protection"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: privacy,
      label: t("settings.plan_f_custom_key_rotation"),
      tip: t("settings.plan_tip_key_rotation"),
      free: yes,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: apps,
      label: t("settings.plan_f_imap_smtp"),
      tip: t("settings.plan_tip_imap_smtp"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: apps,
      label: t("settings.plan_f_external_accounts"),
      tip: t("settings.plan_tip_external_accounts"),
      free: no,
      star: "2",
      nova: "5",
      supernova: "20",
    },
    {
      category: apps,
      label: t("settings.plan_f_carddav_import"),
      tip: t("settings.plan_tip_carddav"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: apps,
      label: t("settings.plan_f_custom_themes"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
    {
      category: support,
      label: t("settings.plan_f_support_priority"),
      free: no,
      star: yes,
      nova: yes,
      supernova: yes,
    },
  ];
}
