import type { InboxEmail } from "@/types/email";

import { useState, useMemo, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  PaperClipIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

import { InboxEmailListItem } from "./inbox_email_list_item";
import { Spinner } from "./ui/spinner";
import { Skeleton } from "./ui/skeleton";
import { Separator } from "./ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

import { use_search } from "@/hooks/use_search";
import { use_preferences } from "@/contexts/preferences_context";
import { cn } from "@/lib/utils";

interface SearchFiltersState {
  date_range: "any" | "today" | "week" | "month";
  has_attachment: boolean | null;
  exclude_social: boolean;
  read_status: "any" | "read" | "unread";
}

interface SearchResultsPageProps {
  query: string;
  on_close: () => void;
  on_result_click: (id: string) => void;
}

function SearchResultSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--border-secondary)" }}>
      <Skeleton className="w-5 h-5 rounded flex-shrink-0" />
      <Skeleton className="w-8 h-8 rounded-full flex-shrink-0 hidden sm:block" />
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1">
        <Skeleton className="h-4 w-28 flex-shrink-0" />
        <Skeleton className="h-4 w-full sm:flex-1" />
      </div>
      <Skeleton className="h-3 w-14 flex-shrink-0 hidden sm:block" />
    </div>
  );
}

function FilterButton({
  label,
  icon: Icon,
  is_active,
  on_click,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  is_active: boolean;
  on_click: () => void;
}) {
  return (
    <button
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 text-[13px] font-medium rounded-md transition-colors duration-150 whitespace-nowrap border",
        is_active
          ? "text-[var(--text-primary)] bg-[var(--indicator-bg)] border-[var(--border-primary)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] border-transparent",
      )}
      onClick={on_click}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function SearchResultsPage({
  query,
  on_close,
  on_result_click,
}: SearchResultsPageProps) {
  const { preferences } = use_preferences();
  const {
    state,
    search,
    load_more,
    set_query,
    clear_results,
  } = use_search();

  const [filters, set_filters] = useState<SearchFiltersState>({
    date_range: "any",
    has_attachment: null,
    exclude_social: false,
    read_status: "any",
  });

  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (query) {
      set_query(query);
      perform_search(query);
    }

    return () => {
      clear_results();
    };
  }, []);

  const perform_search = useCallback(
    (search_query: string) => {
      const search_filters: Record<string, unknown> = {};

      if (filters.date_range !== "any") {
        const now = new Date();

        if (filters.date_range === "today") {
          search_filters.date_from = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
          ).toISOString();
        } else if (filters.date_range === "week") {
          const week_ago = new Date(now);

          week_ago.setDate(week_ago.getDate() - 7);
          search_filters.date_from = week_ago.toISOString();
        } else if (filters.date_range === "month") {
          const month_ago = new Date(now);

          month_ago.setMonth(month_ago.getMonth() - 1);
          search_filters.date_from = month_ago.toISOString();
        }
      }

      if (filters.has_attachment !== null) {
        search_filters.has_attachments = filters.has_attachment;
      }

      search(search_query, {
        fields: ["all"],
        filters:
          Object.keys(search_filters).length > 0
            ? (search_filters as { has_attachments?: boolean; date_from?: string })
            : undefined,
      });
    },
    [search, filters],
  );

  useEffect(() => {
    if (query) {
      perform_search(query);
    }
  }, [filters.date_range, filters.has_attachment]);

  const filtered_results = useMemo(() => {
    let results = state.results;

    if (filters.read_status === "read") {
      results = results.filter((r) => r.is_read);
    } else if (filters.read_status === "unread") {
      results = results.filter((r) => !r.is_read);
    }

    if (filters.exclude_social) {
      const social_patterns = [
        "facebook",
        "twitter",
        "linkedin",
        "instagram",
        "tiktok",
        "youtube",
        "pinterest",
        "snapchat",
        "reddit",
        "discord",
        "slack",
        "teams",
        "zoom",
        "notification",
        "noreply",
        "no-reply",
      ];

      results = results.filter((r) => {
        const sender_lower = r.sender_email.toLowerCase();

        return !social_patterns.some((p) => sender_lower.includes(p));
      });
    }

    return results.map((r) => ({
      ...r,
      is_selected: selected_ids.has(r.id),
    }));
  }, [state.results, filters.read_status, filters.exclude_social, selected_ids]);

  const handle_toggle_select = useCallback((id: string) => {
    set_selected_ids((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  const handle_email_click = useCallback(
    (id: string) => {
      on_result_click(id);
    },
    [on_result_click],
  );

  const active_filter_count = useMemo(() => {
    let count = 0;

    if (filters.date_range !== "any") count++;
    if (filters.has_attachment !== null) count++;
    if (filters.exclude_social) count++;
    if (filters.read_status !== "any") count++;

    return count;
  }, [filters]);

  const is_loading = state.is_loading || state.is_searching;

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: "var(--border-secondary)" }}
      >
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-secondary)" }}
                onClick={on_close}
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Back to inbox</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div
          className="flex items-center gap-2 flex-1 min-w-0 px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: "var(--bg-tertiary)" }}
        >
          <MagnifyingGlassIcon
            className="w-4 h-4 flex-shrink-0"
            style={{ color: "var(--text-muted)" }}
          />
          <span
            className="text-sm truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {query}
          </span>
        </div>

        <span
          className="text-xs whitespace-nowrap"
          style={{ color: "var(--text-muted)" }}
        >
          {is_loading ? (
            "Searching..."
          ) : (
            <>
              {filtered_results.length} result
              {filtered_results.length !== 1 ? "s" : ""}
            </>
          )}
        </span>
      </div>

      <div
        className="flex-shrink-0 border-b"
        style={{ borderColor: "var(--border-primary)" }}
      >
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2 overflow-x-auto">
          <FilterButton
            icon={CalendarIcon}
            is_active={filters.date_range === "today"}
            label="Today"
            on_click={() =>
              set_filters((prev) => ({
                ...prev,
                date_range: prev.date_range === "today" ? "any" : "today",
              }))
            }
          />
          <FilterButton
            icon={CalendarIcon}
            is_active={filters.date_range === "week"}
            label="Past week"
            on_click={() =>
              set_filters((prev) => ({
                ...prev,
                date_range: prev.date_range === "week" ? "any" : "week",
              }))
            }
          />
          <FilterButton
            icon={CalendarIcon}
            is_active={filters.date_range === "month"}
            label="Past month"
            on_click={() =>
              set_filters((prev) => ({
                ...prev,
                date_range: prev.date_range === "month" ? "any" : "month",
              }))
            }
          />

          <Separator
            className="h-4 mx-1 bg-[var(--border-secondary)]"
            orientation="vertical"
          />

          <FilterButton
            icon={PaperClipIcon}
            is_active={filters.has_attachment === true}
            label="Has attachment"
            on_click={() =>
              set_filters((prev) => ({
                ...prev,
                has_attachment: prev.has_attachment === true ? null : true,
              }))
            }
          />

          <FilterButton
            icon={UserGroupIcon}
            is_active={filters.exclude_social}
            label="Exclude social"
            on_click={() =>
              set_filters((prev) => ({
                ...prev,
                exclude_social: !prev.exclude_social,
              }))
            }
          />

          <Separator
            className="h-4 mx-1 bg-[var(--border-secondary)] hidden sm:block"
            orientation="vertical"
          />

          <FilterButton
            icon={EnvelopeIcon}
            is_active={filters.read_status === "unread"}
            label="Unread"
            on_click={() =>
              set_filters((prev) => ({
                ...prev,
                read_status: prev.read_status === "unread" ? "any" : "unread",
              }))
            }
          />
          <FilterButton
            icon={EnvelopeOpenIcon}
            is_active={filters.read_status === "read"}
            label="Read"
            on_click={() =>
              set_filters((prev) => ({
                ...prev,
                read_status: prev.read_status === "read" ? "any" : "read",
              }))
            }
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {is_loading && filtered_results.length === 0 ? (
          <div>
            {Array.from({ length: 10 }).map((_, i) => (
              <SearchResultSkeleton key={i} />
            ))}
          </div>
        ) : filtered_results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            >
              <MagnifyingGlassIcon
                className="w-8 h-8"
                style={{ color: "var(--text-muted)" }}
              />
            </div>
            <p
              className="text-sm font-medium mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              No results found
            </p>
            <p
              className="text-xs text-center max-w-[280px]"
              style={{ color: "var(--text-muted)" }}
            >
              {active_filter_count > 0
                ? "Try adjusting your filters or search for something else"
                : `No emails match "${query}"`}
            </p>
          </div>
        ) : (
          <>
            <AnimatePresence mode="popLayout">
              {filtered_results.map((email) => (
                <motion.div
                  key={email.id}
                  exit={{ opacity: 0, height: 0 }}
                  initial={{ opacity: 1, height: "auto" }}
                  layout
                  transition={{ duration: 0.2 }}
                >
                  <InboxEmailListItem
                    current_view="search"
                    density={preferences.density}
                    email={email as InboxEmail}
                    is_active={false}
                    on_email_click={handle_email_click}
                    on_toggle_select={handle_toggle_select}
                    show_email_preview={preferences.show_email_preview}
                    show_profile_pictures={preferences.show_profile_pictures}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {state.is_loading_more && (
              <div className="flex items-center justify-center py-4">
                <Spinner className="text-[var(--accent-color)]" size="md" />
              </div>
            )}

            {state.has_more && !state.is_loading_more && (
              <button
                className="w-full py-3 text-xs text-center transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-muted)" }}
                onClick={load_more}
              >
                Load more results ({state.total_results - filtered_results.length} remaining)
              </button>
            )}

            {!state.has_more && filtered_results.length > 0 && (
              <div
                className="text-center py-4 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                End of results
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
