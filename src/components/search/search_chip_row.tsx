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
  XMarkIcon,
} from "@heroicons/react/24/outline";

import {
  create_active_filters,
  parse_search_query,
  remove_operator_at,
  strip_operators,
} from "@/utils/search_operators";
import {
  describe_date_filter,
  is_chip_covered_operator,
  person_chip_label,
} from "@/components/search/chip_state";
import { list_index_people } from "@/hooks/use_search";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { use_i18n } from "@/lib/i18n/context";
import { is_composing } from "@/utils/ime";
import {
  SEARCH_SCOPES,
  clear_search_filters,
  query_search_scope,
  search_scope_label_key,
  set_search_scope,
} from "@/utils/search_query";
import {
  DATE_PRESET_LABEL_KEYS,
  SEARCH_DATE_PRESETS,
  apply_custom_date_range,
  apply_date_preset,
  detect_date_preset,
  type SearchDatePreset,
} from "@/utils/search_date_presets";

const ATTACHMENT_TYPES = ["image", "document", "pdf", "video"] as const;

type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

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
      aria-pressed={is_active}
      className={CHIP_CLASS}
      style={chip_style(is_active)}
      type="button"
      onClick={on_click}
    >
      {is_active && !has_caret && (
        <CheckIcon className="w-4 h-4 flex-shrink-0" />
      )}
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

const MENU_ITEM_CLASS =
  "w-full flex items-center gap-2 px-2.5 py-2 rounded-[var(--aster-radius-item,8px)] text-[13px] text-start hover:bg-[var(--aster-floating-hover,var(--bg-hover))]";

const FLOATING_STYLE: CSSProperties = {
  backgroundColor: "var(--aster-floating-bg)",
  boxShadow: "var(--aster-floating-shadow)",
  border: "none",
};

interface ScopeChipProps {
  query: string;
  scope_view: string | undefined;
  on_query_change: (query: string) => void;
}

