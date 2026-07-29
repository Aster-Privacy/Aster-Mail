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

import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlassIcon,
  PaperClipIcon,
} from "@heroicons/react/24/outline";
import { Checkbox } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";

interface SearchModalFilterPanelProps {
  show_filters: boolean;
  filters: FilterState;
  set_filters: React.Dispatch<React.SetStateAction<FilterState>>;
  on_submit: () => void;
  on_create_filter?: () => void;
}

const MAX_FIELD_LEN = 200;

const FIELD_CLASS =
  "h-9 bg-transparent text-[13px] text-txt-primary placeholder:text-txt-muted outline-none";

const SELECT_CLASS =
  "h-9 bg-transparent text-[13px] text-txt-primary outline-none cursor-pointer";

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

  const scope_options: { value: SearchScope; label: string }[] = [
    { value: "all", label: t("mail.search_scope_all") },
    { value: "anywhere", label: t("mail.search_scope_anywhere") },
    { value: "inbox", label: t("mail.inbox") },
    { value: "starred", label: t("mail.starred") },
    { value: "sent", label: t("mail.sent") },
    { value: "drafts", label: t("mail.drafts") },
    { value: "spam", label: t("mail.spam") },
    { value: "trash", label: t("mail.trash") },
  ];

  const within_options = [
    { value: "", label: t("mail.search_within_any") },
    { value: "1", label: t("mail.search_within_1_day") },
    { value: "3", label: t("mail.search_within_3_days") },
    { value: "7", label: t("mail.search_within_1_week") },
    { value: "14", label: t("mail.search_within_2_weeks") },
    { value: "30", label: t("mail.search_within_1_month") },
    { value: "90", label: t("mail.search_within_3_months") },
    { value: "180", label: t("mail.search_within_6_months") },
    { value: "365", label: t("mail.search_within_1_year") },
  ];

  return (
    <AnimatePresence>
      {show_filters && (
        <motion.div
          animate={{ height: "auto", opacity: 1 }}
          className="border-b overflow-hidden border-edge-secondary bg-surf-tertiary"
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
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
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
                  value={filters.subject}
                />
                <RowDivider />
                <InputRow
                  label={t("mail.search_has_words")}
                  on_change={(value) => update("has_words", value)}
                  value={filters.has_words}
                />
                <RowDivider />
                <InputRow
                  label={t("mail.search_does_not_have")}
                  on_change={(value) => update("does_not_have", value)}
                  value={filters.does_not_have}
                />
                <RowDivider />
                <FieldRow label={t("mail.search_size_label")}>
                  <div className="flex items-center gap-1.5">
                    <select
                      aria-label={t("mail.search_size_op")}
                      className={SELECT_CLASS}
                      value={filters.size_op}
                      onChange={(e) =>
                        update(
                          "size_op",
                          e.target.value as FilterState["size_op"],
                        )
                      }
                    >
                      <option value="greater">
                        {t("mail.search_size_greater")}
                      </option>
                      <option value="less">{t("mail.search_size_less")}</option>
                    </select>
                    <input
                      className={`${FIELD_CLASS} flex-1 min-w-0`}
                      inputMode="numeric"
                      maxLength={12}
                      pattern="[0-9]*"
                      type="text"
                      value={filters.size_value}
                      onChange={(e) =>
                        update(
                          "size_value",
                          e.target.value.replace(/[^0-9]/g, "").slice(0, 12),
                        )
                      }
                    />
                    <select
                      aria-label={t("mail.search_size_unit")}
                      className={SELECT_CLASS}
                      value={filters.size_unit}
                      onChange={(e) =>
                        update(
                          "size_unit",
                          e.target.value as FilterState["size_unit"],
                        )
                      }
                    >
                      <option value="mb">MB</option>
                      <option value="kb">KB</option>
                      <option value="bytes">B</option>
                    </select>
                  </div>
                </FieldRow>
              </Section>

              <Section title={t("mail.date")}>
                <FieldRow label={t("mail.search_date_within")}>
                  <select
                    aria-label={t("mail.search_date_within")}
                    className={`${SELECT_CLASS} w-full`}
                    value={filters.within_days}
                    onChange={(e) => update("within_days", e.target.value)}
                  >
                    {within_options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </FieldRow>
                <RowDivider />
                <FieldRow label={t("mail.from_date")}>
                  <input
                    className={`${FIELD_CLASS} w-full`}
                    type="date"
                    value={filters.date_from}
                    onChange={(e) => update("date_from", e.target.value)}
                  />
                </FieldRow>
                <RowDivider />
                <FieldRow label={t("mail.to_date")}>
                  <input
                    className={`${FIELD_CLASS} w-full`}
                    type="date"
                    value={filters.date_to}
                    onChange={(e) => update("date_to", e.target.value)}
                  />
                </FieldRow>
              </Section>

              <Section title={t("mail.search_section_filters")}>
                <FieldRow label={t("mail.search_scope_label")}>
                  <select
                    aria-label={t("mail.search_scope_label")}
                    className={`${SELECT_CLASS} w-full`}
                    value={filters.scope}
                    onChange={(e) =>
                      update("scope", e.target.value as SearchScope)
                    }
                  >
                    {scope_options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </FieldRow>
                <RowDivider />
                <label className="flex items-center justify-between gap-3 min-h-[44px] px-3 cursor-pointer select-none">
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
                <label className="flex items-center justify-between gap-3 min-h-[44px] px-3 cursor-pointer select-none">
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

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-edge-secondary">
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
                className="inline-flex items-center gap-1.5 h-9 px-5 rounded-[12px] bg-[var(--accent-color,#3b82f6)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--accent-color,#3b82f6)]"
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
      <div className="rounded-[14px] border border-edge-secondary bg-surf-primary">
        {children}
      </div>
    </div>
  );
}

function RowDivider() {
  return <div className="h-px ml-3 bg-edge-secondary" />;
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 min-h-[44px] px-3">
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
      <input
        className={`${FIELD_CLASS} w-full`}
        maxLength={MAX_FIELD_LEN}
        placeholder={placeholder}
        type="text"
        value={value}
        onChange={(e) => on_change(sanitize(e.target.value))}
      />
    </FieldRow>
  );
}
