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
import type { SettingsSection } from "@/pages/mobile/settings/shared";

const MOBILE_SETTINGS_SECTIONS: SettingsSection[] = [
  "account",
  "appearance",
  "accessibility",
  "security",
  "encryption",
  "trusted_devices",
  "aliases",
  "alias_directories",
  "ghost_aliases",
  "family",
  "billing",
  "referral",
  "notifications",
  "behavior",
  "connection",
  "signatures",
  "templates",
  "import",
  "external_accounts",
  "sender_filters",
  "mail_rules",
  "feedback",
  "about",
  "developer",
];

const SECTION_ALIASES: Record<string, SettingsSection> = {
  signature: "signatures",
  bridge: "connection",
  smtp_tokens: "connection",
  categories: "behavior",
  compose: "behavior",
  updates: "about",
  plans: "billing",
  subscription: "billing",
};

export function resolve_mobile_section(
  candidate: string | null | undefined,
): SettingsSection | null {
  if (!candidate) return null;
  const key = candidate.trim();

  if (MOBILE_SETTINGS_SECTIONS.includes(key as SettingsSection)) {
    return key as SettingsSection;
  }

  return SECTION_ALIASES[key] ?? null;
}
