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
import type { SettingsSection } from "@/components/settings/settings_content";

import { memo } from "react";
import { AtSymbolIcon } from "@heroicons/react/24/outline";
import {
  SidebarEmptyText,
  SidebarMoreToggle,
  SidebarRailSectionButton,
  SidebarSectionAddButton,
  SidebarSectionToggle,
  SidebarTagRow,
} from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_delayed_flag } from "@/hooks/use_delayed_flag";
import { CountBadge } from "@/components/common/count_badge";
import { NavSectionSkeleton } from "@/components/common/nav_section_skeleton";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { RailUnreadDot } from "@/components/common/rail_unread_dot";
import { AliasNavIcon } from "@/components/common/alias_nav_icon";
import { AliasContextMenu } from "@/components/layout/sidebar/alias_context_menu";

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
  unread_counts?: Record<string, number>;
  load_failed?: boolean;
  on_retry?: () => void;
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
  unread_counts = {},
  load_failed = false,
  on_retry,
}: SidebarAliasesProps) {
  const { t } = use_i18n();
  const skeleton_visible = use_delayed_flag(is_loading);

  const max_visible = is_collapsed ? 3 : 5;
  const has_more = aliases.length > max_visible;
  const visible_aliases = aliases_expanded
    ? aliases
    : aliases.slice(0, max_visible);
  const hidden_count = aliases.length - max_visible;

  return (
    <>
      <SidebarSectionToggle
        is_collapsed={is_collapsed}
        label={t("common.aliases")}
        on_toggle={on_toggle_section ?? (() => {})}
        right_slot={
          <SidebarSectionAddButton
            label={t("settings.create_alias")}
            on_click={on_create_alias}
          />
        }
        section_collapsed={section_collapsed}
      />

      {is_collapsed && (
        <SidebarRailSectionButton
          icon={AtSymbolIcon}
          icon_style={{ color: "var(--accent-color)" }}
          label={t("common.aliases")}
          on_click={() => on_settings_click("aliases")}
        />
      )}

      <div>
        {!section_collapsed &&
          visible_aliases.map((alias) => {
            const alias_item_id = `alias-${alias.full_address}`;
            const unread_count = alias.alias_address_hash
              ? (unread_counts[alias.alias_address_hash] ?? 0)
              : 0;
            const selected = effective_selected === alias_item_id;

            return (
              <AliasContextMenu
                key={alias.id}
                alias={alias}
                on_manage={() => on_settings_click("aliases")}
              >
                <SidebarTagRow
                  rail_tip
                  button_ref={(el: HTMLButtonElement | null) => {
                    alias_refs.current[alias.full_address] = el;
                  }}
                  collapsed_slot={
                    <RailUnreadDot
                      count={unread_count}
                      label={alias.full_address}
                    />
                  }
                  icon_slot={
                    <AliasNavIcon
                      address={alias.full_address}
                      is_random={alias.is_random}
                      profile_picture={alias.profile_picture}
                      size={is_collapsed ? 24 : 20}
                    />
                  }
                  is_collapsed={is_collapsed}
                  label={alias.full_address}
                  on_click={() =>
                    handle_nav_click(() => {
                      set_selected_item(alias_item_id);
                      navigate(
                        `/alias/${encodeURIComponent(alias.full_address)}`,
                      );
                    })
                  }
                  selected={selected}
                  trailing={
                    <CountBadge count={unread_count} is_active={selected} />
                  }
                />
              </AliasContextMenu>
            );
          })}
        {has_more && !is_collapsed && !section_collapsed && (
          <SidebarMoreToggle
            expanded={aliases_expanded}
            hidden_count={hidden_count}
            less_label={t("common.show_less")}
            more_label={t("common.more_aliases", { count: hidden_count })}
            on_toggle={() => set_aliases_expanded(!aliases_expanded)}
          />
        )}
        {aliases.length === 0 &&
          skeleton_visible &&
          !is_collapsed &&
          !section_collapsed && <NavSectionSkeleton rows={2} />}
        {aliases.length === 0 &&
          !is_loading &&
          !is_collapsed &&
          !section_collapsed &&
          (load_failed && on_retry ? (
            <LoadFailedNotice on_retry={on_retry} />
          ) : (
            <SidebarEmptyText>{t("common.no_aliases_yet")}</SidebarEmptyText>
          ))}
      </div>
    </>
  );
});
