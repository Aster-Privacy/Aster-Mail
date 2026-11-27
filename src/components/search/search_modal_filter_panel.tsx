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
import type {
  FilterState,
  SearchScope,
} from "@/components/search/search_modal_types";
import type { TranslationKey } from "@/lib/i18n/types";

import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlassIcon,
  PaperClipIcon,
} from "@heroicons/react/24/outline";
import { Checkbox, Input } from "@aster/ui";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { use_i18n } from "@/lib/i18n/context";
import { DateInput } from "@/components/ui/date_input";
import { use_should_reduce_motion } from "@/provider";
import { SEARCH_SCOPES, search_scope_label_key } from "@/utils/search_query";
import { SEARCH_WITHIN_DAYS } from "@/utils/search_filter_state";

interface SearchModalFilterPanelProps {
  show_filters: boolean;
  filters: FilterState;
  set_filters: React.Dispatch<React.SetStateAction<FilterState>>;
  on_submit: () => void;
  on_create_filter?: () => void;
}

const MAX_FIELD_LEN = 200;

const WITHIN_LABEL_KEYS: Record<
  (typeof SEARCH_WITHIN_DAYS)[number],
  TranslationKey
> = {
  "": "mail.chip_any_time",
  "7": "mail.chip_last_7_days",
  "30": "mail.chip_last_30_days",
  "183": "mail.chip_last_6_months",
  "365": "mail.chip_last_year",
};

const ANY_TIME = "any";

const TRIGGER_CLASS = "h-9 text-[13px]";

const DATE_FIELD_CLASS =
  "aster_input aster_input_md h-9 w-full text-[13px] text-txt-primary";

function sanitize(value: string): string {
  return value.replace(/[\r\n\t]/g, " ").slice(0, MAX_FIELD_LEN);
}

