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
import type { PlanFeature } from "@/components/settings/billing/plan_card";

import { useMemo } from "react";

import { use_i18n } from "@/lib/i18n/context";

export function use_plan_features(): Record<string, PlanFeature[]> {
  const { t } = use_i18n();

  const plan_features: Record<string, PlanFeature[]> = useMemo(
    () => ({
      star: [
        {
          label: t("settings.plan_feat_storage_50"),
          on: true,
          icon: "storage",
        },
        { label: t("settings.plan_feat_aliases_15"), on: true, icon: "alias" },
        {
          label: t("settings.plan_f_ghost_aliases", { value: "25" }),
          on: true,
          icon: "ghost_alias",
          description: t("settings.plan_desc_ghost_aliases"),
        },
        { label: t("settings.plan_feat_domains_5"), on: true, icon: "domain" },
        {
          label: t("settings.plan_feat_attachments_50"),
          on: true,
          icon: "attachment",
        },
        {
          label: t("settings.plan_feat_catch_all"),
          on: true,
          icon: "catch_all",
          description: t("settings.plan_desc_catch_all"),
        },
        {
          label: t("settings.plan_feat_advanced_aliases"),
          on: true,
          icon: "advanced_alias",
          description: t("settings.plan_desc_advanced_aliases"),
        },
        {
          label: t("settings.plan_feat_imap_smtp"),
          on: true,
          icon: "apps",
          description: t("settings.plan_desc_apps"),
        },
        {
          label: t("settings.plan_f_external_accounts"),
          on: true,
          icon: "sync",
          description: t("settings.plan_desc_external_accounts"),
        },
        {
          label: t("settings.plan_feat_priority_support"),
          on: true,
          icon: "support",
        },
      ],
      nova: [
        {
          label: t("settings.plan_feat_storage_500"),
          on: true,
          icon: "storage",
        },
        {
          label: t("settings.plan_feat_aliases_unlimited"),
          on: true,
          icon: "alias",
        },
        {
          label: t("settings.plan_f_ghost_aliases", {
            value: t("settings.unlimited"),
          }),
          on: true,
          icon: "ghost_alias",
          description: t("settings.plan_desc_ghost_aliases"),
        },
        { label: t("settings.plan_feat_domains_30"), on: true, icon: "domain" },
        {
          label: t("settings.plan_feat_attachments_100"),
          on: true,
          icon: "attachment",
        },
        {
          label: t("settings.plan_f_multi_accounts", { value: "5" }),
          on: true,
          icon: "accounts",
          description: t("settings.plan_desc_multi_accounts"),
        },
        {
          label: t("settings.plan_feat_vanguard"),
          on: true,
          icon: "shield",
          description: t("settings.plan_desc_vanguard"),
        },
        {
          label: t("settings.plan_feat_folder_lock"),
          on: true,
          icon: "lock",
          description: t("settings.plan_desc_folder_lock"),
        },
        {
          label: t("settings.plan_feat_smart_folders"),
          on: true,
          icon: "folder",
          description: t("settings.plan_desc_smart_folders"),
        },
        {
          label: t("settings.plan_f_encrypted_exports"),
          on: true,
          icon: "export",
          description: t("settings.plan_desc_encrypted_exports"),
        },
        {
          label: t("settings.feature_alias_directory"),
          on: true,
          icon: "directory",
          description: t("settings.plan_desc_alias_directory"),
        },
        {
          label: t("settings.plan_f_carddav_import"),
          on: true,
          icon: "import",
        },
        {
          label: t("settings.plan_f_contact_merge"),
          on: true,
          icon: "contacts",
        },
      ],
      supernova: [
        {
          label: t("settings.plan_feat_storage_5tb"),
          on: true,
          icon: "storage",
        },
        {
          label: t("settings.plan_feat_aliases_unlimited"),
          on: true,
          icon: "alias",
        },
        {
          label: t("settings.plan_f_ghost_aliases", {
            value: t("settings.unlimited"),
          }),
          on: true,
          icon: "ghost_alias",
          description: t("settings.plan_desc_ghost_aliases"),
        },
        {
          label: t("settings.plan_feat_domains_unlimited"),
          on: true,
          icon: "domain",
        },
        {
          label: t("settings.plan_feat_attachments_250"),
          on: true,
          icon: "attachment",
        },
        {
          label: t("settings.plan_f_multi_accounts", { value: "20" }),
          on: true,
          icon: "accounts",
          description: t("settings.plan_desc_multi_accounts"),
        },
        {
          label: t("settings.feature_instant_alias_delete"),
          on: true,
          icon: "delete",
          description: t("settings.plan_desc_instant_alias_delete"),
        },
        {
          label: t("settings.plan_f_support_dedicated"),
          on: true,
          icon: "support",
          description: t("settings.plan_desc_support_dedicated"),
        },
        {
          label: t("settings.plan_f_early_access"),
          on: true,
          icon: "early_access",
          description: t("settings.plan_desc_early_access"),
        },
        {
          label: t("settings.plan_feat_vanguard"),
          on: true,
          icon: "shield",
          description: t("settings.plan_desc_vanguard"),
        },
        {
          label: t("settings.plan_feat_folder_lock"),
          on: true,
          icon: "lock",
          description: t("settings.plan_desc_folder_lock"),
        },
        {
          label: t("settings.plan_feat_smart_folders"),
          on: true,
          icon: "folder",
          description: t("settings.plan_desc_smart_folders"),
        },
        {
          label: t("settings.plan_f_encrypted_exports"),
          on: true,
          icon: "export",
          description: t("settings.plan_desc_encrypted_exports"),
        },
        {
          label: t("settings.feature_alias_directory"),
          on: true,
          icon: "directory",
          description: t("settings.plan_desc_alias_directory"),
        },
      ],
    }),
    [t],
  );

  return plan_features;
}
