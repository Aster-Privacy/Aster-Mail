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
import { MagnifyingGlassIcon, PaperClipIcon } from "@heroicons/react/24/outline";

import { Input } from "@/components/ui/input";
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
            className="p-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              on_submit();
            }}
          >
            <FieldRow label={t("mail.search_scope_label")}>
              <select
                aria-label={t("mail.search_scope_label")}
                className="w-full h-8 rounded-md border border-edge-secondary bg-surf-primary px-2 text-xs text-txt-secondary focus:outline-none focus:ring-2 focus:ring-[var(--accent-color,#3b82f6)]"
                value={filters.scope}
                onChange={(e) => update("scope", e.target.value as SearchScope)}
              >
                {scope_options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FieldRow>

            <FieldRow label={t("common.from_label")}>
              <Input
                maxLength={MAX_FIELD_LEN}
                placeholder={t("mail.search_from_placeholder")}
                size="sm"
                type="text"
                value={filters.from}
                onChange={(e) => update("from", sanitize(e.target.value))}
              />
            </FieldRow>

            <FieldRow label={t("common.to_label")}>
              <Input
                maxLength={MAX_FIELD_LEN}
                placeholder={t("mail.search_to_placeholder")}
                size="sm"
                type="text"
                value={filters.to}
                onChange={(e) => update("to", sanitize(e.target.value))}
              />
            </FieldRow>

            <FieldRow label={t("common.subject_label")}>
              <Input
                maxLength={MAX_FIELD_LEN}
                size="sm"
                type="text"
                value={filters.subject}
                onChange={(e) => update("subject", sanitize(e.target.value))}
              />
            </FieldRow>

            <FieldRow label={t("mail.search_has_words")}>
              <Input
                maxLength={MAX_FIELD_LEN}
                size="sm"
                type="text"
                value={filters.has_words}
                onChange={(e) => update("has_words", sanitize(e.target.value))}
              />
            </FieldRow>

            <FieldRow label={t("mail.search_does_not_have")}>
              <Input
                maxLength={MAX_FIELD_LEN}
                size="sm"
                type="text"
                value={filters.does_not_have}
                onChange={(e) =>
                  update("does_not_have", sanitize(e.target.value))
                }
              />
            </FieldRow>

            <FieldRow label={t("mail.search_size_label")}>
              <div className="flex gap-1.5">
                <select
                  aria-label={t("mail.search_size_op")}
                  className="h-8 rounded-md border border-edge-secondary bg-surf-primary px-2 text-xs text-txt-secondary focus:outline-none focus:ring-2 focus:ring-[var(--accent-color,#3b82f6)]"
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
                <Input
                  className="flex-1"
                  inputMode="numeric"
                  maxLength={12}
                  pattern="[0-9]*"
                  size="sm"
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
                  className="h-8 rounded-md border border-edge-secondary bg-surf-primary px-2 text-xs text-txt-secondary focus:outline-none focus:ring-2 focus:ring-[var(--accent-color,#3b82f6)]"
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

            <FieldRow label={t("mail.search_date_within")}>
              <div className="flex gap-1.5">
                <select
                  aria-label={t("mail.search_date_within")}
                  className="flex-1 h-8 rounded-md border border-edge-secondary bg-surf-primary px-2 text-xs text-txt-secondary focus:outline-none focus:ring-2 focus:ring-[var(--accent-color,#3b82f6)]"
                  value={filters.within_days}
                  onChange={(e) => update("within_days", e.target.value)}
                >
                  {within_options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <Input
                  className="flex-1"
                  placeholder={t("mail.from_date")}
                  size="sm"
                  type="date"
                  value={filters.date_from}
                  onChange={(e) => update("date_from", e.target.value)}
                />
                <Input
                  className="flex-1"
                  placeholder={t("mail.to_date")}
                  size="sm"
                  type="date"
                  value={filters.date_to}
                  onChange={(e) => update("date_to", e.target.value)}
                />
              </div>
            </FieldRow>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-txt-secondary">
                <Checkbox
                  checked={filters.has_attachments === true}
                  onChange={() =>
                    update(
                      "has_attachments",
                      filters.has_attachments ? undefined : true,
                    )
                  }
                />
                <PaperClipIcon className="w-3.5 h-3.5" />
                {t("mail.has_attachments")}
              </label>

              <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-txt-secondary">
                <Checkbox
                  checked={filters.search_content}
                  onChange={() =>
                    update("search_content", !filters.search_content)
                  }
                />
                {t("mail.search_message_content")}
              </label>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-edge-secondary">
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
                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md bg-[var(--accent-color,#3b82f6)] text-white text-xs font-medium hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--accent-color,#3b82f6)]"
                type="submit"
              >
                <MagnifyingGlassIcon className="w-3.5 h-3.5" />
                {t("common.search")}
              </button>
            </div>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[84px_1fr] items-center gap-3">
      <label className="text-xs font-medium text-txt-muted text-right">
        {label}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
