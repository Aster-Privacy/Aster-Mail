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
  ActiveFilter,
  SortOption,
  SearchScope,
  SearchHistoryEntry,
  SavedSearch,
} from "@/hooks/use_search";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Checkbox } from "@aster/ui";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { get_operator_suggestions } from "@/utils/search_operators";
import { format_history_timestamp } from "@/services/search";

export function FilterChip({
  filter,
  on_remove,
}: {
  filter: ActiveFilter;
  on_remove: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-brand text-white">
      <span>{filter.label}</span>
      {filter.removable && (
        <button
          className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            on_remove();
          }}
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function QuickFilterButton({
  label,
  is_active,
  on_click,
}: {
  label: string;
  is_active: boolean;
  on_click: () => void;
}) {
  return (
    <button
      className={`px-3 py-1.5 text-xs rounded-full border transition-all duration-150 font-medium ${
        is_active
          ? "bg-brand text-white border-brand"
          : "bg-surf-card text-txt-secondary border-edge-secondary"
      }`}
      onClick={on_click}
    >
      {label}
    </button>
  );
}

export function SortDropdown({
  value,
  on_change,
}: {
  value: SortOption;
  on_change: (option: SortOption) => void;
}) {
  const { t } = use_i18n();
  const options: { value: SortOption; label: string }[] = useMemo(
    () => [
      { value: "relevance", label: t("mail.sort_relevance") },
      { value: "date_newest", label: t("mail.sort_newest") },
      { value: "date_oldest", label: t("mail.sort_oldest") },
      { value: "sender", label: t("mail.sort_sender") },
    ],
    [t],
  );

  return (
    <Select
      value={value}
      onValueChange={(v) => on_change(v as SortOption)}
    >
      <SelectTrigger className="h-8 text-xs min-w-[150px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SearchScopeToggle({
  scope,
  current_folder,
  on_change,
}: {
  scope: SearchScope;
  current_folder?: string;
  on_change: (scope: SearchScope) => void;
}) {
  const { t } = use_i18n();

  return (
    <div className="flex items-center gap-1 rounded-lg p-0.5 bg-surf-tertiary">
      <button
        className="px-2.5 py-1 text-xs rounded-md transition-all duration-150"
        style={{
          backgroundColor:
            scope.type === "all" ? "var(--bg-card)" : "transparent",
          color:
            scope.type === "all" ? "var(--text-primary)" : "var(--text-muted)",
          boxShadow:
            scope.type === "all" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
        }}
        onClick={() => on_change({ type: "all" })}
      >
        {t("mail.all_mail")}
      </button>
      {current_folder && (
        <button
          className="px-2.5 py-1 text-xs rounded-md transition-all duration-150"
          style={{
            backgroundColor:
              scope.type === "current_folder"
                ? "var(--bg-card)"
                : "transparent",
            color:
              scope.type === "current_folder"
                ? "var(--text-primary)"
                : "var(--text-muted)",
            boxShadow:
              scope.type === "current_folder"
                ? "0 1px 3px rgba(0,0,0,0.1)"
                : "none",
          }}
          onClick={() =>
            on_change({ type: "current_folder", folder: current_folder })
          }
        >
          {current_folder.charAt(0).toUpperCase() + current_folder.slice(1)}
        </button>
      )}
    </div>
  );
}

export function FolderResultsBadges({
  folder_counts,
}: {
  folder_counts: Map<string, number>;
}) {
  const { t } = use_i18n();

  if (folder_counts.size === 0) return null;

  const folder_labels: Record<string, { label: string; color: string }> =
    useMemo(
      () => ({
        inbox: { label: t("mail.inbox"), color: "var(--color-info)" },
        sent: { label: t("mail.sent"), color: "#10b981" },
        drafts: { label: t("mail.drafts"), color: "var(--color-warning)" },
        trash: { label: t("mail.trash"), color: "var(--color-danger)" },
        spam: { label: t("mail.spam"), color: "var(--color-danger)" },
        archive: { label: t("mail.archive"), color: "#6b7280" },
      }),
      [t],
    );

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {Array.from(folder_counts.entries()).map(([folder, count]) => {
        const config = folder_labels[folder] || {
          label: folder,
          color: "#6b7280",
        };

        return (
          <span
            key={folder}
            className="px-1.5 py-0.5 text-[10px] rounded font-medium flex items-center gap-1"
            style={{
              backgroundColor: `${config.color}15`,
              color: config.color,
            }}
          >
            {config.label}
            <span className="opacity-70">{count}</span>
          </span>
        );
      })}
    </div>
  );
}

export function OperatorSuggestions({
  partial,
  on_select,
}: {
  partial: string;
  on_select: (operator: string) => void;
}) {
  const { t } = use_i18n();
  const suggestions = useMemo(() => {
    const last_word = partial.split(/\s+/).pop() || "";

    if (last_word.includes(":") && !last_word.endsWith(":")) {
      return [];
    }

    return get_operator_suggestions(last_word, t).slice(0, 5);
  }, [partial, t]);

  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.operator}
          className="px-2 py-1 text-[11px] rounded border transition-all duration-150 hover:bg-surf-hover bg-surf-card border-edge-secondary text-txt-muted"
          onClick={() => on_select(suggestion.operator)}
        >
          <span className="font-mono">{suggestion.operator}</span>
          <span className="ml-1.5 opacity-70">{suggestion.description}</span>
        </button>
      ))}
    </div>
  );
}