function ScopeChip({ query, scope_view, on_query_change }: ScopeChipProps) {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);
  const current = query_search_scope(query, scope_view);
  const label_key = current ? search_scope_label_key(current.scope) : null;
  const label = label_key
    ? t(label_key)
    : current
      ? current.scope
      : t("mail.search_in");
  const is_active = current ? !current.is_default : true;

  return (
    <Popover open={is_open} onOpenChange={set_is_open}>
      <PopoverTrigger asChild>
        <button
          aria-label={t("mail.search_in")}
          className={CHIP_CLASS}
          data-testid="search-scope-chip"
          style={chip_style(is_active)}
          type="button"
        >
          {label}
          <ChevronDownIcon className="w-3.5 h-3.5 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[248px] p-1.5"
        style={FLOATING_STYLE}
      >
        {SEARCH_SCOPES.map((scope) => {
          const key = search_scope_label_key(scope);
          const selected = current?.scope === scope;

          return (
            <button
              key={scope}
              aria-pressed={selected}
              className={MENU_ITEM_CLASS}
              style={{
                color: selected ? "var(--accent-blue)" : "var(--text-primary)",
              }}
              type="button"
              onClick={() => {
                set_is_open(false);
                if (!selected) {
                  on_query_change(set_search_scope(query, scope_view, scope));
                }
              }}
            >
              <span className="flex-1 min-w-0">
                <span className="block">{key ? t(key) : scope}</span>
                {scope === "anywhere" && (
                  <span
                    className="block text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {t("mail.chip_everywhere_hint")}
                  </span>
                )}
              </span>
              {selected && <CheckIcon className="w-4 h-4 flex-shrink-0" />}
            </button>
          );
        })}
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
  const scope_state = query_search_scope(query, scope_view);
  const scope_active = scope_state ? !scope_state.is_default : true;

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
    (preset: SearchDatePreset) => {
      if (preset === "custom") {
        set_show_custom_range(true);

        return;
      }

      set_date_open(false);
      set_show_custom_range(false);
      on_query_change(apply_date_preset(query, preset));
    },
    [query, on_query_change],
  );

  const apply_custom_range = useCallback(() => {
    if (!custom_after && !custom_before) return;

    set_date_open(false);
    set_show_custom_range(false);
    on_query_change(
      apply_custom_date_range(query, custom_after, custom_before),
    );
  }, [query, custom_after, custom_before, on_query_change]);

  const clear_all = useCallback(() => {
    set_show_custom_range(false);
    on_query_change(clear_search_filters(query, scope_view));
  }, [query, scope_view, on_query_change]);

  const date_label = useMemo(() => {
    if (date_preset !== "custom") return t(DATE_PRESET_LABEL_KEYS[date_preset]);

    const state = describe_date_filter(operators);

    switch (state.kind) {
      case "shortcut":
        return t(state.label_key);
      case "day":
        return t("mail.filter_date", { value: state.value });
      case "after":
        return t("mail.filter_after", { value: state.value });
      case "before":
        return t("mail.filter_before", { value: state.value });
      case "range":
        return t("mail.chip_date_range", { from: state.from, to: state.to });
      default:
        return t("mail.chip_custom_range");
    }
  }, [date_preset, operators, t]);

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

  const extra_chips: ReactNode[] = operators.flatMap((operator, index) =>
    is_chip_covered_operator(operator)
      ? []
      : [
          <Chip
            key={`extra_${index}`}
            is_active
            label={create_active_filters([operator], t)[0].label}
            on_click={() => on_query_change(remove_operator_at(query, index))}
          />,
        ],
  );

  const any_active =
    scope_active ||
    from_values.length > 0 ||
    to_values.length > 0 ||
    date_preset !== "any" ||
    attachment_active ||
    unread_active ||
    extra_chips.length > 0;

  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 overflow-x-auto scrollbar-none">
      <ScopeChip
        on_query_change={on_query_change}
        query={query}
        scope_view={scope_view}
      />
      <PersonChip
        clear_label={t("common.clear")}
        empty_label={t("mail.chip_no_people")}
        is_active={from_values.length > 0}
        label={person_chip_label(from_values) ?? t("mail.from")}
        on_clear={() => clear_person("from")}
        on_select={(email) => set_person("from", email)}
        people={() => list_index_people("from")}
        placeholder={t("mail.chip_name_or_email")}
      />
      <PersonChip
        clear_label={t("common.clear")}
        empty_label={t("mail.chip_no_people")}
        is_active={to_values.length > 0}
        label={person_chip_label(to_values) ?? t("mail.to")}
        on_clear={() => clear_person("to")}
        on_select={(email) => set_person("to", email)}
        people={() => list_index_people("to")}
        placeholder={t("mail.chip_name_or_email")}
      />
      <Popover
        open={date_open}
        onOpenChange={(open: boolean) => {
          set_date_open(open);
          if (!open) set_show_custom_range(false);
        }}
      >
        <PopoverTrigger asChild>
          <button
            aria-pressed={date_preset !== "any"}
            className={CHIP_CLASS}
            data-testid="search-date-chip"
            style={chip_style(date_preset !== "any")}
            type="button"
          >
            {date_label}
            <ChevronDownIcon className="w-3.5 h-3.5 flex-shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[248px] p-1.5"
          style={FLOATING_STYLE}
        >
          {SEARCH_DATE_PRESETS.map((preset) => (
            <button
              key={preset}
              aria-pressed={date_preset === preset}
              className={MENU_ITEM_CLASS}
              style={{
                color:
                  date_preset === preset
                    ? "var(--accent-blue)"
                    : "var(--text-primary)",
              }}
              type="button"
              onClick={() => apply_date(preset)}
            >
              <span className="flex-1">
                {t(DATE_PRESET_LABEL_KEYS[preset])}
              </span>
              {date_preset === preset && (
                <CheckIcon className="w-4 h-4 flex-shrink-0" />
              )}
            </button>
          ))}
          {show_custom_range && (
            <div className="mt-1 pt-1 px-1 flex flex-col gap-2">
              <input
                aria-label={t("mail.from_date")}
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
                aria-label={t("mail.to_date")}
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
                className="h-8 rounded-[10px] text-xs font-medium bg-[var(--accent-blue)] text-[var(--accent-fg,#ffffff)] hover:opacity-90 transition-opacity disabled:opacity-50"
                disabled={!custom_after && !custom_before}
                type="button"
                onClick={apply_custom_range}
              >
                {t("common.apply")}
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <Chip
        is_active={attachment_active}
        label={t("mail.chip_has_attachment")}
        on_click={toggle_attachment}
      />
      {attachment_active &&
        ATTACHMENT_TYPES.map((type) => (
          <Chip
            key={`type_${type}`}
            is_active={has_values.includes(type)}
            label={attachment_type_label(type)}
            on_click={() => toggle_attachment_type(type)}
          />
        ))}
      <Chip
        is_active={unread_active}
        label={t("mail.chip_is_unread")}
        on_click={toggle_unread}
      />
      {extra_chips}
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
      {any_active && (
        <button
          className={CHIP_CLASS}
          style={{
            backgroundColor: "transparent",
            color: "var(--text-secondary)",
          }}
          type="button"
          onClick={clear_all}
        >
          <XMarkIcon className="w-4 h-4 flex-shrink-0" />
          {t("mail.clear_filters")}
        </button>
      )}
    </div>
  );
}
