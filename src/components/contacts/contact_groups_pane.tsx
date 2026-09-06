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

import {
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { Spinner, Tooltip } from "@aster/ui";

import { ContactGroupGlyph } from "@/components/common/contacts/contact_group_glyph";
import { use_i18n } from "@/lib/i18n/context";

interface ContactGroupsPaneProps {
  groups: ContactGroup[];
  is_loading: boolean;
  query: string;
  on_create: () => void;
  on_delete: (group: ContactGroup) => void;
  on_edit: (group: ContactGroup) => void;
  on_open: (group: ContactGroup) => void;
  count_of?: (group: ContactGroup) => number;
}

export function ContactGroupsPane({
  groups,
  is_loading,
  query,
  on_create,
  on_delete,
  on_edit,
  on_open,
  count_of,
}: ContactGroupsPaneProps) {
  const { t } = use_i18n();
  const needle = query.trim().toLowerCase();
  const visible_groups = needle
    ? groups.filter((group) => group.name.toLowerCase().includes(needle))
    : groups;

  if (is_loading && groups.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-4 text-center">
        <UserGroupIcon
          className="h-12 w-12 text-txt-muted"
          strokeWidth={1.25}
        />
        <p className="mt-4 text-[14px] font-medium text-txt-primary">
          {t("common.no_groups_yet")}
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-txt-muted">
          {t("common.group_modal_description")}
        </p>
        <button
          className="quick_contacts_cta mt-5 flex items-center gap-1.5 rounded-full py-2 ps-3 pe-4 text-[13.5px] font-medium"
          type="button"
          onClick={on_create}
        >
          <PlusIcon className="h-4 w-4" />
          {t("common.new_group")}
        </button>
      </div>
    );
  }

  if (visible_groups.length === 0) {
    return (
      <p className="flex flex-1 items-center justify-center px-3 text-center text-[13px] text-txt-muted">
        {t("common.no_groups_match")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1 pt-1">
      {visible_groups.map((group) => (
        <div
          key={group.id}
          className="quick_contacts_row group flex items-center gap-2.5 rounded-[10px] py-1.5 pe-1 ps-3"
        >
          <button
            className="flex min-w-0 flex-1 items-center gap-2.5 text-start"
            type="button"
            onClick={() => on_open(group)}
          >
            <ContactGroupGlyph color={group.color} icon={group.icon} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] text-txt-primary">
                {group.name}
              </span>
              <span className="block truncate text-[12px] text-txt-muted">
                {t("common.group_contact_count", {
                  count: count_of ? count_of(group) : group.contact_count,
                })}
              </span>
            </span>
          </button>
          <span className="flex flex-shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <Tooltip position="top" tip={t("common.edit")}>
              <button
                aria-label={t("common.edit")}
                className="quick_contacts_action flex h-7 w-7 items-center justify-center rounded-full"
                type="button"
                onClick={() => on_edit(group)}
              >
                <PencilIcon className="h-4 w-4" />
              </button>
            </Tooltip>
            <Tooltip position="top" tip={t("common.delete_group")}>
              <button
                aria-label={t("common.delete_group")}
                className="quick_contacts_action flex h-7 w-7 items-center justify-center rounded-full"
                type="button"
                onClick={() => on_delete(group)}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </Tooltip>
          </span>
        </div>
      ))}
    </div>
  );
}