export function DateShortcutPills({
  on_select,
}: {
  on_select: (shortcut: string) => void;
}) {
  const { t } = use_i18n();
  const shortcuts = useMemo(
    () => [
      { label: t("mail.filter_today"), value: "date:today" },
      { label: t("mail.filter_this_week"), value: "date:this_week" },
      { label: t("mail.filter_this_month"), value: "date:this_month" },
    ],
    [t],
  );

  return (
    <div className="flex items-center gap-1.5">
      {shortcuts.map((shortcut) => (
        <button
          key={shortcut.value}
          className="px-2 py-1 text-[10px] rounded-full border transition-colors hover:bg-surf-hover bg-surf-card border-edge-secondary text-txt-muted"
          onClick={() => on_select(shortcut.value)}
        >
          {shortcut.label}
        </button>
      ))}
    </div>
  );
}

export function SearchHistorySection({
  history,
  on_select,
  on_remove,
  on_clear_all,
}: {
  history: SearchHistoryEntry[];
  on_select: (query: string) => void;
  on_remove: (id: string) => void;
  on_clear_all: () => void;
}) {
  const { t } = use_i18n();

  if (history.length === 0) return null;

  return (
    <div className="p-2">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-txt-muted">
          {t("mail.recent_searches")}
        </span>
        <button
          className="text-[10px] transition-colors hover:underline text-txt-muted"
          onClick={on_clear_all}
        >
          {t("common.clear_all")}
        </button>
      </div>
      {history.slice(0, 5).map((entry) => (
        <div
          key={entry.id}
          className="flex items-center gap-2 px-3 py-2 rounded-md transition-colors cursor-pointer hover:bg-[var(--bg-hover)]"
          role="button"
          tabIndex={0}
          onClick={() => on_select(entry.query)}
          onKeyDown={(e) => {
            if (e["key"] === "Enter" || e["key"] === " ") {
              e.preventDefault();
              on_select(entry.query);
            }
          }}
        >
          <svg
            className="w-4 h-4 flex-shrink-0 text-txt-muted"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
          </svg>
          <span className="flex-1 text-sm truncate text-txt-primary">
            {entry.query}
          </span>
          <span className="text-xs text-txt-muted">
            {format_history_timestamp(entry.timestamp)}
          </span>
          <button
            className="p-1 rounded-full transition-colors opacity-0 hover:opacity-100 hover:bg-white/10 text-txt-muted"
            onClick={(e) => {
              e.stopPropagation();
              on_remove(entry.id);
            }}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

export function SavedSearchesSection({
  saved_searches,
  on_select,
  on_delete,
}: {
  saved_searches: SavedSearch[];
  on_select: (search: SavedSearch) => void;
  on_delete: (id: string) => void;
}) {
  const { t } = use_i18n();

  if (saved_searches.length === 0) return null;

  return (
    <div className="p-2 border-t border-edge-secondary">
      <div className="px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-txt-muted">
          {t("mail.saved_searches")}
        </span>
      </div>
      {saved_searches.slice(0, 5).map((saved) => (
        <div
          key={saved.id}
          className="flex items-center gap-2 px-3 py-2 rounded-md transition-colors cursor-pointer hover:bg-[var(--bg-hover)]"
          role="button"
          tabIndex={0}
          onClick={() => on_select(saved)}
          onKeyDown={(e) => {
            if (e["key"] === "Enter" || e["key"] === " ") {
              e.preventDefault();
              on_select(saved);
            }
          }}
        >
          <svg
            className="w-4 h-4 flex-shrink-0 text-brand"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z" />
          </svg>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium block truncate text-txt-primary">
              {saved.name}
            </span>
            <span className="text-xs block truncate text-txt-muted">
              {saved.query}
            </span>
          </div>
          <button
            className="p-1 rounded-full transition-colors opacity-0 hover:opacity-100 hover:bg-white/10 text-txt-muted"
            onClick={(e) => {
              e.stopPropagation();
              on_delete(saved.id);
            }}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

export function SaveSearchDialog({
  is_open,
  query,
  on_save,
  on_close,
}: {
  is_open: boolean;
  query: string;
  on_save: (name: string) => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [name, set_name] = useState("");
  const [error, set_error] = useState("");
  const input_ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (is_open) {
      set_name("");
      set_error("");
      setTimeout(() => input_ref.current?.focus(), 100);
    }
  }, [is_open]);

  const handle_save = useCallback(() => {
    if (!name.trim()) {
      set_error(t("mail.please_enter_name"));

      return;
    }
    on_save(name.trim());
  }, [name, on_save]);

  if (!is_open) return null;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
      exit={{ opacity: 0 }}
      initial={reduce_motion ? false : { opacity: 0 }}
      onClick={on_close}
    >
      <motion.div
        animate={{ scale: 1, opacity: 1 }}
        className="rounded-xl p-5 w-full max-w-sm mx-4 shadow-md bg-modal-bg border border-edge-secondary"
        exit={{ scale: 0.95, opacity: 0 }}
        initial={reduce_motion ? false : { scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-4 text-txt-primary">
          {t("mail.save_search")}
        </h3>
        <div className="text-xs mb-4 px-3 py-2 rounded-lg text-txt-muted bg-surf-tertiary">
          <span className="font-medium">{t("mail.query")}:</span>{" "}
          <span className="font-mono text-[11px]">{query}</span>
        </div>
        <Input
          ref={input_ref}
          className="w-full mb-3"
          placeholder={t("mail.enter_search_name")}
          status={error ? "error" : "default"}
          value={name}
          onChange={(e) => {
            set_name(e.target.value);
            set_error("");
          }}
          onKeyDown={(e) => {
            if (e["key"] === "Enter") {
              handle_save();
            } else if (e["key"] === "Escape") {
              on_close();
            }
          }}
        />
        {error && (
          <p className="text-xs text-red-500 mb-3 flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                clipRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                fillRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-3 border-t border-edge-secondary">
          <button
            className="px-4 py-2 text-sm rounded-lg transition-all hover:opacity-80 text-txt-muted bg-surf-hover"
            onClick={on_close}
          >
            {t("common.cancel")}
          </button>
          <button
            className="px-4 py-2 text-sm rounded-lg font-medium transition-all hover:opacity-90 bg-brand text-white"
            onClick={handle_save}
          >
            {t("common.save")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function ClearDataMenu({
  is_open,
  on_close,
  on_clear,
}: {
  is_open: boolean;
  on_close: () => void;
  on_clear: (options: {
    history: boolean;
    saved: boolean;
    cache: boolean;
  }) => void;
}) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [clear_history, set_clear_history] = useState(true);
  const [clear_saved, set_clear_saved] = useState(false);
  const [clear_cache, set_clear_cache] = useState(false);
  const [is_clearing, set_is_clearing] = useState(false);

  const handle_clear = useCallback(async () => {
    set_is_clearing(true);
    await on_clear({
      history: clear_history,
      saved: clear_saved,
      cache: clear_cache,
    });
    set_is_clearing(false);
    on_close();
  }, [clear_history, clear_saved, clear_cache, on_clear, on_close]);

  if (!is_open) return null;

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="absolute right-0 top-full mt-1 py-2 px-3 rounded-lg border shadow-sm z-50 w-56 bg-modal-bg border-edge-secondary"
      exit={{ opacity: 0, y: -4 }}
      initial={reduce_motion ? false : { opacity: 0, y: -4 }}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-medium mb-2 text-txt-primary">
        {t("mail.clear_search_data")}
      </p>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs cursor-pointer">
          <Checkbox
            checked={clear_history}
            onChange={() => set_clear_history(!clear_history)}
          />
          <span className="text-txt-secondary">{t("mail.search_history")}</span>
        </div>
        <div className="flex items-center gap-2 text-xs cursor-pointer">
          <Checkbox
            checked={clear_saved}
            onChange={() => set_clear_saved(!clear_saved)}
          />
          <span className="text-txt-secondary">{t("mail.saved_searches")}</span>
        </div>
        <div className="flex items-center gap-2 text-xs cursor-pointer">
          <Checkbox
            checked={clear_cache}
            onChange={() => set_clear_cache(!clear_cache)}
          />
          <span className="text-txt-secondary">{t("mail.result_cache")}</span>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-edge-secondary">
        <button
          className="px-2 py-1 text-xs rounded transition-colors text-txt-muted"
          onClick={on_close}
        >
          {t("common.cancel")}
        </button>
        <button
          className="px-2 py-1 text-xs rounded font-medium transition-colors disabled:opacity-50"
          disabled={
            is_clearing || (!clear_history && !clear_saved && !clear_cache)
          }
          style={{
            backgroundColor: "var(--color-danger)",
            color: "#ffffff",
          }}
          onClick={handle_clear}
        >
          {is_clearing ? t("common.clearing") : t("common.clear")}
        </button>
      </div>
    </motion.div>
  );
}
