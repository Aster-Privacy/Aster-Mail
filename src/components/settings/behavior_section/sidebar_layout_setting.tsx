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

import { Button, SettingControlRow, SettingToggleRow } from "@aster/ui";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import {
  SIDEBAR_MAIL_ITEM_LABEL_KEYS,
  SIDEBAR_SECTION_LABEL_KEYS,
  use_sidebar_layout_controls,
} from "@/components/settings/behavior_section/use_sidebar_layout_controls";

const MOVE_BUTTON_CLASS =
  "inline-flex h-7 w-7 items-center justify-center rounded-[var(--aster-radius-control)] text-txt-muted outline-none transition-colors hover:bg-surf-hover hover:text-txt-primary focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] disabled:pointer-events-none disabled:opacity-30";

export function SidebarLayoutSetting() {
  const { t } = use_i18n();
  const layout = use_sidebar_layout_controls();

  const render_move_buttons = (id: SidebarSectionId, name: string) => (
    <span className="flex items-center gap-0.5">
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
      <SettingControlRow
        control={
          <Button
            disabled={layout.is_default}
            size="sm"
            variant="outline"
            onClick={layout.reset}
          >
            {t("settings.reset_sidebar_layout")}
          </Button>
        }
        control_width="auto"
        description={t("settings.sidebar_layout_description")}
        label={t("settings.sidebar_layout")}
        layout="inline"
      />

      <>
        {layout.sections.map((id) => {
          const name = t(SIDEBAR_SECTION_LABEL_KEYS[id]);

          if (id === "mail") {
            return (
              <SettingControlRow
                key={id}
                control={render_move_buttons(id, name)}
                control_width="auto"
                description={t("settings.sidebar_mail_section_description")}
                label={name}
                layout="inline"
              />
            );
          }

          return (
            <SettingToggleRow
              key={id}
              checked={!layout.is_hidden(id)}
              label={name}
              trailing={render_move_buttons(id, name)}
              on_change={(checked) => layout.set_hidden(id, !checked)}
            />
          );
        })}
      </>

      <SettingControlRow
        description={t("settings.sidebar_mail_items_description")}
        label={t("settings.sidebar_mail_items")}
        layout="inline"
      />

      <>
        {layout.mail_item_ids.map((id) => (
          <SettingToggleRow
            key={id}
            checked={!layout.is_hidden(id)}
            label={t(SIDEBAR_MAIL_ITEM_LABEL_KEYS[id])}
            on_change={(checked) => layout.set_hidden(id, !checked)}
          />
        ))}
      </>
    </>
  );
}
