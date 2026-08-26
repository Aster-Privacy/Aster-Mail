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
import type { SearchResultItem } from "@/hooks/use_search";
import type { FormatOptions } from "@/utils/date_format";

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  PaperClipIcon,
  CalendarIcon,
  UserIcon,
  AdjustmentsHorizontalIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

import { AdvancedSearchModal } from "@/components/search/advanced_search_modal";
import { SearchContentBanner } from "@/components/search/search_content_banner";
import { SearchResultSkeleton } from "@/components/search/search_results_list";
import { CorrectionNotice } from "@/components/search/correction_notice";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  format_date,
  format_date_short,
  format_time,
  get_zoned_parts,
  local_date_key,
} from "@/utils/date_format";
import {
  apply_highlights,
  compute_highlight_ranges,
  extract_query_terms,
  use_search,
} from "@/hooks/use_search";
import { is_page_search_route, set_page_search } from "@/hooks/use_page_search";
import { use_i18n } from "@/lib/i18n/context";
import { has_open_overlay_layer } from "@/lib/overlay_layer_stack";
import { use_preferences } from "@/contexts/preferences_context";
import { meets_min_search_length } from "@/utils/search_query";
import { is_composing } from "@/utils/ime";

const DEBOUNCE_MS = 180;
const PREVIEW_LIMIT = 5;
const PREVIEW_DEBOUNCE_MS = 90;

const VIEW_SCOPES: Record<
  string,
  { label_key: TranslationKey; token: string }
> = {
  "/": { label_key: "mail.inbox", token: "inbox" },
  "/all": { label_key: "mail.all_mail", token: "all" },
  "/starred": { label_key: "mail.starred", token: "starred" },
  "/sent": { label_key: "mail.sent", token: "sent" },
  "/drafts": { label_key: "mail.drafts", token: "drafts" },
  "/scheduled": { label_key: "mail.scheduled", token: "scheduled" },
  "/snoozed": { label_key: "mail.snoozed", token: "snoozed" },
  "/archive": { label_key: "mail.archive", token: "archive" },
  "/spam": { label_key: "mail.spam", token: "spam" },
  "/trash": { label_key: "mail.trash", token: "trash" },
};

