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
import type { TranslationKey } from "@/lib/i18n/types";
import type {
  SidebarHideableItemId,
  SidebarSectionId,
} from "@/lib/sidebar_layout";

import { Button, SettingControlRow, SettingToggleRow } from "@aster/ui";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  DEFAULT_SIDEBAR_SECTION_ORDER,
  SIDEBAR_HIDEABLE_MAIL_ITEM_IDS,
  can_move_sidebar_section,
  is_default_sidebar_layout,
  is_sidebar_item_hidden,
  move_sidebar_section,
  resolve_sidebar_section_order,
  set_sidebar_item_hidden,
} from "@/lib/sidebar_layout";

const SECTION_LABEL_KEYS: Record<SidebarSectionId, TranslationKey> = {
  mail: "common.mail",
  folders: "common.folders",
  labels: "common.labels",
  aliases: "common.aliases",
};

const MAIL_ITEM_LABEL_KEYS: Record<
  (typeof SIDEBAR_HIDEABLE_MAIL_ITEM_IDS)[number],
  TranslationKey
> = {
  sent: "mail.sent",
  scheduled: "mail.scheduled",
  snoozed: "mail.snoozed",
  drafts: "mail.drafts",
  contacts: "common.contacts",
  starred: "mail.starred",
  all: "mail.all_mail",
  archive: "mail.archive",
  spam: "mail.spam",
  trash: "mail.trash",
  subscriptions: "common.subscriptions",
};

const MOVE_BUTTON_CLASS =
  "inline-flex h-7 w-7 items-center justify-center rounded-[var(--aster-radius-control)] text-txt-muted outline-none transition-colors hover:bg-surf-hover hover:text-txt-primary focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] disabled:pointer-events-none disabled:opacity-30";

export function SidebarLayoutSetting() {
  const { t } = use_i18n();
  const { preferences, update_preference, update_preferences } =
    use_preferences();

  const order = preferences.sidebar_section_order;
  const hidden = preferences.sidebar_hidden_items;
  const sections = resolve_sidebar_section_order(order);

  const set_hidden = (id: SidebarHideableItemId, should_hide: boolean) => {
    update_preference(
      "sidebar_hidden_items",
      set_sidebar_item_hidden(hidden, id, should_hide),
      true,
    );
  };

  const move = (id: SidebarSectionId, direction: -1 | 1) => {
    update_preference(
      "sidebar_section_order",
      move_sidebar_section(order, id, direction),
      true,
    );
  };

  const reset = () => {
    update_preferences(
      {
        sidebar_section_order: [...DEFAULT_SIDEBAR_SECTION_ORDER],
        sidebar_hidden_items: [],
      },
      true,
    );
  };

  const render_move_buttons = (id: SidebarSectionId, name: string) => (
    <span className="flex items-center gap-0.5">
      <button
        aria-label={t("settings.sidebar_move_section_up", { name })}
        className={MOVE_BUTTON_CLASS}
        disabled={!can_move_sidebar_section(order, id, -1)}
        type="button"
        onClick={() => move(id, -1)}
      >
        <ChevronUpIcon aria-hidden="true" className="h-4 w-4" />
      </button>
      <button
        aria-label={t("settings.sidebar_move_section_down", { name })}
        className={MOVE_BUTTON_CLASS}
        disabled={!can_move_sidebar_section(order, id, 1)}
        type="button"
        onClick={() => move(id, 1)}
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
            disabled={is_default_sidebar_layout(order, hidden)}
            size="sm"
            variant="outline"
            onClick={reset}
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
        {sections.map((id) => {
          const name = t(SECTION_LABEL_KEYS[id]);

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
              checked={!is_sidebar_item_hidden(hidden, id)}
              label={name}
              trailing={render_move_buttons(id, name)}
              on_change={(checked) => set_hidden(id, !checked)}
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
        {SIDEBAR_HIDEABLE_MAIL_ITEM_IDS.map((id) => (
          <SettingToggleRow
            key={id}
            checked={!is_sidebar_item_hidden(hidden, id)}
            label={t(MAIL_ITEM_LABEL_KEYS[id])}
            on_change={(checked) => set_hidden(id, !checked)}
          />
        ))}
      </>
    </>
  );
}
