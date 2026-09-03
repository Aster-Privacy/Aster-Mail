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
import type { TranslationKey } from "@/lib/i18n";

type translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

interface tier_highlights {
  storage: string;
  aliases: string | null;
  domains: string | null;
  attachments: string;
}

const TIER_HIGHLIGHTS: Record<string, tier_highlights> = {
  star: {
    storage: "50 GB",
    aliases: "15",
    domains: "5",
    attachments: "50 MB",
  },
  nova: {
    storage: "500 GB",
    aliases: null,
    domains: "30",
    attachments: "100 MB",
  },
  supernova: {
    storage: "5 TB",
    aliases: null,
    domains: null,
    attachments: "250 MB",
  },
};

export function checkout_highlights(plan_code: string, t: translate): string[] {
  const tier = TIER_HIGHLIGHTS[plan_code];

  if (!tier) return [];

  const unlimited = t("settings.unlimited");

  return [
    `${tier.storage} ${t("settings.encrypted_storage_suffix")}`,
    `${tier.aliases ?? unlimited} ${t("settings.email_aliases_suffix")}`,
    `${tier.domains ?? unlimited} ${t("settings.custom_domains_suffix")}`,
    `${tier.attachments} ${t("settings.attachments_suffix")}`,
    t("settings.f_e2ee"),
    t("settings.f_zero_knowledge"),
    t("settings.plan_f_imap_smtp_bridge"),
    t("settings.plan_f_support_priority"),
  ];
}
