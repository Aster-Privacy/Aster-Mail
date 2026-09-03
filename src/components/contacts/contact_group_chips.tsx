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
import type { TranslationKey } from "@/lib/i18n/types";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";

import { ContactGroupModal } from "@/components/contacts/contact_group_modal";
import { use_contact_groups } from "@/hooks/use_contact_groups";
import { get_contrast_text } from "@/lib/avatar_color";
import { use_i18n } from "@/lib/i18n/context";
import { cn, format_number } from "@/lib/utils";

interface ContactGroupChipsProps {
  filter_by: FilterOption;
  set_filter_by: (filter: FilterOption) => void;
  group_filter: string | null;
  on_set_group_filter: (group_id: string | null) => void;
  upcoming_birthdays_count: number;
}

const attribute_filters: { option: FilterOption; label_key: TranslationKey }[] =
  [
    { option: "has_email", label_key: "common.has_email" },
    { option: "has_phone", label_key: "common.has_phone" },
    { option: "has_company", label_key: "common.has_company" },
  ];

const chip_base =
  "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] whitespace-nowrap border transition-colors";

const chip_active = "bg-brand border-brand text-[var(--accent-fg,#ffffff)]";

const chip_inactive =
  "bg-surf-secondary border-edge-primary text-txt-secondary hover:bg-surf-hover";

export function ContactGroupChips({
  filter_by,
  set_filter_by,
  group_filter,
  on_set_group_filter,
  upcoming_birthdays_count,
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
          className={cn(chip_base, is_all ? chip_active : chip_inactive)}
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
              ? chip_active
              : chip_inactive,
          )}
          type="button"
          onClick={() => {
            on_set_group_filter(null);
            set_filter_by(filter_by === "favorites" ? "all" : "favorites");
          }}
        >
          {t("common.favorites")}
        </button>

        {upcoming_birthdays_count > 0 && (
          <button
            aria-pressed={filter_by === "upcoming_birthdays" && !group_filter}
            className={cn(
              chip_base,
              filter_by === "upcoming_birthdays" && !group_filter
                ? chip_active
                : chip_inactive,
            )}
            type="button"
            onClick={() => {
              on_set_group_filter(null);
              set_filter_by(
                filter_by === "upcoming_birthdays"
                  ? "all"
                  : "upcoming_birthdays",
              );
            }}
          >
            {t("common.birthday")}
            <span
              className={
                filter_by === "upcoming_birthdays" && !group_filter
                  ? "opacity-80"
                  : "text-txt-muted"
              }
            >
              {format_number(upcoming_birthdays_count)}
            </span>
          </button>
        )}

        {attribute_filters.map(({ option, label_key }) => {
          const is_active = filter_by === option && !group_filter;

          return (
            <button
              key={option}
              aria-pressed={is_active}
              className={cn(chip_base, is_active ? chip_active : chip_inactive)}
              type="button"
              onClick={() => {
                on_set_group_filter(null);
                set_filter_by(is_active ? "all" : option);
              }}
            >
              {t(label_key)}
            </button>
          );
        })}

        {groups.map((group) => {
          const is_active = group_filter === group.id;

          return (
            <button
              key={group.id}
              aria-pressed={is_active}
              className={cn(
                chip_base,
                is_active ? "border-transparent" : chip_inactive,
              )}
              style={
                is_active
                  ? {
                      backgroundColor: group.color,
                      borderColor: group.color,
                      color: get_contrast_text(group.color),
                    }
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
                className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  is_active && "opacity-70",
                )}
                style={{
                  backgroundColor: is_active
                    ? get_contrast_text(group.color)
                    : group.color,
                }}
              />
              <span className="truncate max-w-[10rem]">{group.name}</span>
              {group.contact_count > 0 && (
                <span
                  className={cn(
                    "tabular-nums",
                    is_active ? "opacity-70" : "text-txt-muted",
                  )}
                >
                  {format_number(group.contact_count)}
                </span>
              )}
            </button>
          );
        })}

        <button
          className={cn(
            chip_base,
            "bg-surf-secondary border-dashed border-edge-primary text-txt-muted hover:bg-surf-hover",
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
