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
import type { SidebarSectionId } from "@/lib/sidebar_layout";

import { Switch } from "@aster/ui";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import {
  SIDEBAR_MAIL_ITEM_LABEL_KEYS,
  SIDEBAR_SECTION_LABEL_KEYS,
  use_sidebar_layout_controls,
} from "@/components/settings/behavior_section/use_sidebar_layout_controls";
import { SettingsGroup, SettingsRow } from "@/pages/mobile/settings/shared";

const MOVE_BUTTON_CLASS =
  "inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] active:bg-[var(--bg-tertiary)] disabled:opacity-30";

export function MobileSidebarLayoutGroups() {
  const { t } = use_i18n();
  const layout = use_sidebar_layout_controls();

  const render_move_buttons = (id: SidebarSectionId, name: string) => (
    <span className="flex items-center">
      <button
        aria-label={t("settings.sidebar_move_section_up", { name })}
        className={MOVE_BUTTON_CLASS}
        disabled={!layout.can_move(id, -1)}
        type="button"
        onClick={() => layout.move(id, -1)}
      >
        <ChevronUpIcon aria-hidden="true" className="h-4 w-4" />
      </button>
      <button
        aria-label={t("settings.sidebar_move_section_down", { name })}
        className={MOVE_BUTTON_CLASS}
        disabled={!layout.can_move(id, 1)}
        type="button"
        onClick={() => layout.move(id, 1)}
      >
        <ChevronDownIcon aria-hidden="true" className="h-4 w-4" />
      </button>
    </span>
  );

  return (
    <>
      <SettingsGroup title={t("settings.sidebar_layout")}>
        {layout.sections.map((id) => {
          const name = t(SIDEBAR_SECTION_LABEL_KEYS[id]);

          return (
            <SettingsRow
              key={id}
              description={
                id === "mail"
                  ? t("settings.sidebar_mail_section_description")
                  : undefined
              }
              label={name}
              trailing={
                <span className="flex items-center gap-1">
                  {render_move_buttons(id, name)}
                  {id !== "mail" && (
                    <Switch
                      aria-label={name}
                      checked={!layout.is_hidden(id)}
                      onCheckedChange={(checked) =>
                        layout.set_hidden(id, !checked)
                      }
                    />
                  )}
                </span>
              }
            />
          );
        })}
      </SettingsGroup>

      <SettingsGroup title={t("settings.sidebar_mail_items")}>
        {layout.mail_item_ids.map((id) => {
          const name = t(SIDEBAR_MAIL_ITEM_LABEL_KEYS[id]);

          return (
            <SettingsRow
              key={id}
              label={name}
              trailing={
                <Switch
                  aria-label={name}
                  checked={!layout.is_hidden(id)}
                  onCheckedChange={(checked) => layout.set_hidden(id, !checked)}
                />
              }
            />
          );
        })}
        <button
          className="flex w-full items-center px-4 py-3.5 text-start text-[15px] text-[var(--accent-blue)] active:bg-[var(--mobile-bg-card-hover)] disabled:text-[var(--text-muted)] disabled:opacity-60"
          disabled={layout.is_default}
          type="button"
          onClick={layout.reset}
        >
          {t("settings.reset_sidebar_layout")}
        </button>
      </SettingsGroup>
    </>
  );
}
