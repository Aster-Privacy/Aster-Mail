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

import { use_preferences } from "@/contexts/preferences_context";
import {
  SIDEBAR_HIDEABLE_MAIL_ITEM_IDS,
  can_move_sidebar_section,
  is_default_sidebar_layout,
  is_sidebar_item_hidden,
  move_sidebar_section,
  reset_sidebar_hidden_items,
  reset_sidebar_section_order,
  resolve_sidebar_section_order,
  set_sidebar_item_hidden,
} from "@/lib/sidebar_layout";

export const SIDEBAR_SECTION_LABEL_KEYS: Record<
  SidebarSectionId,
  TranslationKey
> = {
  mail: "common.mail",
  folders: "common.folders",
  labels: "common.labels",
  aliases: "common.aliases",
};

export const SIDEBAR_MAIL_ITEM_LABEL_KEYS: Record<
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

export function use_sidebar_layout_controls() {
  const { preferences, update_preference, update_preferences } =
    use_preferences();

  const order = preferences.sidebar_section_order;
  const hidden = preferences.sidebar_hidden_items;

  return {
    sections: resolve_sidebar_section_order(order),
    mail_item_ids: SIDEBAR_HIDEABLE_MAIL_ITEM_IDS,
    is_default: is_default_sidebar_layout(order, hidden),
    is_hidden: (id: SidebarHideableItemId) =>
      is_sidebar_item_hidden(hidden, id),
    can_move: (id: SidebarSectionId, direction: -1 | 1) =>
      can_move_sidebar_section(order, id, direction),
    set_hidden: (id: SidebarHideableItemId, should_hide: boolean) => {
      update_preference(
        "sidebar_hidden_items",
        set_sidebar_item_hidden(hidden, id, should_hide),
        true,
      );
    },
    move: (id: SidebarSectionId, direction: -1 | 1) => {
      update_preference(
        "sidebar_section_order",
        move_sidebar_section(order, id, direction),
        true,
      );
    },
    reset: () => {
      update_preferences(
        {
          sidebar_section_order: reset_sidebar_section_order(order),
          sidebar_hidden_items: reset_sidebar_hidden_items(hidden),
        },
        true,
      );
    },
  };
}
