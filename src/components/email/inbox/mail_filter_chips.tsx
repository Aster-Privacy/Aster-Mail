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

import { useCallback, useState } from "react";
import {
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown_menu";
import { use_i18n } from "@/lib/i18n/context";
import { AdvancedSearchModal } from "@/components/search/advanced_search_modal";
import { is_composing } from "@/utils/ime";
import { local_date_key } from "@/utils/date_format";

type DateWindowKey =
  | "any"
  | "custom"
  | "1_day"
  | "3_days"
  | "1_week"
  | "2_weeks"
  | "1_month"
  | "3_months"
  | "6_months"
  | "1_year";

const DATE_WINDOWS: { key: DateWindowKey; days: number }[] = [
  { key: "any", days: 0 },
  { key: "1_day", days: 1 },
  { key: "3_days", days: 3 },
  { key: "1_week", days: 7 },
  { key: "2_weeks", days: 14 },
  { key: "1_month", days: 30 },
  { key: "3_months", days: 90 },
  { key: "6_months", days: 180 },
  { key: "1_year", days: 365 },
];

const DATE_WINDOW_LABEL_KEYS: Record<DateWindowKey, TranslationKey> = {
  any: "mail.search_within_any",
  custom: "mail.chip_custom_range",
  "1_day": "mail.search_within_1_day",
  "3_days": "mail.search_within_3_days",
  "1_week": "mail.search_within_1_week",
  "2_weeks": "mail.search_within_2_weeks",
  "1_month": "mail.search_within_1_month",
  "3_months": "mail.search_within_3_months",
  "6_months": "mail.search_within_6_months",
  "1_year": "mail.search_within_1_year",
};

interface ChipFilters {
  from: string;
  to: string;
  date_window: DateWindowKey;
  custom_after: string;
  custom_before: string;
  has_attachment: boolean;
  is_unread: boolean;
}

const EMPTY_FILTERS: ChipFilters = {
  from: "",
  to: "",
  date_window: "any",
  custom_after: "",
  custom_before: "",
  has_attachment: false,
  is_unread: false,
};

function date_window_boundary(days: number): string {
  const boundary = new Date();

  boundary.setDate(boundary.getDate() - days);

  return local_date_key(boundary);
}

export function build_chip_query(filters: ChipFilters): string {
  const parts: string[] = ["in:all"];

  if (filters.from.trim()) parts.push(`from:${filters.from.trim()}`);
  if (filters.to.trim()) parts.push(`to:${filters.to.trim()}`);
  if (filters.date_window === "custom") {
    if (filters.custom_after) parts.push(`after:${filters.custom_after}`);
    if (filters.custom_before) parts.push(`before:${filters.custom_before}`);
  } else if (filters.date_window !== "any") {
    const window = DATE_WINDOWS.find((w) => w.key === filters.date_window);

    if (window) parts.push(`after:${date_window_boundary(window.days)}`);
  }
  if (filters.has_attachment) parts.push("has:attachment");
  if (filters.is_unread) parts.push("is:unread");

  return parts.join(" ");
}

function has_date_filter(filters: ChipFilters): boolean {
  if (filters.date_window === "any") return false;
  if (filters.date_window === "custom") {
    return !!filters.custom_after || !!filters.custom_before;
  }

  return true;
}

function has_any_filter(filters: ChipFilters): boolean {
  return (
    !!filters.from.trim() ||
    !!filters.to.trim() ||
    has_date_filter(filters) ||
    filters.has_attachment ||
    filters.is_unread
  );
}

const CHIP_BASE_CLASS =
  "inline-flex items-center gap-1 h-7 px-3 rounded-full border text-xs whitespace-nowrap transition-colors";

const CHIP_ACTIVE_CLASS =
  "border-transparent bg-[var(--accent-blue)] text-[var(--accent-fg,#ffffff)]";

const CHIP_IDLE_CLASS =
  "border-[var(--border-secondary)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]";

function chip_class(is_active: boolean): string {
  return `${CHIP_BASE_CLASS} ${is_active ? CHIP_ACTIVE_CLASS : CHIP_IDLE_CLASS}`;
}

function Chip({
  is_active,
  label,
  trailing,
  on_click,
}: {
  is_active: boolean;
  label: string;
  trailing?: React.ReactNode;
  on_click?: () => void;
}) {
  return (
    <button className={chip_class(is_active)} type="button" onClick={on_click}>
      <span>{label}</span>
      {trailing}
    </button>
  );
}

function AddressChip({
  label,
  placeholder,
  value,
  on_apply,
}: {
  label: string;
  placeholder: string;
  value: string;
  on_apply: (next: string) => void;
}) {
  const [draft, set_draft] = useState(value);
  const [is_open, set_is_open] = useState(false);

  return (
    <DropdownMenu
      open={is_open}
      onOpenChange={(open) => {
        set_is_open(open);
        if (open) set_draft(value);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button className={chip_class(!!value)} type="button">
          <span>{value || label}</span>
          <ChevronDownIcon
            className={`w-3 h-3 ${value ? "opacity-80" : "text-[var(--icon-muted)]"}`}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-2">
        <input
          autoFocus
          className="w-full h-8 px-2 rounded-md border bg-[var(--bg-primary)] border-[var(--border-secondary)] text-sm text-[var(--text-primary)] outline-none"
          placeholder={placeholder}
          type="text"
          value={draft}
          onChange={(e) => set_draft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !is_composing(e)) {
              e.preventDefault();
              on_apply(draft);
              set_is_open(false);
            }
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface MailFilterChipsProps {
  on_search_submit: (query: string) => void;
}

export function MailFilterChips({
  on_search_submit,
}: MailFilterChipsProps): React.ReactElement {
  const { t } = use_i18n();
  const [filters, set_filters] = useState<ChipFilters>(EMPTY_FILTERS);
  const [is_advanced_open, set_is_advanced_open] = useState(false);
  const [is_date_open, set_is_date_open] = useState(false);
  const [show_custom_range, set_show_custom_range] = useState(false);

  const apply = useCallback(
    (next: ChipFilters) => {
      set_filters(next);
      on_search_submit(has_any_filter(next) ? build_chip_query(next) : "");
    },
    [on_search_submit],
  );

  const clear = useCallback(() => {
    set_filters(EMPTY_FILTERS);
    set_show_custom_range(false);
    on_search_submit("");
  }, [on_search_submit]);

  const date_label =
    filters.date_window === "custom" && has_date_filter(filters)
      ? [filters.custom_after, filters.custom_before]
          .filter(Boolean)
          .join(" - ")
      : t(DATE_WINDOW_LABEL_KEYS[filters.date_window]);

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto border-b border-[var(--border-secondary)] bg-[var(--bg-primary)]">
        <AddressChip
          label={t("mail.from")}
          on_apply={(next) => apply({ ...filters, from: next })}
          placeholder={t("mail.search_from_placeholder")}
          value={filters.from}
        />

        <DropdownMenu
          open={is_date_open}
          onOpenChange={(open) => {
            set_is_date_open(open);
            if (!open) set_show_custom_range(filters.date_window === "custom");
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              className={chip_class(has_date_filter(filters))}
              type="button"
            >
              <span>{date_label}</span>
              <ChevronDownIcon
                className={`w-3 h-3 ${has_date_filter(filters) ? "opacity-80" : "text-[var(--icon-muted)]"}`}
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {DATE_WINDOWS.map((window) => (
              <DropdownMenuItem
                key={window.key}
                onClick={() => {
                  set_show_custom_range(false);
                  apply({
                    ...filters,
                    date_window: window.key,
                    custom_after: "",
                    custom_before: "",
                  });
                }}
              >
                {t(DATE_WINDOW_LABEL_KEYS[window.key])}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                set_show_custom_range(true);
                set_filters({ ...filters, date_window: "custom" });
              }}
            >
              {`${t("mail.chip_custom_range")}...`}
            </DropdownMenuItem>
            {show_custom_range && (
              <div className="mt-1 pt-2 px-2 pb-1 border-t border-[var(--border-secondary)] flex flex-col gap-2">
                <input
                  aria-label={t("settings.export_scope_date_from")}
                  className="w-full h-8 px-2 rounded-md border bg-[var(--bg-primary)] border-[var(--border-secondary)] text-xs text-[var(--text-primary)] outline-none"
                  max={filters.custom_before || undefined}
                  type="date"
                  value={filters.custom_after}
                  onChange={(event) =>
                    set_filters({
                      ...filters,
                      custom_after: event.target.value,
                    })
                  }
                  onKeyDown={(event) => event.stopPropagation()}
                />
                <input
                  aria-label={t("settings.export_scope_date_to")}
                  className="w-full h-8 px-2 rounded-md border bg-[var(--bg-primary)] border-[var(--border-secondary)] text-xs text-[var(--text-primary)] outline-none"
                  min={filters.custom_after || undefined}
                  type="date"
                  value={filters.custom_before}
                  onChange={(event) =>
                    set_filters({
                      ...filters,
                      custom_before: event.target.value,
                    })
                  }
                  onKeyDown={(event) => event.stopPropagation()}
                />
                <button
                  className="h-8 rounded-md text-xs font-medium bg-[var(--accent-blue)] text-[var(--accent-fg,#ffffff)] hover:opacity-90 transition-opacity disabled:opacity-50"
                  disabled={!filters.custom_after && !filters.custom_before}
                  type="button"
                  onClick={() => {
                    set_is_date_open(false);
                    apply({ ...filters, date_window: "custom" });
                  }}
                >
                  {t("common.apply")}
                </button>
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Chip
          is_active={filters.has_attachment}
          label={t("mail.has_attachments")}
          on_click={() =>
            apply({ ...filters, has_attachment: !filters.has_attachment })
          }
        />

        <AddressChip
          label={t("mail.to")}
          on_apply={(next) => apply({ ...filters, to: next })}
          placeholder={t("mail.search_to_placeholder")}
          value={filters.to}
        />

        <Chip
          is_active={filters.is_unread}
          label={t("mail.unread")}
          on_click={() => apply({ ...filters, is_unread: !filters.is_unread })}
        />

        <button
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs whitespace-nowrap text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          type="button"
          onClick={() => set_is_advanced_open(true)}
        >
          <AdjustmentsHorizontalIcon className="w-3.5 h-3.5 text-[var(--icon-muted)]" />
          <span>{t("mail.advanced_search")}</span>
        </button>

        {has_any_filter(filters) && (
          <button
            aria-label={t("common.clear")}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs whitespace-nowrap text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            type="button"
            onClick={clear}
          >
            <XMarkIcon className="w-3.5 h-3.5 text-[var(--icon-muted)]" />
            <span>{t("common.clear")}</span>
          </button>
        )}
      </div>

      <AdvancedSearchModal
        is_open={is_advanced_open}
        on_close={() => set_is_advanced_open(false)}
        on_search_submit={on_search_submit}
      />
    </>
  );
}
