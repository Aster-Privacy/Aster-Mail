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
export type SettingsSection =
  | "account"
  | "appearance"
  | "accessibility"
  | "security"
  | "encryption"
  | "trusted_devices"
  | "aliases"
  | "domains"
  | "billing"
  | "storage"
  | "family"
  | "referral"
  | "import"
  | "notifications"
  | "sound"
  | "compose"
  | "signature"
  | "templates"
  | "behavior"
  | "categories"
  | "sender_filters"
  | "mail_rules"
  | "feedback"
  | "updates"
  | "developer"
  | "bridge"
  | "smtp_tokens";

export const SETTINGS_SECTION_IDS: SettingsSection[] = [
  "appearance",
  "account",
  "security",
  "aliases",
  "domains",
  "storage",
  "billing",
  "referral",
  "notifications",
  "sound",
  "behavior",
  "compose",
  "mail_rules",
  "import",
  "bridge",
  "feedback",
];

export function is_settings_section(value: string): value is SettingsSection {
  return (SETTINGS_SECTION_IDS as string[]).includes(value);
}

const SECTION_ALIASES: Record<string, SettingsSection> = {
  storage_addons: "storage",
  credits: "billing",
  ghost_aliases: "aliases",
  alias_directories: "aliases",
  connection: "security",
  smtp_tokens: "bridge",
  plans: "billing",
  subscription: "billing",
  about: "feedback",
  help: "feedback",
};

const SECTION_TAB_ALIASES: Record<
  string,
  { section: SettingsSection; tab: string }
> = {
  accessibility: { section: "appearance", tab: "accessibility" },
  trusted_devices: { section: "security", tab: "trusted_devices" },
  encryption: { section: "security", tab: "encryption" },
  family: { section: "billing", tab: "family" },
  categories: { section: "behavior", tab: "categories" },
  signature: { section: "compose", tab: "signature" },
  signatures: { section: "compose", tab: "signature" },
  templates: { section: "compose", tab: "templates" },
  filters: { section: "mail_rules", tab: "rules" },
  rules: { section: "mail_rules", tab: "rules" },
  sender_filters: { section: "mail_rules", tab: "blocked" },
  blocked: { section: "mail_rules", tab: "blocked" },
  allowlist: { section: "mail_rules", tab: "allowlist" },
  auto_forward: { section: "mail_rules", tab: "auto_forward" },
  vacation_reply: { section: "mail_rules", tab: "vacation_reply" },
  external_accounts: { section: "import", tab: "external_accounts" },
  export: { section: "import", tab: "export" },
  updates: { section: "feedback", tab: "updates" },
  developer: { section: "feedback", tab: "developer" },
};

export interface NavTarget {
  section: SettingsSection;
  tab?: string;
}

export function resolve_nav_target(candidate: string): NavTarget {
  if (is_settings_section(candidate)) return { section: candidate };

  const tab_alias = SECTION_TAB_ALIASES[candidate];

  if (tab_alias) return { section: tab_alias.section, tab: tab_alias.tab };

  const alias = SECTION_ALIASES[candidate];

  return { section: alias ?? (candidate as SettingsSection) };
}

export function resolve_settings_section(
  candidate: string | null | undefined,
): SettingsSection | undefined {
  if (!candidate) return undefined;
  const key = candidate.trim();

  if (is_settings_section(key)) return key;

  const tab_alias = SECTION_TAB_ALIASES[key];

  if (tab_alias) return tab_alias.section;

  return SECTION_ALIASES[key];
}

export function settings_tab_for(
  candidate: string | null | undefined,
): string | undefined {
  if (!candidate) return undefined;

  return SECTION_TAB_ALIASES[candidate.trim()]?.tab;
}
