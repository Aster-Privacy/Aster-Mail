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
import type { SearchEntry } from "@/components/settings/search_registry";
import type { TranslationKey } from "@/lib/i18n/types";
import type { SettingsSection } from "./shared";

import { useCallback } from "react";
import {
  ChevronRightIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { SettingsGroup } from "./shared";
import { resolve_mobile_section } from "./section_routing";

import {
  use_settings_search,
  type SettingsSearchHit,
} from "@/components/settings/use_settings_search";
import { is_searchable_query } from "@/components/settings/settings_search_match";
import { use_i18n } from "@/lib/i18n/context";

const SEARCH_ONLY_SECTIONS: Record<string, SettingsSection> = {
  sound: "notifications",
};

const SECTION_LABEL_KEYS: Record<SettingsSection, TranslationKey> = {
  account: "settings.account",
  appearance: "settings.appearance",
  accessibility: "settings.accessibility",
  security: "settings.security",
  encryption: "settings.encryption",
  trusted_devices: "settings.trusted_devices",
  aliases: "settings.alias_tab_aliases",
  domains: "settings.alias_tab_domains",
  ghost_aliases: "settings.ghost_aliases",
  alias_directories: "settings.alias_directories_title",
  storage: "settings.storage",
  billing: "settings.billing",
  referral: "settings.invite_friends",
  family: "settings.family_plan_title",
  notifications: "settings.notifications",
  behavior: "settings.behavior",
  signatures: "settings.signature",
  templates: "settings.templates",
  sender_filters: "settings.mail_management",
  mail_rules: "mail_rules.title",
  import: "common.import",
  external_accounts: "settings.external_accounts",
  connection: "settings.connection",
  bridge: "settings.bridge",
  about: "settings.about",
  feedback: "settings.feedback",
  developer: "settings.developer",
};

export function resolve_search_section(
  section: string,
): SettingsSection | null {
  return SEARCH_ONLY_SECTIONS[section] ?? resolve_mobile_section(section);
}

export function is_settings_search_active(query: string): boolean {
  return is_searchable_query(query);
}

interface MobileSettingsSearchProps {
  query: string;
  on_query_change: (query: string) => void;
  has_devices: boolean;
  dev_mode_enabled: boolean;
  is_family_plan: boolean;
  on_select: (hit: SettingsSearchHit, section: SettingsSection) => void;
}

export function MobileSettingsSearch({
  query,
  on_query_change,
  has_devices,
  dev_mode_enabled,
  is_family_plan,
  on_select,
}: MobileSettingsSearchProps) {
  const { t } = use_i18n();

  const is_available = useCallback(
    (entry: SearchEntry) => {
      const section = resolve_search_section(entry.section);

      if (!section) return false;
      if (section === "developer") return dev_mode_enabled;
      if (section === "family") return is_family_plan;
      if (section === "trusted_devices") return has_devices;

      return true;
    },
    [dev_mode_enabled, is_family_plan, has_devices],
  );

  const section_label = useCallback(
    (entry: SearchEntry) => {
      const section = resolve_search_section(entry.section);

      return section ? t(SECTION_LABEL_KEYS[section]) : undefined;
    },
    [t],
  );

  const hits = use_settings_search(query, {
    platform: "mobile",
    is_available,
    section_label,
  });
  const is_active = is_settings_search_active(query);

  return (
    <div className="pb-1">
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 rounded-xl bg-[var(--mobile-bg-card)] px-3 py-2.5">
          <MagnifyingGlassIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          <input
            aria-label={t("settings.search_placeholder")}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            enterKeyHint="search"
            placeholder={t("settings.search_placeholder")}
            spellCheck={false}
            type="search"
            value={query}
            onChange={(event) => on_query_change(event.target.value)}
          />
          {query && (
            <button
              aria-label={t("common.clear")}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] active:opacity-70"
              type="button"
              onClick={() => on_query_change("")}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {is_active &&
        (hits.length === 0 ? (
          <p className="px-5 pt-6 text-center text-[14px] text-[var(--text-muted)]">
            {t("common.no_results")}
          </p>
        ) : (
          <SettingsGroup>
            {hits.map((hit) => {
              const section = resolve_search_section(hit.entry.section);
              const crumb = [hit.section_label, hit.crumb]
                .filter((part) => part && part !== hit.label)
                .join(" > ");

              if (!section) return null;

              return (
                <button
                  key={hit.entry.id}
                  className="flex w-full items-center gap-3 px-4 py-3 text-start active:opacity-80"
                  type="button"
                  onClick={() => on_select(hit, section)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-[var(--text-primary)]">
                      {hit.label}
                    </span>
                    {crumb && (
                      <span className="block truncate text-[12px] text-[var(--text-muted)]">
                        {crumb}
                      </span>
                    )}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)] rtl:-scale-x-100" />
                </button>
              );
            })}
          </SettingsGroup>
        ))}
    </div>
  );
}
