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
import type { FilterOption } from "@/components/common/hooks/use_contacts_state";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";

import { ContactGroupModal } from "@/components/contacts/contact_group_modal";
import { use_contact_groups } from "@/hooks/use_contact_groups";
import { use_i18n } from "@/lib/i18n/context";
import { cn, format_number } from "@/lib/utils";

interface ContactGroupChipsProps {
  filter_by: FilterOption;
  set_filter_by: (filter: FilterOption) => void;
  group_filter: string | null;
  on_set_group_filter: (group_id: string | null) => void;
}

const chip_base =
  "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] whitespace-nowrap border transition-colors";

export function ContactGroupChips({
  filter_by,
  set_filter_by,
  group_filter,
  on_set_group_filter,
}: ContactGroupChipsProps) {
  const { t } = use_i18n();
  const { groups } = use_contact_groups();
  const [is_create_open, set_is_create_open] = useState(false);

  const is_all = !group_filter && filter_by === "all";

  return (
    <>
      <div className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto border-b border-edge-primary">
        <button
          aria-pressed={is_all}
          className={cn(
            chip_base,
            is_all
              ? "bg-brand/10 border-brand/40 text-txt-primary"
              : "border-edge-primary text-txt-secondary hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
          )}
          type="button"
          onClick={() => {
            set_filter_by("all");
            on_set_group_filter(null);
          }}
        >
          {t("mail.all")}
        </button>

        <button
          aria-pressed={filter_by === "favorites" && !group_filter}
          className={cn(
            chip_base,
            filter_by === "favorites" && !group_filter
              ? "bg-brand/10 border-brand/40 text-txt-primary"
              : "border-edge-primary text-txt-secondary hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
          )}
          type="button"
          onClick={() => {
            on_set_group_filter(null);
            set_filter_by(filter_by === "favorites" ? "all" : "favorites");
          }}
        >
          {t("common.favorites")}
        </button>

        {groups.map((group) => {
          const is_active = group_filter === group.id;

          return (
            <button
              key={group.id}
              aria-pressed={is_active}
              className={cn(
                chip_base,
                is_active
                  ? "border-transparent text-txt-primary"
                  : "border-edge-primary text-txt-secondary hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
              )}
              style={
                is_active
                  ? { backgroundColor: `${group.color}26`, borderColor: group.color }
                  : undefined
              }
              type="button"
              onClick={() => {
                set_filter_by("all");
                on_set_group_filter(is_active ? null : group.id);
              }}
            >
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: group.color }}
              />
              <span className="truncate max-w-[10rem]">{group.name}</span>
              {group.contact_count > 0 && (
                <span className="tabular-nums text-txt-muted">
                  {format_number(group.contact_count)}
                </span>
              )}
            </button>
          );
        })}

        <button
          aria-label={t("common.create_contact_group")}
          className={cn(
            chip_base,
            "border-dashed border-edge-primary text-txt-muted hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
          )}
          type="button"
          onClick={() => set_is_create_open(true)}
        >
          <PlusIcon aria-hidden="true" className="w-3.5 h-3.5" />
          {t("common.new_group")}
        </button>
      </div>

      <ContactGroupModal
        is_open={is_create_open}
        on_close={() => set_is_create_open(false)}
      />
    </>
  );
}
