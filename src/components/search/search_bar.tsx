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
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  PaperClipIcon,
  CalendarIcon,
  UserIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";

import { Spinner } from "@/components/ui/spinner";
import { AdvancedSearchModal } from "@/components/search/advanced_search_modal";
import { use_search, extract_query_terms } from "@/hooks/use_search";
import { use_i18n } from "@/lib/i18n/context";

const MAX_PREVIEW_RESULTS = 7;
const DEBOUNCE_MS = 180;

interface SearchBarProps {
  on_result_click?: (id: string) => void;
  on_search_submit?: (query: string) => void;
  search_context?: string;
}

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  bottom: number;
}

export function SearchBar({
  on_result_click,
  on_search_submit,
  search_context,
}: SearchBarProps) {
  const { t } = use_i18n();
  const input_ref = useRef<HTMLInputElement>(null);
  const wrapper_ref = useRef<HTMLDivElement>(null);
  const dropdown_ref = useRef<HTMLDivElement>(null);
  const debounce_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, set_query] = useState(search_context || "");
  const [is_open, set_is_open] = useState(false);
  const [rect, set_rect] = useState<AnchorRect | null>(null);
  const [selected_index, set_selected_index] = useState(-1);
  const [is_advanced_open, set_is_advanced_open] = useState(false);

  const { state, search, clear_results } = use_search();

  const query_terms = useMemo(() => extract_query_terms(query), [query]);
  const results = state.results.slice(0, MAX_PREVIEW_RESULTS);

  const run_search = useCallback(
    (q: string) => {
      if (!q || q.trim().length < 2) {
        clear_results();

        return;
      }
      search(q, { fields: ["all"] });
    },
    [search, clear_results],
  );

  const handle_change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    set_query(value);
    set_selected_index(-1);
    if (debounce_ref.current) clearTimeout(debounce_ref.current);
    debounce_ref.current = setTimeout(() => run_search(value), DEBOUNCE_MS);
  };

  const handle_clear = () => {
    set_query("");
    clear_results();
    input_ref.current?.focus();
  };

  const close = useCallback(() => {
    set_is_open(false);
    set_selected_index(-1);
  }, []);

  const submit_full = useCallback(
    (q: string) => {
      if (on_search_submit) on_search_submit(q.trim());
      close();
      input_ref.current?.blur();
    },
    [on_search_submit, close],
  );

  const handle_result = useCallback(
    (id: string) => {
      if (on_result_click) on_result_click(id);
      close();
      input_ref.current?.blur();
    },
    [on_result_click, close],
  );

  const handle_chip = (suffix: string) => {
    const next = query ? `${query} ${suffix}`.trim() : suffix;

    set_query(next);
    run_search(next);
    input_ref.current?.focus();
  };

  const handle_key_down = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      input_ref.current?.blur();

      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      set_selected_index((i) =>
        i < results.length - 1 ? i + 1 : results.length - 1,
      );

      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      set_selected_index((i) => (i > 0 ? i - 1 : -1));

      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (selected_index >= 0 && results[selected_index]) {
        handle_result(results[selected_index].id);
      } else {
        submit_full(query);
      }
    }
  };

  useLayoutEffect(() => {
    if (!is_open) return;
    const update = () => {
      const el = wrapper_ref.current;

      if (!el) return;
      const r = el.getBoundingClientRect();

      set_rect({
        top: r.top,
        left: r.left,
        width: r.width,
        bottom: r.bottom,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [is_open]);

  useEffect(() => {
    if (!is_open) return;
    const on_down = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;

      if (!target) return;
      if (wrapper_ref.current?.contains(target)) return;
      if (dropdown_ref.current?.contains(target)) return;
      close();
    };

    window.addEventListener("mousedown", on_down);
    window.addEventListener("touchstart", on_down, { passive: true });

    return () => {
      window.removeEventListener("mousedown", on_down);
      window.removeEventListener("touchstart", on_down);
    };
  }, [is_open, close]);

  useEffect(() => {
    const on_key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input_ref.current?.focus();
        set_is_open(true);
      }
    };
    const on_focus_request = () => {
      input_ref.current?.focus();
      set_is_open(true);
    };

    window.addEventListener("keydown", on_key);
    window.addEventListener("aster:focus-search", on_focus_request);

    return () => {
      window.removeEventListener("keydown", on_key);
      window.removeEventListener("aster:focus-search", on_focus_request);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (debounce_ref.current) clearTimeout(debounce_ref.current);
    };
  }, []);

  const show_loading = state.is_searching || state.index_building;
  const show_results = is_open && query.trim().length >= 2;
  const show_empty =
    show_results && !show_loading && results.length === 0 && !state.error;

  const dropdown_style: React.CSSProperties | undefined = rect
    ? {
        position: "fixed",
        top: rect.bottom - 1,
        left: rect.left,
        width: rect.width,
        zIndex: 60,
      }
    : undefined;

  return (
    <>
      <div
        ref={wrapper_ref}
        className="flex-1 min-w-[200px] max-w-[640px] relative"
        data-onboarding="search-bar"
      >
        <div
          className="flex items-center gap-2 h-9 px-3 rounded-lg border bg-[var(--bg-primary)] border-[var(--border-secondary)] transition-none"
          style={{
            borderBottomLeftRadius: is_open && rect ? 0 : undefined,
            borderBottomRightRadius: is_open && rect ? 0 : undefined,
            borderBottomColor:
              is_open && rect ? "transparent" : undefined,
          }}
        >
          <MagnifyingGlassIcon className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
          <input
            ref={input_ref}
            className="flex-1 min-w-0 bg-transparent outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus:border-0 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            placeholder={`${t("common.search")}...`}
            type="text"
            value={query}
            onChange={handle_change}
            onFocus={() => set_is_open(true)}
            onKeyDown={handle_key_down}
          />
          {(query || is_open) && (
            <button
              aria-label={query ? t("common.clear") : t("common.close")}
              className="p-1.5 rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              type="button"
              onClick={() => {
                if (query) {
                  handle_clear();
                } else {
                  close();
                  input_ref.current?.blur();
                }
              }}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {is_open &&
        rect &&
        createPortal(
          <div
            ref={dropdown_ref}
            className="rounded-b-lg border border-t-0 bg-[var(--bg-primary)] border-[var(--border-secondary)] shadow-md overflow-hidden"
            style={dropdown_style}
          >
            <div className="px-3 py-2 flex flex-wrap items-center gap-2">
              <Chip
                icon={<PaperClipIcon className="w-3.5 h-3.5" />}
                label={t("mail.has_attachments")}
                on_click={() => handle_chip("has:attachment")}
              />
              <Chip
                icon={<CalendarIcon className="w-3.5 h-3.5" />}
                label={t("mail.search_within_1_week")}
                on_click={() => {
                  const d = new Date();

                  d.setDate(d.getDate() - 7);
                  handle_chip(`after:${d.toISOString().slice(0, 10)}`);
                }}
              />
              <Chip
                icon={<UserIcon className="w-3.5 h-3.5" />}
                label={t("common.from_label")}
                on_click={() => handle_chip("from:")}
              />
              <button
                className="ml-auto inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                type="button"
                onClick={() => {
                  close();
                  input_ref.current?.blur();
                  set_is_advanced_open(true);
                }}
              >
                <AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />
                <span>{t("mail.advanced_search")}</span>
              </button>
            </div>

            <div className="max-h-[26rem] overflow-y-auto">
              {show_loading && (
                <div className="flex items-center justify-center gap-2 py-6">
                  <Spinner size="sm" />
                  <span className="text-xs text-[var(--text-muted)]">
                    {t("mail.searching")}
                  </span>
                </div>
              )}

              {!show_loading && !show_results && (
                <div className="px-6 py-10 flex flex-col items-center justify-center text-center">
                  <MagnifyingGlassIcon className="w-8 h-8 text-[var(--text-muted)] mb-2" />
                  <p className="text-sm text-[var(--text-muted)]">
                    {t("mail.search_placeholder_hint")}
                  </p>
                </div>
              )}

              {show_empty && (
                <div className="px-6 py-8 text-center">
                  <p className="text-sm text-[var(--text-muted)]">
                    {t("mail.no_results_for", { query })}
                  </p>
                </div>
              )}

              {show_results && !show_loading && results.length > 0 && (
                <ul className="py-1">
                  {results.map((r, idx) => (
                    <li key={r.id}>
                      <button
                        className={`w-full text-left px-4 py-2 flex items-start gap-3 hover:bg-[var(--bg-hover)] transition-colors ${
                          idx === selected_index ? "bg-[var(--bg-hover)]" : ""
                        }`}
                        type="button"
                        onClick={() => handle_result(r.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                              {highlight(r.sender_name || r.sender_email || "-", query_terms)}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">
                              {format_date(r.timestamp)}
                            </span>
                          </div>
                          <div className="text-xs text-[var(--text-primary)] truncate mt-0.5">
                            {highlight(r.subject || t("mail.no_subject"), query_terms)}
                          </div>
                          {r.preview && (
                            <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                              {r.preview}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {show_results && query.trim().length >= 2 && (
                <button
                  className="w-full text-left px-4 py-3 flex items-center gap-3 border-t border-[var(--border-secondary)] text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                  type="button"
                  onClick={() => submit_full(query)}
                >
                  <MagnifyingGlassIcon className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                  <span className="flex-1 truncate">
                    {t("mail.all_search_results_for", { query })}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0">
                    {t("common.press_enter_to_view_all")}
                  </span>
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
      <AdvancedSearchModal
        is_open={is_advanced_open}
        on_close={() => set_is_advanced_open(false)}
        on_result_click={on_result_click}
        on_search_submit={on_search_submit}
      />
    </>
  );
}

function Chip({
  icon,
  label,
  on_click,
}: {
  icon: React.ReactNode;
  label: string;
  on_click: () => void;
}) {
  return (
    <button
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs text-[var(--text-secondary)] border-[var(--border-secondary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] transition-colors"
      type="button"
      onClick={on_click}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function highlight(text: string, terms: string[]): React.ReactNode {
  if (!terms.length) return text;
  const pattern = new RegExp(
    `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );
  const parts = text.split(pattern);

  return parts.map((part, i) =>
    pattern.test(part) ? (
      <mark
        key={i}
        className="bg-[var(--accent-color,#3b82f6)]/20 text-[var(--text-primary)] rounded px-0.5"
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function format_date(ts: string | number | Date | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const same_year = d.getFullYear() === now.getFullYear();

  if (same_year) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return d.toLocaleDateString(undefined, { year: "2-digit", month: "short" });
}
