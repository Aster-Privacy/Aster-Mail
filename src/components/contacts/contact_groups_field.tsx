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
import type { DecryptedContact } from "@/types/contacts";

import { useMemo } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { ManageGroupsMenu } from "@/components/contacts/manage_groups_menu";
import { use_contact_groups } from "@/hooks/use_contact_groups";
import { use_i18n } from "@/lib/i18n/context";

interface ContactGroupsFieldProps {
  contact: DecryptedContact;
  on_toggle_group: (group_id: string, should_add: boolean) => void;
}

export function ContactGroupsField({
  contact,
  on_toggle_group,
}: ContactGroupsFieldProps) {
  const { t } = use_i18n();
  const { groups } = use_contact_groups();

  const contact_groups = useMemo(() => {
    const ids = new Set(contact.groups || []);

    return groups.filter((group) => ids.has(group.id));
  }, [groups, contact.groups]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {contact_groups.map((group) => (
        <span
          key={group.id}
          className="inline-flex items-center gap-1.5 h-7 ps-2.5 pe-1 rounded-full text-[12px] border"
          style={{
            backgroundColor: `${group.color}1f`,
            borderColor: `${group.color}66`,
          }}
        >
          <span
            aria-hidden="true"
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: group.color }}
          />
          <span className="truncate max-w-[10rem] text-txt-primary">
            {group.name}
          </span>
          <button
            aria-label={t("common.remove")}
            className="w-5 h-5 inline-flex items-center justify-center rounded-full text-txt-muted hover:bg-black/10 dark:hover:bg-white/10"
            type="button"
            onClick={() => on_toggle_group(group.id, false)}
          >
            <XMarkIcon className="w-3 h-3" />
          </button>
        </span>
      ))}

      {contact_groups.length === 0 && (
        <span className="text-[12px] text-txt-muted pe-1">
          {t("common.no_contact_groups_yet")}
        </span>
      )}

      <ManageGroupsMenu
        on_set_membership={on_toggle_group}
        selected_contacts={[contact]}
      />
    </div>
  );
}
