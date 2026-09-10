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
  "domains",
  "alias_directories",
  "ghost_aliases",
  "family",
  "billing",
  "storage",
  "referral",
  "notifications",
  "behavior",
  "connection",
  "bridge",
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
  smtp_tokens: "bridge",
  categories: "behavior",
  compose: "behavior",
  updates: "about",
  plans: "billing",
  subscription: "billing",
  storage_addons: "storage",
  credits: "billing",
  blocked: "sender_filters",
  allowlist: "sender_filters",
  auto_forward: "sender_filters",
  vacation_reply: "sender_filters",
  export: "import",
  help: "feedback",
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
