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
import type { MutableRefObject } from "react";
import type { DecryptedEmailAlias } from "@/services/api/aliases";
import type { SettingsSection } from "@/components/settings/settings_panel";

import { memo, useMemo } from "react";
import {
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronRightIcon,
  AtSymbolIcon,
  BoltIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { PROFILE_COLORS, get_gradient_background } from "@/constants/profile";

function get_alias_color(address: string): string {
  let hash = 0;

  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) | 0;
  }

  return PROFILE_COLORS[Math.abs(hash) % PROFILE_COLORS.length];
}

function AliasIcon({
  address,
  is_random,
  size,
}: {
  address: string;
  is_random: boolean;
  size: number;
}) {
  const gradient = useMemo(
    () => get_gradient_background(get_alias_color(address)),
    [address],
  );
  const icon_size = size >= 20 ? "w-4 h-4" : "w-3.5 h-3.5";

  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: gradient,
        boxShadow:
          "inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.15)",
      }}
    >
      {is_random ? (
        <BoltIcon className={`${icon_size} text-white`} />
      ) : (
        <AtSymbolIcon className={`${icon_size} text-white`} />
      )}
    </div>
  );
}

interface SidebarAliasesProps {
  is_collapsed: boolean;
  effective_selected: string | null;
  aliases: DecryptedEmailAlias[];
  aliases_expanded: boolean;
  set_aliases_expanded: (expanded: boolean) => void;
  is_loading: boolean;
  handle_nav_click: (callback: () => void) => void;
  set_selected_item: (item: string) => void;
  navigate: (path: string) => void;
  on_settings_click: (section?: SettingsSection) => void;
  on_create_alias: () => void;
  alias_refs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  section_collapsed?: boolean;
  on_toggle_section?: () => void;
}

export const SidebarAliases = memo(function SidebarAliases({
  is_collapsed,
  effective_selected,
  aliases,
  aliases_expanded,
  set_aliases_expanded,
  is_loading,
  handle_nav_click,
  set_selected_item,
  navigate,
  on_settings_click,
  on_create_alias,
  alias_refs,
  section_collapsed = false,
  on_toggle_section,
}: SidebarAliasesProps) {
  const { t } = use_i18n();

  const max_visible = is_collapsed ? 3 : 5;
  const has_more = aliases.length > max_visible;
  const visible_aliases = aliases_expanded
    ? aliases
    : aliases.slice(0, max_visible);
  const hidden_count = aliases.length - max_visible;

  return (
    <>
      {!is_collapsed && (
        <div className="mt-5 mb-1 px-2.5">
          <div className="w-full flex items-center justify-between">
            <button
              className="flex-1 flex items-center gap-1 py-1 text-txt-muted opacity-70 hover:opacity-100"
              onClick={on_toggle_section}
            >
              {section_collapsed ? (
                <ChevronRightIcon className="w-3 h-3" />
              ) : (
                <ChevronDownIcon className="w-3 h-3" />
              )}
              <span className="text-[10px] font-semibold uppercase tracking-[0.05em]">
                {t("common.aliases")}
              </span>
            </button>
            <button
              className="p-1 rounded-md  hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-txt-muted"
              onClick={on_create_alias}
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {is_collapsed && (
        <div className="mt-3 flex justify-center">
          <button
            className="p-1.5 rounded  hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-txt-muted"
            title={t("common.aliases")}
            onClick={() => on_settings_click("aliases")}
          >
            <AtSymbolIcon className="w-4 h-4" style={{ color: "#8b5cf6" }} />
          </button>
        </div>
      )}

      <div>
        {!section_collapsed &&
          visible_aliases.map((alias) => {
            const alias_item_id = `alias-${alias.full_address}`;

            return (
              <button
                key={alias.id}
                ref={(el) => {
                  alias_refs.current[alias.full_address] = el;
                }}
                className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-md ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px]  ${effective_selected === alias_item_id ? "sidebar-active" : ""} ${is_collapsed && effective_selected === alias_item_id ? "sidebar-selected" : ""}`}
                style={{
                  zIndex: 1,
                  color:
                    effective_selected === alias_item_id
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  backgroundColor:
                    is_collapsed && effective_selected === alias_item_id
                      ? "var(--indicator-bg)"
                      : undefined,
                }}
                title={is_collapsed ? alias.full_address : undefined}
                onClick={() =>
                  handle_nav_click(() => {
                    set_selected_item(alias_item_id);
                    navigate(
                      `/alias/${encodeURIComponent(alias.full_address)}`,
                    );
                  })
                }
              >
                <AliasIcon
                  address={alias.full_address}
                  is_random={alias.is_random}
                  size={is_collapsed ? 24 : 20}
                />
                {!is_collapsed && (
                  <span className="flex-1 text-left truncate leading-4">
                    {alias.full_address}
                  </span>
                )}
              </button>
            );
          })}
        {has_more && !is_collapsed && !section_collapsed && (
          <button
            className="w-full flex items-center gap-2 px-2.5 h-7 text-[12px]  rounded-md hover:bg-black/[0.03] dark:hover:bg-white/[0.04] text-txt-muted"
            onClick={() => set_aliases_expanded(!aliases_expanded)}
          >
            {aliases_expanded ? (
              <ChevronUpIcon className="w-3.5 h-3.5" />
            ) : (
              <ChevronDownIcon className="w-3.5 h-3.5" />
            )}
            <span>
              {aliases_expanded
                ? t("common.show_less")
                : `${hidden_count} more`}
            </span>
          </button>
        )}
        {aliases.length === 0 &&
          !is_loading &&
          !is_collapsed &&
          !section_collapsed && (
            <p className="text-[11px] px-2.5 py-2 text-txt-muted">
              {t("common.no_aliases_yet")}
            </p>
          )}
      </div>
    </>
  );
});
