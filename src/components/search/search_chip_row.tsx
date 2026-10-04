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
import type { CSSProperties, ReactNode } from "react";
import type { ParsedOperator } from "@/utils/search_operators";
import type { IndexPerson } from "@/hooks/use_search";

import { useCallback, useMemo, useState } from "react";
import {
  AdjustmentsHorizontalIcon,
  CheckIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

import {
  date_range_operators,
  parse_search_query,
  format_date_for_operator,
} from "@/utils/search_operators";
import { list_index_people } from "@/hooks/use_search";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { use_i18n } from "@/lib/i18n/context";
import { is_composing } from "@/utils/ime";
import { rescope_search_query, search_scope_chips } from "@/utils/search_query";

type DatePreset = "any" | "week" | "month" | "six_months" | "year" | "custom";

const ATTACHMENT_TYPES = ["image", "document", "pdf", "video"] as const;

type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

const PRESET_DAYS: Record<Exclude<DatePreset, "any" | "custom">, number> = {
  week: 7,
  month: 30,
  six_months: 183,
  year: 365,
};

function days_ago(days: number): string {
  const date = new Date();

  date.setDate(date.getDate() - days);

  return format_date_for_operator(date);
}

function strip_operators(
  query: string,
  predicate: (operator: ParsedOperator) => boolean,
): string {
  let next = query;

  for (const operator of parse_search_query(query).operators) {
    if (!predicate(operator)) continue;
    next = next.replace(operator.raw, " ");
  }

  return next.replace(/\s+/g, " ").trim();
}

function append_token(query: string, token: string): string {
  const trimmed = query.trim();

  return trimmed ? `${trimmed} ${token}` : token;
}

function quote_if_needed(value: string): string {
  return value.includes(" ") ? `"${value}"` : value;
}

function active_values(operators: ParsedOperator[], type: string): string[] {
  return operators
    .filter((operator) => operator.type === type && !operator.negated)
    .map((operator) => operator.value);
}

function detect_date_preset(operators: ParsedOperator[]): DatePreset {
  const before = active_values(operators, "before");
  const after = active_values(operators, "after");

  if (before.length === 0 && after.length === 0) return "any";

  if (before.length === 1 && after.length === 0) {
    for (const key of Object.keys(PRESET_DAYS) as Array<
      keyof typeof PRESET_DAYS
    >) {
      if (before[0] === days_ago(PRESET_DAYS[key])) return key;
    }
  }

  return "custom";
}

const CHIP_CLASS =
  "flex items-center gap-1.5 flex-shrink-0 h-8 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap";

function chip_style(is_active: boolean): CSSProperties {
  return {
    backgroundColor: is_active ? "var(--accent-blue)" : "var(--aster-hover)",
    color: is_active ? "#ffffff" : "var(--text-secondary)",
  };
}

interface ChipProps {
  label: string;
  is_active: boolean;
  has_caret?: boolean;
  on_click?: () => void;
}

function Chip({ label, is_active, has_caret, on_click }: ChipProps) {
  return (
    <button
      className={CHIP_CLASS}
      style={chip_style(is_active)}
      type="button"
      onClick={on_click}
    >
      {is_active && <CheckIcon className="w-4 h-4 flex-shrink-0" />}
      {label}
      {has_caret && <ChevronDownIcon className="w-3.5 h-3.5 flex-shrink-0" />}
    </button>
  );
}

interface PersonChipProps {
  label: string;
  is_active: boolean;
  placeholder: string;
  empty_label: string;
  people: () => IndexPerson[];
  on_select: (email: string) => void;
  on_clear: () => void;
  clear_label: string;
}

function PersonChip({
  label,
  is_active,
  placeholder,
  empty_label,
  people,
  on_select,
  on_clear,
  clear_label,
}: PersonChipProps) {
  const [is_open, set_is_open] = useState(false);
  const [filter_text, set_filter_text] = useState("");
  const [loaded, set_loaded] = useState<IndexPerson[]>([]);

  const handle_open_change = useCallback(
    (open: boolean) => {
      set_is_open(open);

      if (open) {
        set_filter_text("");
        set_loaded(people());
      }
    },
    [people],
  );

  const visible = useMemo(() => {
    const needle = filter_text.trim().toLowerCase();

    if (!needle) return loaded.slice(0, 40);

    return loaded
      .filter(
        (person) =>
          person.email.includes(needle) ||
          person.name.toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [loaded, filter_text]);

  const apply = useCallback(
    (email: string) => {
      set_is_open(false);
      on_select(email);
    },
    [on_select],
  );

  return (
    <Popover open={is_open} onOpenChange={handle_open_change}>
      <PopoverTrigger asChild>
        <button
          className={CHIP_CLASS}
          style={chip_style(is_active)}
          type="button"
        >
          {is_active && <CheckIcon className="w-4 h-4 flex-shrink-0" />}
          {label}
          <ChevronDownIcon className="w-3.5 h-3.5 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[320px] p-0 overflow-hidden"
        style={{
          backgroundColor: "var(--aster-floating-bg)",
          boxShadow: "var(--aster-floating-shadow)",
          border: "none",
        }}
      >
        <div className="p-2">
          <input
            autoFocus
            className="w-full h-8 px-2 rounded-[var(--aster-radius-item)] text-xs outline-none"
            placeholder={placeholder}
            style={{
              backgroundColor: "var(--aster-hover)",
              color: "var(--text-primary)",
            }}
            value={filter_text}
            onChange={(event) => set_filter_text(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || is_composing(event)) return;
              const value = filter_text.trim();

              if (value) apply(value);
            }}
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {visible.length === 0 ? (
            <p
              className="px-3 py-3 text-xs text-center"
              style={{ color: "var(--text-muted)" }}
            >
              {empty_label}
            </p>
          ) : (
            visible.map((person) => (
              <button
                key={person.email}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--aster-radius-item,8px)] text-start hover:bg-[var(--aster-floating-hover,var(--bg-hover))]"
                type="button"
                onClick={() => apply(person.email)}
              >
                <ProfileAvatar
                  email={person.email}
                  name={person.name || person.email}
                  size="sm"
                />
                <span className="flex-1 min-w-0">
                  <span
                    className="block text-[13px] font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {person.name || person.email}
                  </span>
                  <span
                    className="block text-[11px] truncate"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {person.email}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
        {is_active && (
          <div className="p-2">
            <button
              className="text-xs font-medium text-[var(--accent-color)] hover:underline"
              type="button"
              onClick={() => {
                set_is_open(false);
                on_clear();
              }}
            >
              {clear_label}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export interface SearchChipRowProps {
  query: string;
  on_query_change: (query: string) => void;
  on_advanced_click: () => void;
  scope_view?: string;
}

export function SearchChipRow({
  query,
  on_query_change,
  on_advanced_click,
  scope_view,
}: SearchChipRowProps) {
  const { t } = use_i18n();
  const [date_open, set_date_open] = useState(false);
  const [show_custom_range, set_show_custom_range] = useState(false);
  const [custom_after, set_custom_after] = useState("");
  const [custom_before, set_custom_before] = useState("");

  const operators = useMemo(() => parse_search_query(query).operators, [query]);

  const from_values = useMemo(
    () => active_values(operators, "from"),
    [operators],
  );
  const to_values = useMemo(() => active_values(operators, "to"), [operators]);
  const has_values = useMemo(
    () => active_values(operators, "has").map((value) => value.toLowerCase()),
    [operators],
  );
  const is_values = useMemo(
    () => active_values(operators, "is").map((value) => value.toLowerCase()),
    [operators],
  );

  const attachment_active =
    has_values.includes("attachment") ||
    has_values.includes("attachments") ||
    ATTACHMENT_TYPES.some((type) => has_values.includes(type));
  const unread_active = is_values.includes("unread");
  const date_preset = useMemo(() => detect_date_preset(operators), [operators]);

  const set_person = useCallback(
    (type: "from" | "to", email: string) => {
      const stripped = strip_operators(
        query,
        (operator) => operator.type === type && !operator.negated,
      );

      on_query_change(
        append_token(stripped, `${type}:${quote_if_needed(email)}`),
      );
    },
    [query, on_query_change],
  );

  const clear_person = useCallback(
    (type: "from" | "to") => {
      on_query_change(
        strip_operators(
          query,
          (operator) => operator.type === type && !operator.negated,
        ),
      );
    },
    [query, on_query_change],
  );

  const toggle_attachment = useCallback(() => {
    const stripped = strip_operators(
      query,
      (operator) => operator.type === "has" && !operator.negated,
    );

    if (attachment_active) {
      on_query_change(stripped);

      return;
    }

    on_query_change(append_token(stripped, "has:attachment"));
  }, [query, attachment_active, on_query_change]);

  const toggle_attachment_type = useCallback(
    (type: AttachmentType) => {
      const is_on = has_values.includes(type);
      const stripped = strip_operators(
        query,
        (operator) =>
          operator.type === "has" &&
          !operator.negated &&
          operator.value.toLowerCase() === type,
      );

      if (is_on) {
        const remaining = parse_search_query(stripped).operators.filter(
          (operator) => operator.type === "has" && !operator.negated,
        );

        on_query_change(
          remaining.length > 0
            ? stripped
            : append_token(stripped, "has:attachment"),
        );

        return;
      }

      const without_generic = strip_operators(
        stripped,
        (operator) =>
          operator.type === "has" &&
          !operator.negated &&
          (operator.value.toLowerCase() === "attachment" ||
            operator.value.toLowerCase() === "attachments"),
      );

      on_query_change(append_token(without_generic, `has:${type}`));
    },
    [query, has_values, on_query_change],
  );

  const toggle_unread = useCallback(() => {
    const stripped = strip_operators(
      query,
      (operator) =>
        operator.type === "is" &&
        !operator.negated &&
        (operator.value.toLowerCase() === "unread" ||
          operator.value.toLowerCase() === "read"),
    );

    on_query_change(
      unread_active ? stripped : append_token(stripped, "is:unread"),
    );
  }, [query, unread_active, on_query_change]);

  const apply_date = useCallback(
    (preset: DatePreset) => {
      const stripped = strip_operators(
        query,
        (operator) =>
          (operator.type === "before" ||
            operator.type === "after" ||
            operator.type === "date") &&
          !operator.negated,
      );

      if (preset === "any") {
        set_date_open(false);
        set_show_custom_range(false);
        on_query_change(stripped);

        return;
      }

      if (preset === "custom") {
        set_show_custom_range(true);

        return;
      }

      set_date_open(false);
      set_show_custom_range(false);
      on_query_change(
        append_token(stripped, `before:${days_ago(PRESET_DAYS[preset])}`),
      );
    },
    [query, on_query_change],
  );

  const apply_custom_range = useCallback(() => {
    if (!custom_after && !custom_before) return;

    let next = strip_operators(
      query,
      (operator) =>
        (operator.type === "before" ||
          operator.type === "after" ||
          operator.type === "date") &&
        !operator.negated,
    );

    for (const operator of date_range_operators(custom_after, custom_before)) {
      next = append_token(next, operator);
    }

    set_date_open(false);
    set_show_custom_range(false);
    on_query_change(next);
  }, [query, custom_after, custom_before, on_query_change]);

  const date_label = useMemo(() => {
    switch (date_preset) {
      case "week":
        return t("mail.chip_older_than_week");
      case "month":
        return t("mail.chip_older_than_month");
      case "six_months":
        return t("mail.chip_older_than_six_months");
      case "year":
        return t("mail.chip_older_than_year");
      case "custom":
        return t("mail.chip_custom_range");
      default:
        return t("mail.chip_any_time");
    }
  }, [date_preset, t]);

  const attachment_type_label = useCallback(
    (type: AttachmentType) => {
      switch (type) {
        case "image":
          return t("mail.chip_attachment_image");
        case "document":
          return t("mail.chip_attachment_document");
        case "pdf":
          return t("mail.chip_attachment_pdf");
        default:
          return t("mail.chip_attachment_video");
      }
    },
    [t],
  );

  const from_chip = (
    <PersonChip
      key="from"
      clear_label={t("common.clear")}
      empty_label={t("mail.chip_no_people")}
      is_active={from_values.length > 0}
      label={from_values.length > 0 ? from_values[0] : t("mail.from")}
      on_clear={() => clear_person("from")}
      on_select={(email) => set_person("from", email)}
      people={() => list_index_people("from")}
      placeholder={t("mail.chip_name_or_email")}
    />
  );

  const to_chip = (
    <PersonChip
      key="to"
      clear_label={t("common.clear")}
      empty_label={t("mail.chip_no_people")}
      is_active={to_values.length > 0}
      label={to_values.length > 0 ? to_values[0] : t("mail.to")}
      on_clear={() => clear_person("to")}
      on_select={(email) => set_person("to", email)}
      people={() => list_index_people("to")}
      placeholder={t("mail.chip_name_or_email")}
    />
  );

  const date_chip = (
    <Popover
      key="date"
      open={date_open}
      onOpenChange={(open) => {
        set_date_open(open);
        if (!open) set_show_custom_range(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          className={CHIP_CLASS}
          style={chip_style(date_preset !== "any")}
          type="button"
        >
          {date_preset !== "any" && (
            <CheckIcon className="w-4 h-4 flex-shrink-0" />
          )}
          {date_label}
          <ChevronDownIcon className="w-3.5 h-3.5 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[248px] p-1.5"
        style={{
          backgroundColor: "var(--aster-floating-bg)",
          boxShadow: "var(--aster-floating-shadow)",
          border: "none",
        }}
      >
        {(
          [
            ["any", t("mail.chip_any_time")],
            ["week", t("mail.chip_older_than_week")],
            ["month", t("mail.chip_older_than_month")],
            ["six_months", t("mail.chip_older_than_six_months")],
            ["year", t("mail.chip_older_than_year")],
            ["custom", `${t("mail.chip_custom_range")}…`],
          ] as Array<[DatePreset, string]>
        ).map(([preset, label]) => (
          <button
            key={preset}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[var(--aster-radius-item,8px)] text-[13px] text-start hover:bg-[var(--aster-floating-hover,var(--bg-hover))]"
            style={{
              color:
                date_preset === preset
                  ? "var(--accent-blue)"
                  : "var(--text-primary)",
            }}
            type="button"
            onClick={() => apply_date(preset)}
          >
            {label}
          </button>
        ))}
        {show_custom_range && (
          <div className="mt-1 pt-1 px-1 flex flex-col gap-2">
            <input
              className="w-full h-8 px-2 rounded-[var(--aster-radius-item)] text-xs outline-none"
              max={custom_before || undefined}
              style={{
                backgroundColor: "var(--aster-hover)",
                color: "var(--text-primary)",
              }}
              type="date"
              value={custom_after}
              onChange={(event) => set_custom_after(event.target.value)}
            />
            <input
              className="w-full h-8 px-2 rounded-[var(--aster-radius-item)] text-xs outline-none"
              min={custom_after || undefined}
              style={{
                backgroundColor: "var(--aster-hover)",
                color: "var(--text-primary)",
              }}
              type="date"
              value={custom_before}
              onChange={(event) => set_custom_before(event.target.value)}
            />
            <button
              className="h-8 rounded-[10px] text-xs font-medium bg-[var(--accent-blue)] text-[var(--accent-fg,#ffffff)] hover:opacity-90 transition-opacity"
              type="button"
              onClick={apply_custom_range}
            >
              {t("common.apply")}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );

  const attachment_chip = (
    <Chip
      key="attachment"
      is_active={attachment_active}
      label={t("mail.chip_has_attachment")}
      on_click={toggle_attachment}
    />
  );

  const unread_chip = (
    <Chip
      key="unread"
      is_active={unread_active}
      label={t("mail.chip_is_unread")}
      on_click={toggle_unread}
    />
  );

  const attachment_type_chips: ReactNode[] = attachment_active
    ? [...ATTACHMENT_TYPES]
        .sort((a, b) => {
          const a_on = has_values.includes(a) ? 0 : 1;
          const b_on = has_values.includes(b) ? 0 : 1;

          return a_on - b_on;
        })
        .map((type) => (
          <Chip
            key={`type_${type}`}
            is_active={has_values.includes(type)}
            label={attachment_type_label(type)}
            on_click={() => toggle_attachment_type(type)}
          />
        ))
    : [];

  const entries: Array<{ node: ReactNode; active: boolean }> = [
    { node: from_chip, active: from_values.length > 0 },
    { node: date_chip, active: date_preset !== "any" },
    { node: attachment_chip, active: attachment_active },
    { node: to_chip, active: to_values.length > 0 },
    { node: unread_chip, active: unread_active },
  ];

  const ordered: ReactNode[] = [];

  for (const entry of entries) {
    if (!entry.active) continue;
    ordered.push(entry.node);
    if (entry.node === attachment_chip) ordered.push(...attachment_type_chips);
  }

  for (const entry of entries) {
    if (entry.active) continue;
    ordered.push(entry.node);
  }

  const scope_chips: ReactNode[] = scope_view
    ? search_scope_chips(query, scope_view).map((chip) => (
        <Chip
          key={`scope_${chip.scope}`}
          is_active={chip.is_active}
          label={
            chip.folder_label_key
              ? t(chip.label_key, { value: t(chip.folder_label_key) })
              : t(chip.label_key)
          }
          on_click={
            chip.is_active
              ? undefined
              : () =>
                  on_query_change(
                    rescope_search_query(query, scope_view, chip.scope),
                  )
          }
        />
      ))
    : [];

  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 overflow-x-auto scrollbar-none">
      {scope_chips}
      {ordered}
      <button
        className={CHIP_CLASS}
        style={{
          backgroundColor: "var(--aster-hover)",
          color: "var(--accent-blue)",
        }}
        type="button"
        onClick={on_advanced_click}
      >
        <AdjustmentsHorizontalIcon className="w-4 h-4 flex-shrink-0" />
        {t("mail.chip_advanced_search")}
      </button>
    </div>
  );
}