export function SearchModalFilterPanel({
  show_filters,
  filters,
  set_filters,
  on_submit,
  on_create_filter,
}: SearchModalFilterPanelProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();

  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    set_filters((prev) => ({ ...prev, [key]: value }));

  const scope_options = SEARCH_SCOPES.map((value) => ({
    value: value as SearchScope,
    label: t(search_scope_label_key(value) ?? "mail.all_mail"),
  }));

  const within_options = SEARCH_WITHIN_DAYS.map((value) => ({
    value,
    label: t(WITHIN_LABEL_KEYS[value]),
  }));

  return (
    <AnimatePresence>
      {show_filters && (
        <motion.div
          animate={{ height: "auto", opacity: 1 }}
          className="search_divider_b overflow-hidden bg-surf-tertiary"
          exit={{ height: 0, opacity: 0 }}
          initial={reduce_motion ? false : { height: 0, opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.18 }}
        >
          <form
            className="flex flex-col max-h-[min(58vh,540px)]"
            onSubmit={(e) => {
              e.preventDefault();
              on_submit();
            }}
          >
            <div className="relative flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
              <Section title={t("mail.contacts")}>
                <InputRow
                  label={t("common.from_label")}
                  on_change={(value) => update("from", value)}
                  placeholder={t("mail.search_from_placeholder")}
                  value={filters.from}
                />
                <RowDivider />
                <InputRow
                  label={t("common.to_label")}
                  on_change={(value) => update("to", value)}
                  placeholder={t("mail.search_to_placeholder")}
                  value={filters.to}
                />
              </Section>

              <Section title={t("mail.search_section_message")}>
                <InputRow
                  label={t("common.subject_label")}
                  on_change={(value) => update("subject", value)}
                  placeholder={t("mail.search_subject_placeholder")}
                  value={filters.subject}
                />
                <RowDivider />
                <InputRow
                  label={t("mail.search_has_words")}
                  on_change={(value) => update("has_words", value)}
                  placeholder={t("mail.search_has_words_placeholder")}
                  value={filters.has_words}
                />
                <RowDivider />
                <InputRow
                  label={t("mail.search_does_not_have")}
                  on_change={(value) => update("does_not_have", value)}
                  placeholder={t("mail.search_does_not_have_placeholder")}
                  value={filters.does_not_have}
                />
                <RowDivider />
                <FieldRow label={t("mail.search_size_label")}>
                  <div className="flex items-center gap-2">
                    <Select
                      value={filters.size_op}
                      onValueChange={(value) =>
                        update("size_op", value as FilterState["size_op"])
                      }
                    >
                      <SelectTrigger
                        aria-label={t("mail.search_size_op")}
                        className={`${TRIGGER_CLASS} w-auto flex-shrink-0`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="greater">
                          {t("mail.search_size_greater")}
                        </SelectItem>
                        <SelectItem value="less">
                          {t("mail.search_size_less")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      aria-label={t("mail.search_size_label")}
                      className="h-9 flex-1 min-w-0 text-[13px]"
                      inputMode="numeric"
                      maxLength={12}
                      pattern="[0-9]*"
                      placeholder="0"
                      type="text"
                      value={filters.size_value}
                      onChange={(e) =>
                        update(
                          "size_value",
                          e.target.value.replace(/[^0-9]/g, "").slice(0, 12),
                        )
                      }
                    />
                    <Select
                      value={filters.size_unit}
                      onValueChange={(value) =>
                        update("size_unit", value as FilterState["size_unit"])
                      }
                    >
                      <SelectTrigger
                        aria-label={t("mail.search_size_unit")}
                        className={`${TRIGGER_CLASS} w-auto flex-shrink-0`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mb">MB</SelectItem>
                        <SelectItem value="kb">KB</SelectItem>
                        <SelectItem value="bytes">B</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </FieldRow>
              </Section>

              <Section title={t("mail.date")}>
                <FieldRow label={t("mail.search_date_within")}>
                  <Select
                    value={filters.within_days || ANY_TIME}
                    onValueChange={(value) =>
                      update("within_days", value === ANY_TIME ? "" : value)
                    }
                  >
                    <SelectTrigger
                      aria-label={t("mail.search_date_within")}
                      className={TRIGGER_CLASS}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {within_options.map((opt) => (
                        <SelectItem
                          key={opt.value || ANY_TIME}
                          value={opt.value || ANY_TIME}
                        >
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>
                <RowDivider />
                <FieldRow label={t("mail.from_date")}>
                  <DateInput
                    aria_label={t("mail.from_date")}
                    className={DATE_FIELD_CLASS}
                    max={filters.date_to || undefined}
                    on_change={(value) => update("date_from", value)}
                    value={filters.date_from}
                  />
                </FieldRow>
                <RowDivider />
                <FieldRow label={t("mail.to_date")}>
                  <DateInput
                    aria_label={t("mail.to_date")}
                    className={DATE_FIELD_CLASS}
                    min={filters.date_from || undefined}
                    on_change={(value) => update("date_to", value)}
                    value={filters.date_to}
                  />
                </FieldRow>
              </Section>

              <Section title={t("mail.search_section_filters")}>
                <FieldRow label={t("mail.search_scope_label")}>
                  <Select
                    value={filters.scope}
                    onValueChange={(value) =>
                      update("scope", value as SearchScope)
                    }
                  >
                    <SelectTrigger
                      aria-label={t("mail.search_scope_label")}
                      className={TRIGGER_CLASS}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {scope_options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>
                <RowDivider />
                <label className="flex items-center justify-between gap-3 min-h-[52px] px-3 cursor-pointer select-none">
                  <span className="flex items-center gap-1.5 text-[13px] text-txt-secondary">
                    <PaperClipIcon className="w-4 h-4" />
                    {t("mail.has_attachments")}
                  </span>
                  <Checkbox
                    checked={filters.has_attachments === true}
                    onChange={() =>
                      update(
                        "has_attachments",
                        filters.has_attachments ? undefined : true,
                      )
                    }
                  />
                </label>
                <RowDivider />
                <label className="flex items-center justify-between gap-3 min-h-[52px] px-3 cursor-pointer select-none">
                  <span className="text-[13px] text-txt-secondary">
                    {t("mail.search_message_content")}
                  </span>
                  <Checkbox
                    checked={filters.search_content}
                    onChange={() =>
                      update("search_content", !filters.search_content)
                    }
                  />
                </label>
              </Section>
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[var(--aster-island-divider,var(--aster-floating-divider,var(--border-secondary)))]">
              {on_create_filter ? (
                <button
                  className="text-xs font-medium text-[var(--accent-color,#3b82f6)] hover:underline"
                  type="button"
                  onClick={on_create_filter}
                >
                  {t("mail.create_filter")}
                </button>
              ) : (
                <span />
              )}
              <button
                className="inline-flex items-center gap-1.5 h-9 px-5 rounded-[var(--aster-radius-control)] bg-[var(--accent-color,#3b82f6)] text-[var(--accent-fg,#ffffff)] text-[13px] font-medium hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--accent-color,#3b82f6)]"
                type="submit"
              >
                <MagnifyingGlassIcon className="w-4 h-4" />
                {t("common.search")}
              </button>
            </div>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="px-1 text-[11px] font-semibold text-txt-muted">{title}</p>
      <div className="rounded-[var(--aster-radius-control,16px)] overflow-hidden bg-surf-primary">
        {children}
      </div>
    </div>
  );
}

function RowDivider() {
  return <div className="h-px bg-[var(--aster-island-divider)]" />;
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 min-h-[52px] px-3 py-2">
      <label className="w-[104px] flex-shrink-0 text-[13px] text-txt-secondary">
        {label}
      </label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function InputRow({
  label,
  value,
  placeholder,
  on_change,
}: {
  label: string;
  value: string;
  placeholder?: string;
  on_change: (value: string) => void;
}) {
  return (
    <FieldRow label={label}>
      <Input
        className="h-9 w-full text-[13px]"
        maxLength={MAX_FIELD_LEN}
        placeholder={placeholder}
        type="text"
        value={value}
        onChange={(e) => on_change(sanitize(e.target.value))}
      />
    </FieldRow>
  );
}
