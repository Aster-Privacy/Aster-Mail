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
import type { ContactGroup } from "@/types/contacts";
import type { TranslationKey } from "@/lib/i18n/types";

import { useCallback, useState } from "react";
import { UserGroupIcon } from "@heroicons/react/24/outline";

import { ContactGroupGlyph } from "@/components/common/contacts/contact_group_glyph";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { list_contact_groups } from "@/services/api/contacts";

interface ContactGroupAssignMenuProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  on_select: (group: ContactGroup) => void;
}

export function ContactGroupAssignMenu({
  t,
  on_select,
}: ContactGroupAssignMenuProps) {
  const [groups, set_groups] = useState<ContactGroup[]>([]);
  const [is_loading, set_is_loading] = useState(false);

  const handle_open_change = useCallback(async (open: boolean) => {
    if (!open) return;

    set_is_loading(true);

    const response = await list_contact_groups();

    set_is_loading(false);
    if (response.data) set_groups(response.data.groups);
  }, []);

  return (
    <DropdownMenu onOpenChange={(open) => void handle_open_change(open)}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t("common.add_to_group")}
          className="h-8 w-8 inline-flex items-center justify-center rounded-[8px] text-txt-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          type="button"
        >
          <UserGroupIcon className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {is_loading && groups.length === 0 ? (
          <DropdownMenuItem disabled>{t("common.loading")}</DropdownMenuItem>
        ) : groups.length === 0 ? (
          <DropdownMenuItem disabled>
            {t("common.no_groups_yet")}
          </DropdownMenuItem>
        ) : (
          groups.map((group) => (
            <DropdownMenuItem key={group.id} onClick={() => on_select(group)}>
              <ContactGroupGlyph
                class_name="me-2"
                color={group.color}
                icon={group.icon}
              />
              <span className="truncate">{group.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