interface SearchBarProps {
  is_pill?: boolean;
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
  is_pill,
  on_result_click,
  on_search_submit,
  search_context,
}: SearchBarProps) {
  const { t } = use_i18n();
  const location = useLocation();
  const scope = VIEW_SCOPES[location.pathname];
  const is_page_filter = is_page_search_route(location.pathname);
  const page_filter_placeholder = `${t("mail.search_in")} ${
    location.pathname === "/contacts"
      ? t("common.contacts")
      : t("common.subscriptions")
  }`;
  const input_ref = useRef<HTMLInputElement>(null);
  const wrapper_ref = useRef<HTMLDivElement>(null);
  const dropdown_ref = useRef<HTMLDivElement>(null);
  const debounce_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panel_id = useId();

  const [query, set_query] = useState(search_context || "");
  const [is_open, set_is_open] = useState(false);
  const [rect, set_rect] = useState<AnchorRect | null>(null);
  const [is_advanced_open, set_is_advanced_open] = useState(false);

  const {
    state: search_state,
    search,
    dismiss_correction,
    clear_results,
    clear_index,
    start_index_build,
  } = use_search();
  const { preferences, update_preference } = use_preferences();
  const content_search_enabled = preferences.search_encrypted_content;

  const handle_enable_content_search = useCallback(() => {
    update_preference("search_encrypted_content", true, true);
    start_index_build(true);
  }, [update_preference, start_index_build]);

  const handle_disable_content_search = useCallback(() => {
    update_preference("search_encrypted_content", false, true);
    clear_index();
  }, [update_preference, clear_index]);

  const close = useCallback(() => {
    set_is_open(false);
    window.dispatchEvent(new Event("aster:search-closed"));
  }, []);

  const submit_query = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();

      if (!on_search_submit) return;
      if (trimmed.length === 0) {
        on_search_submit("");

        return;
      }
      if (!meets_min_search_length(trimmed)) return;
      on_search_submit(trimmed);
    },
    [on_search_submit],
  );

  const submit_full = useCallback(
    (q: string) => {
      if (on_search_submit) on_search_submit(q.trim());
      close();
      input_ref.current?.blur();
    },
    [on_search_submit, close],
  );

  const handle_advanced_submit = useCallback(
    (q: string) => {
      set_query(q);
      on_search_submit?.(q);
    },
    [on_search_submit],
  );

  const handle_advanced_result_click = useCallback(
    (id: string) => {
      close();
      input_ref.current?.blur();
      on_result_click?.(id);
    },
    [close, on_result_click],
  );

  const handle_change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    set_query(value);
    if (is_page_filter) {
      set_page_search(value);

      return;
    }
    if (debounce_ref.current) clearTimeout(debounce_ref.current);
    if (value.trim().length > 0) return;
    debounce_ref.current = setTimeout(() => submit_query(value), DEBOUNCE_MS);
  };

  const handle_clear = () => {
    set_query("");
    if (is_page_filter) {
      set_page_search("");
      input_ref.current?.focus();

      return;
    }
    submit_query("");
    input_ref.current?.focus();
  };

  const handle_chip = (suffix: string) => {
    const next = query ? `${query} ${suffix}`.trim() : suffix;

    set_query(next);
    if (debounce_ref.current) clearTimeout(debounce_ref.current);
    submit_query(next);
    input_ref.current?.focus();
  };

  const handle_key_down = (e: React.KeyboardEvent) => {
    if (is_composing(e)) return;

    if (e.key === "Escape") {
      e.preventDefault();
      close();
      input_ref.current?.blur();

      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (is_page_filter) {
        input_ref.current?.blur();

        return;
      }
      submit_full(preview_query || query);
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
    const on_down = (e: PointerEvent) => {
      const target = e.target as Node | null;

      if (!target) return;
      if (wrapper_ref.current?.contains(target)) return;
      if (dropdown_ref.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest("[data-radix-popper-content-wrapper]")
      )
        return;
      close();
    };

    window.addEventListener("pointerdown", on_down);

    return () => {
      window.removeEventListener("pointerdown", on_down);
    };
  }, [is_open, close]);

  useEffect(() => {
    const on_key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (has_open_overlay_layer()) return;
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

  const last_path_ref = useRef(location.pathname);

  useEffect(() => {
    if (last_path_ref.current === location.pathname) return;
    last_path_ref.current = location.pathname;
    if (debounce_ref.current) clearTimeout(debounce_ref.current);
    set_query("");
    set_is_open(false);
    set_page_search("");
    if (on_search_submit) on_search_submit("");
  }, [location.pathname, on_search_submit]);

  const preview_query = query.trim();
  const preview_enabled =
    meets_min_search_length(preview_query) && !preview_query.endsWith(":");

  useEffect(() => {
    if (is_page_filter || !is_open) return;
    if (!preview_enabled) {
      clear_results();

      return;
    }
    const timer = setTimeout(() => {
      void search(preview_query);
    }, PREVIEW_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    preview_query,
    preview_enabled,
    is_open,
    is_page_filter,
    search,
    clear_results,
  ]);

  const preview_results = search_state.results.slice(0, PREVIEW_LIMIT);
  const active_correction =
    search_state.correction &&
    search_state.correction.original_query === preview_query
      ? search_state.correction
      : null;
  const effective_query = active_correction
    ? active_correction.corrected_query
    : preview_query;
  const preview_terms = useMemo(
    () => extract_query_terms(effective_query),
    [effective_query],
  );
  const date_options: FormatOptions = useMemo(
    () => ({
      date_format: (preferences.date_format ??
        "MM/DD/YYYY") as FormatOptions["date_format"],
      time_format: (preferences.time_format ??
        "12h") as FormatOptions["time_format"],
    }),
    [preferences.date_format, preferences.time_format],
  );
  const is_preview_stale =
    preview_enabled && search_state.results_query !== effective_query;
  const is_preview_loading =
    preview_enabled &&
    (is_preview_stale ||
      search_state.is_searching ||
      search_state.index_building);

  const handle_preview_click = useCallback(
    (id: string) => {
      close();
      input_ref.current?.blur();
      on_result_click?.(id);
    },
    [close, on_result_click],
  );

  const preview_click_handlers = useRef(new Map<string, () => void>());
  const get_preview_click_handler = useCallback(
    (id: string) => {
      const existing = preview_click_handlers.current.get(id);

      if (existing) return existing;

      const handler = () => handle_preview_click(id);

      preview_click_handlers.current.set(id, handler);

      return handler;
    },
    [handle_preview_click],
  );

  useEffect(() => {
    preview_click_handlers.current.clear();
  }, [handle_preview_click]);

  const is_panel_open = is_open && !is_page_filter && rect !== null;

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
        className={`flex-1 relative ${is_pill ? "min-w-0 max-w-[620px]" : "min-w-[200px] max-w-[640px]"}`}
        data-onboarding="search-bar"
      >
        <div
          className={`flex items-center transition-colors ${
            is_pill
              ? `gap-2 h-10 ps-4 pe-1.5 aster_search_field ${
                  is_open && !is_page_filter && rect
                    ? "aster_search_open shadow-lg rounded-t-[22px]"
                    : "rounded-full"
                }`
              : "gap-2 h-9 px-3 rounded-lg border bg-[var(--bg-primary)] border-[var(--border-secondary)]"
          }`}
          style={
            is_pill
              ? undefined
              : {
                  borderBottomLeftRadius:
                    is_open && !is_page_filter && rect ? 0 : undefined,
                  borderBottomRightRadius:
                    is_open && !is_page_filter && rect ? 0 : undefined,
                  borderBottomColor:
                    is_open && !is_page_filter && rect
                      ? "transparent"
                      : undefined,
                }
          }
        >
          <MagnifyingGlassIcon
            className={`text-[var(--text-secondary)] flex-shrink-0 ${is_pill ? "w-5 h-5" : "w-4 h-4"}`}
          />
          <input
            ref={input_ref}
            aria-autocomplete={is_page_filter ? undefined : "list"}
            aria-controls={is_panel_open ? panel_id : undefined}
            aria-expanded={is_page_filter ? undefined : is_panel_open}
            aria-haspopup={is_page_filter ? undefined : "listbox"}
            className={`flex-1 min-w-0 bg-transparent outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus:border-0 text-sm ${
              is_open
                ? "text-[var(--text-secondary)] placeholder:text-[var(--text-muted)]"
                : "text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
            }`}
            placeholder={
              is_page_filter
                ? page_filter_placeholder
                : scope
                  ? `${t("mail.search_in")} ${t(scope.label_key)}`
                  : t("common.search")
            }
            role={is_page_filter ? undefined : "combobox"}
            type="text"
            value={query}
            onChange={handle_change}
            onFocus={() => {
              if (is_page_filter) return;
              set_is_open(true);
              if (!query && scope && scope.token !== "inbox") {
                set_query(`in:${scope.token} `);
              }
            }}
            onKeyDown={handle_key_down}
          />
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {(query || is_open) && (
              <button
                aria-label={query ? t("common.clear") : t("common.close")}
                className="p-1.5 rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
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
            {is_pill && !is_page_filter && (
              <button
                aria-label={t("mail.advanced_search")}
                className="p-1.5 rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus:outline-none"
                type="button"
                onClick={() => {
                  close();
                  input_ref.current?.blur();
                  set_is_advanced_open(true);
                }}
              >
                <AdjustmentsHorizontalIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {is_open &&
        !is_page_filter &&
        rect &&
        createPortal(
          <div
            ref={dropdown_ref}
            className={`overflow-hidden ${
              is_pill
                ? "aster_search_open aster_search_open_panel rounded-b-[22px]"
                : "rounded-b-lg border border-t-0 border-[var(--border-secondary)] shadow-md"
            }`}
            id={panel_id}
            style={dropdown_style}
          >
            <SearchContentBanner
              enabled={content_search_enabled}
              on_disable={handle_disable_content_search}
              on_enable={handle_enable_content_search}
            />
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
                  handle_chip(`after:${local_date_key(d)}`);
                }}
              />
              <Chip
                icon={<UserIcon className="w-3.5 h-3.5" />}
                label={t("common.from_label")}
                on_click={() => handle_chip("from:")}
              />
              <button
                className="ms-auto inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
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

            {!preview_enabled && (
              <div className="px-6 py-8 flex flex-col items-center justify-center text-center">
                <MagnifyingGlassIcon className="w-8 h-8 text-[var(--text-muted)] mb-2" />
                <p className="text-sm text-[var(--text-muted)]">
                  {t("mail.search_placeholder_hint")}
                </p>
              </div>
            )}

            {preview_enabled && search_state.error && (
              <div className="px-6 py-8 flex flex-col items-center justify-center text-center">
                <ExclamationTriangleIcon className="w-8 h-8 text-[var(--text-muted)] mb-2" />
                <p className="text-sm text-[var(--text-primary)]">
                  {search_state.error}
                </p>
                <button
                  className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-[12px] text-xs font-medium transition-colors bg-[var(--accent-blue)] text-[var(--accent-fg,#ffffff)] hover:opacity-90"
                  type="button"
                  onClick={() => {
                    clear_index();
                    search(preview_query);
                  }}
                >
                  <ArrowPathIcon className="w-3.5 h-3.5" />
                  {t("common.retry")}
                </button>
              </div>
            )}

            {preview_enabled &&
              !search_state.error &&
              is_preview_loading &&
              preview_results.length === 0 && (
                <div className="px-1.5 pb-2">
                  <SearchResultSkeleton />
                  <SearchResultSkeleton />
                  <SearchResultSkeleton />
                </div>
              )}

            {preview_enabled &&
              !search_state.error &&
              !is_preview_loading &&
              preview_results.length === 0 && (
                <div className="px-6 py-8 flex flex-col items-center justify-center text-center">
                  <MagnifyingGlassIcon className="w-8 h-8 text-[var(--text-muted)] mb-2" />
                  <p className="text-sm text-[var(--text-muted)]">
                    {t("mail.no_results_for", { query: preview_query })}
                  </p>
                </div>
              )}

            {preview_enabled &&
              !search_state.error &&
              preview_results.length > 0 && (
                <div
                  aria-busy={is_preview_stale}
                  className="border-t border-[var(--border-secondary)] transition-opacity duration-150 motion-reduce:transition-none"
                  style={{ opacity: is_preview_stale ? 0.55 : 1 }}
                >
                  <CorrectionNotice
                    correction={active_correction}
                    on_dismiss={dismiss_correction}
                  />
                  <div className="py-1 max-h-[420px] overflow-y-auto">
                    {preview_results.map((result) => (
                      <PreviewRow
                        key={result.id}
                        date_options={date_options}
                        on_click={get_preview_click_handler(result.id)}
                        result={result}
                        terms={preview_terms}
                      />
                    ))}
                  </div>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-start text-[13px] border-t border-[var(--border-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                    type="button"
                    onClick={() => submit_full(preview_query)}
                  >
                    <MagnifyingGlassIcon className="w-4 h-4 flex-shrink-0 text-[var(--icon-secondary)]" />
                    <span className="flex-1 min-w-0 truncate">
                      {t("mail.view_all_results", { query: effective_query })}
                    </span>
                    <span className="flex-shrink-0 text-[11px] text-[var(--text-muted)]">
                      {t("common.press_enter_to_view_all")}
                    </span>
                  </button>
                </div>
              )}
          </div>,
          document.body,
        )}
      <AdvancedSearchModal
        is_open={is_advanced_open}
        on_close={() => set_is_advanced_open(false)}
        on_query_change={set_query}
        on_result_click={handle_advanced_result_click}
        on_search_submit={handle_advanced_submit}
      />
    </>
  );
}

function format_preview_date(
  timestamp: string,
  options: FormatOptions,
): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const date_parts = get_zoned_parts(date);
  const now_parts = get_zoned_parts(now);
  const same_day =
    date_parts.year === now_parts.year &&
    date_parts.month === now_parts.month &&
    date_parts.day === now_parts.day;

  if (same_day) return format_time(date, options);
  if (date_parts.year === now_parts.year)
    return format_date_short(date, options);

  return format_date(date, options);
}

function PreviewText({ text, terms }: { text: string; terms: string[] }) {
  const parts = useMemo(
    () => apply_highlights(text, compute_highlight_ranges(text, terms)),
    [text, terms],
  );

  return (
    <>
      {parts.map((part, idx) =>
        part.is_match ? (
          <span key={idx} className="font-semibold text-[var(--text-primary)]">
            {part.text}
          </span>
        ) : (
          <span key={idx}>{part.text}</span>
        ),
      )}
    </>
  );
}

const PreviewRow = memo(function PreviewRow({
  result,
  date_options,
  terms,
  on_click,
}: {
  result: SearchResultItem;
  date_options: FormatOptions;
  terms: string[];
  on_click: () => void;
}) {
  const participants = result.sender_name || result.sender_email || "";

  return (
    <button
      className="w-full flex items-center gap-3 px-4 py-2 text-start hover:bg-[var(--bg-hover)] transition-colors"
      type="button"
      onClick={on_click}
    >
      <ProfileAvatar
        use_domain_logo
        email={result.sender_email}
        image_url={result.avatar_url}
        name={participants}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <div
          className={`text-[13px] truncate ${
            result.is_read
              ? "text-[var(--text-primary)]"
              : "font-semibold text-[var(--text-primary)]"
          }`}
        >
          <PreviewText terms={terms} text={result.subject} />
        </div>
        <div className="text-[12px] truncate text-[var(--text-muted)]">
          <PreviewText terms={terms} text={participants} />
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {result.has_attachment && (
          <PaperClipIcon className="w-3.5 h-3.5 text-[var(--icon-secondary)]" />
        )}
        <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
          {format_preview_date(result.timestamp, date_options)}
        </span>
      </div>
    </button>
  );
});

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
