import type { SearchFilters } from "@/services/api/search";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  forwardRef,
} from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FolderIcon, UserIcon } from "@heroicons/react/24/outline";

import { CustomCheckbox } from "./custom_checkbox";
import { ProfileAvatar } from "./ui/profile_avatar";
import { Skeleton } from "./ui/skeleton";
import { Spinner } from "./ui/spinner";

import { strip_html_tags } from "@/lib/html_sanitizer";
import { ErrorBoundary } from "@/components/ui/error_boundary";
import { format_relative_time } from "@/utils/date_utils";
import {
  use_search,
  use_advanced_search,
  type SearchResultItem,
  type AutocompleteSuggestion,
  type ActiveFilter,
  type SortOption,
  type SearchScope,
  type SearchHistoryEntry,
  type SavedSearch,
  get_search_history,
  add_to_history,
  remove_from_history,
  get_saved_searches,
  save_search_to_storage,
  delete_saved_search_from_storage,
  update_saved_search_usage,
  clear_search_data,
  compute_highlight_ranges,
  apply_highlights,
  extract_query_terms,
  type TextHighlight,
} from "@/hooks/use_search";
import { use_folders, type DecryptedFolder } from "@/hooks/use_folders";
import { is_folder_unlocked } from "@/hooks/use_protected_folder";
import { use_auth } from "@/contexts/auth_context";
import { use_email_actions } from "@/hooks/use_email_actions";
import { get_operator_suggestions } from "@/utils/search_operators";
import { format_history_timestamp } from "@/services/search";
import { list_contacts, decrypt_contacts } from "@/services/api/contacts";
import type { DecryptedContact } from "@/types/contacts";

interface SearchModalProps {
  is_open: boolean;
  on_close: () => void;
  on_compose?: () => void;
  initial_query?: string;
  on_initial_query_consumed?: () => void;
  on_search_submit?: (query: string) => void;
}

type SearchFieldType = "subject" | "body" | "sender" | "recipient" | "all";

interface FilterState {
  fields: SearchFieldType[];
  has_attachments: boolean | undefined;
  is_starred: boolean | undefined;
  date_from: string;
  date_to: string;
}

function SearchResultSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-3 w-full" />
      </div>
      <Skeleton className="h-3 w-12 flex-shrink-0" />
    </div>
  );
}

function FilterChip({
  filter,
  on_remove,
}: {
  filter: ActiveFilter;
  on_remove: () => void;
}) {
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      exit={{ opacity: 0, scale: 0.8 }}
      initial={{ opacity: 0, scale: 0.8 }}
      style={{
        backgroundColor: "var(--accent-color, #3b82f6)",
        color: "#ffffff",
      }}
      transition={{ duration: 0.15 }}
    >
      <span>{filter.label}</span>
      {filter.removable && (
        <button
          className="w-4 h-4 rounded-full flex items-center justify-center transition-colors hover:bg-white/20"
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
    </motion.div>
  );
}

function QuickFilterButton({
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
      className="px-3 py-1.5 text-xs rounded-full border transition-all duration-150 font-medium"
      style={{
        backgroundColor: is_active
          ? "var(--accent-color, #3b82f6)"
          : "var(--bg-card)",
        color: is_active ? "#ffffff" : "var(--text-secondary)",
        borderColor: is_active
          ? "var(--accent-color, #3b82f6)"
          : "var(--border-secondary)",
      }}
      onClick={on_click}
    >
      {label}
    </button>
  );
}

function SortDropdown({
  value,
  on_change,
}: {
  value: SortOption;
  on_change: (option: SortOption) => void;
}) {
  const [is_open, set_is_open] = useState(false);
  const dropdown_ref = useRef<HTMLDivElement>(null);

  const options: { value: SortOption; label: string }[] = [
    { value: "relevance", label: "Relevance" },
    { value: "date_newest", label: "Newest first" },
    { value: "date_oldest", label: "Oldest first" },
    { value: "sender", label: "Sender name" },
  ];

  const current_label =
    options.find((opt) => opt.value === value)?.label || "Relevance";

  useEffect(() => {
    function handle_click_outside(event: MouseEvent) {
      if (
        dropdown_ref.current &&
        !dropdown_ref.current.contains(event.target as Node)
      ) {
        set_is_open(false);
      }
    }

    document.addEventListener("mousedown", handle_click_outside);

    return () =>
      document.removeEventListener("mousedown", handle_click_outside);
  }, []);

  return (
    <div ref={dropdown_ref} className="relative">
      <button
        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg border transition-colors"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-secondary)",
          color: "var(--text-secondary)",
        }}
        onClick={() => set_is_open(!is_open)}
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z" />
        </svg>
        <span>{current_label}</span>
        <svg
          className={`w-3 h-3 transition-transform ${is_open ? "rotate-180" : ""}`}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>
      <AnimatePresence>
        {is_open && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="absolute right-0 top-full mt-1 py-1 rounded-lg border shadow-lg z-50 min-w-[140px]"
            exit={{ opacity: 0, y: -4 }}
            initial={{ opacity: 0, y: -4 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-secondary)",
            }}
            transition={{ duration: 0.15 }}
          >
            {options.map((option) => (
              <button
                key={option.value}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors"
                style={{
                  backgroundColor:
                    option.value === value ? "var(--bg-hover)" : "transparent",
                  color:
                    option.value === value
                      ? "var(--accent-color, #3b82f6)"
                      : "var(--text-secondary)",
                }}
                onClick={() => {
                  on_change(option.value);
                  set_is_open(false);
                }}
              >
                {option.value === value && (
                  <svg
                    className="w-3 h-3"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                )}
                <span className={option.value !== value ? "ml-5" : ""}>
                  {option.label}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SearchScopeToggle({
  scope,
  current_folder,
  on_change,
}: {
  scope: SearchScope;
  current_folder?: string;
  on_change: (scope: SearchScope) => void;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-lg p-0.5"
      style={{ backgroundColor: "var(--bg-tertiary)" }}
    >
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
        All Mail
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

function FolderResultsBadges({
  folder_counts,
}: {
  folder_counts: Map<string, number>;
}) {
  if (folder_counts.size === 0) return null;

  const folder_labels: Record<string, { label: string; color: string }> = {
    inbox: { label: "Inbox", color: "#3b82f6" },
    sent: { label: "Sent", color: "#10b981" },
    drafts: { label: "Drafts", color: "#f59e0b" },
    trash: { label: "Trash", color: "#ef4444" },
    spam: { label: "Spam", color: "#ef4444" },
    archive: { label: "Archive", color: "#6b7280" },
  };

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

function OperatorSuggestions({
  partial,
  on_select,
}: {
  partial: string;
  on_select: (operator: string) => void;
}) {
  const suggestions = useMemo(() => {
    const last_word = partial.split(/\s+/).pop() || "";

    if (last_word.includes(":") && !last_word.endsWith(":")) {
      return [];
    }

    return get_operator_suggestions(last_word).slice(0, 5);
  }, [partial]);

  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.operator}
          className="px-2 py-1 text-[11px] rounded border transition-all duration-150 hover:scale-105"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-secondary)",
            color: "var(--text-muted)",
          }}
          onClick={() => on_select(suggestion.operator)}
        >
          <span className="font-mono">{suggestion.operator}</span>
          <span className="ml-1.5 opacity-70">{suggestion.description}</span>
        </button>
      ))}
    </div>
  );
}

function FolderResultRow({
  folder,
  on_click,
}: {
  folder: DecryptedFolder;
  on_click: () => void;
}) {
  const [is_hovered, set_is_hovered] = useState(false);

  return (
    <button
      className="flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors rounded-md"
      style={{
        backgroundColor: is_hovered ? "var(--bg-hover)" : "transparent",
      }}
      onClick={on_click}
      onMouseEnter={() => set_is_hovered(true)}
      onMouseLeave={() => set_is_hovered(false)}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: folder.color
            ? `${folder.color}20`
            : "var(--bg-tertiary)",
        }}
      >
        <FolderIcon
          className="w-4 h-4"
          style={{ color: folder.color || "var(--text-secondary)" }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <span
          className="text-[13px] font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {folder.name}
        </span>
        {folder.item_count !== undefined && folder.item_count > 0 && (
          <span
            className="text-[11px] ml-2"
            style={{ color: "var(--text-muted)" }}
          >
            {folder.item_count} item{folder.item_count !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        Folder
      </span>
    </button>
  );
}

function HighlightedText({
  text,
  highlights,
}: {
  text: string;
  highlights: TextHighlight[];
}) {
  if (highlights.length === 0) {
    return <span>{text}</span>;
  }

  return (
    <>
      {highlights.map((segment, idx) =>
        segment.is_match ? (
          <mark
            key={idx}
            className="rounded px-0.5"
            style={{
              backgroundColor: "var(--accent-color, #3b82f6)",
              color: "#ffffff",
            }}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={idx}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function ContactResultRow({
  contact,
  on_click,
  on_profile_click,
  search_query,
}: {
  contact: DecryptedContact;
  on_click: () => void;
  on_profile_click: () => void;
  search_query?: string;
}) {
  const display_name =
    `${contact.first_name} ${contact.last_name}`.trim() || "Unknown";
  const primary_email = contact.emails?.[0] || "";

  const get_match_context = () => {
    if (!search_query || search_query.length < 2) return null;
    const q = search_query.toLowerCase();
    const name_lower = display_name.toLowerCase();
    const email_lower = primary_email.toLowerCase();

    if (name_lower.includes(q) || email_lower.includes(q)) return null;

    if (contact.company?.toLowerCase().includes(q)) {
      return contact.company;
    }
    if (contact.job_title?.toLowerCase().includes(q)) {
      return contact.job_title;
    }
    if (contact.phone?.toLowerCase().includes(q)) {
      return contact.phone;
    }
    if (contact.address?.city?.toLowerCase().includes(q)) {
      return contact.address.city;
    }
    if (contact.address?.country?.toLowerCase().includes(q)) {
      return contact.address.country;
    }
    return null;
  };

  const match_context = get_match_context();

  return (
    <div
      className="group flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-pointer hover:bg-[var(--bg-hover)]"
      role="button"
      tabIndex={0}
      onClick={on_click}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          on_click();
        }
      }}
    >
      <ProfileAvatar
        use_domain_logo
        email={primary_email}
        image_url={contact.avatar_url}
        name={display_name}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <span
          className="text-sm font-medium block truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {display_name}
        </span>
        <span
          className="text-xs block truncate"
          style={{ color: "var(--text-muted)" }}
        >
          {match_context ? `${primary_email} · ${match_context}` : primary_email}
        </span>
      </div>
      <button
        className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--bg-tertiary)]"
        title="View contact profile"
        onClick={(e) => {
          e.stopPropagation();
          on_profile_click();
        }}
      >
        <UserIcon className="w-4 h-4 text-[var(--text-muted)]" />
      </button>
      <span
        className="text-[10px] px-1.5 py-0.5 rounded group-hover:hidden"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          color: "var(--text-muted)",
        }}
      >
        Contact
      </span>
    </div>
  );
}

function SearchHistorySection({
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
  if (history.length === 0) return null;

  return (
    <div className="p-2">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span
          className="text-[10px] font-medium uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Recent Searches
        </span>
        <button
          className="text-[10px] transition-colors hover:underline"
          style={{ color: "var(--text-muted)" }}
          onClick={on_clear_all}
        >
          Clear all
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
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              on_select(entry.query);
            }
          }}
        >
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="currentColor"
            style={{ color: "var(--text-muted)" }}
            viewBox="0 0 24 24"
          >
            <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
          </svg>
          <span
            className="flex-1 text-sm truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {entry.query}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {format_history_timestamp(entry.timestamp)}
          </span>
          <button
            className="p-1 rounded-full transition-colors opacity-0 hover:opacity-100 hover:bg-white/10"
            style={{ color: "var(--text-muted)" }}
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

function SavedSearchesSection({
  saved_searches,
  on_select,
  on_delete,
}: {
  saved_searches: SavedSearch[];
  on_select: (search: SavedSearch) => void;
  on_delete: (id: string) => void;
}) {
  if (saved_searches.length === 0) return null;

  return (
    <div
      className="p-2 border-t"
      style={{ borderColor: "var(--border-secondary)" }}
    >
      <div className="px-3 py-1.5">
        <span
          className="text-[10px] font-medium uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Saved Searches
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
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              on_select(saved);
            }
          }}
        >
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="currentColor"
            style={{ color: "var(--accent-color, #3b82f6)" }}
            viewBox="0 0 24 24"
          >
            <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z" />
          </svg>
          <div className="flex-1 min-w-0">
            <span
              className="text-sm font-medium block truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {saved.name}
            </span>
            <span
              className="text-xs block truncate"
              style={{ color: "var(--text-muted)" }}
            >
              {saved.query}
            </span>
          </div>
          <button
            className="p-1 rounded-full transition-colors opacity-0 hover:opacity-100 hover:bg-white/10"
            style={{ color: "var(--text-muted)" }}
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

function SaveSearchDialog({
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
      set_error("Please enter a name");

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
      initial={{ opacity: 0 }}
      onClick={on_close}
    >
      <motion.div
        animate={{ scale: 1, opacity: 1 }}
        className="rounded-xl p-5 w-full max-w-sm mx-4 shadow-2xl"
        exit={{ scale: 0.95, opacity: 0 }}
        initial={{ scale: 0.95, opacity: 0 }}
        style={{
          backgroundColor: "var(--modal-bg)",
          border: "1px solid var(--border-secondary)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          className="text-base font-semibold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          Save Search
        </h3>
        <div
          className="text-xs mb-4 px-3 py-2 rounded-lg"
          style={{
            color: "var(--text-muted)",
            backgroundColor: "var(--bg-tertiary)",
          }}
        >
          <span className="font-medium">Query:</span>{" "}
          <span className="font-mono text-[11px]">{query}</span>
        </div>
        <input
          ref={input_ref}
          className="w-full px-3 py-2.5 text-sm rounded-lg border mb-3 outline-none transition-all focus:ring-2 focus:ring-blue-500/30"
          placeholder="Enter a name for this search..."
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: error ? "#ef4444" : "var(--border-secondary)",
            color: "var(--text-primary)",
          }}
          value={name}
          onChange={(e) => {
            set_name(e.target.value);
            set_error("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handle_save();
            } else if (e.key === "Escape") {
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
        <div
          className="flex justify-end gap-2 pt-3 border-t"
          style={{ borderColor: "var(--border-secondary)" }}
        >
          <button
            className="px-4 py-2 text-sm rounded-lg transition-all hover:opacity-80"
            style={{
              color: "var(--text-muted)",
              backgroundColor: "var(--bg-hover)",
            }}
            onClick={on_close}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 text-sm rounded-lg font-medium transition-all hover:opacity-90"
            style={{
              backgroundColor: "var(--accent-color, #3b82f6)",
              color: "#ffffff",
            }}
            onClick={handle_save}
          >
            Save
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ClearDataMenu({
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
      className="absolute right-0 top-full mt-1 py-2 px-3 rounded-lg border shadow-lg z-50 w-56"
      exit={{ opacity: 0, y: -4 }}
      initial={{ opacity: 0, y: -4 }}
      style={{
        backgroundColor: "var(--modal-bg)",
        borderColor: "var(--border-secondary)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <p
        className="text-xs font-medium mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        Clear Search Data
      </p>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs cursor-pointer">
          <CustomCheckbox
            checked={clear_history}
            on_change={() => set_clear_history(!clear_history)}
          />
          <span style={{ color: "var(--text-secondary)" }}>Search history</span>
        </div>
        <div className="flex items-center gap-2 text-xs cursor-pointer">
          <CustomCheckbox
            checked={clear_saved}
            on_change={() => set_clear_saved(!clear_saved)}
          />
          <span style={{ color: "var(--text-secondary)" }}>Saved searches</span>
        </div>
        <div className="flex items-center gap-2 text-xs cursor-pointer">
          <CustomCheckbox
            checked={clear_cache}
            on_change={() => set_clear_cache(!clear_cache)}
          />
          <span style={{ color: "var(--text-secondary)" }}>Result cache</span>
        </div>
      </div>
      <div
        className="flex justify-end gap-2 mt-3 pt-2 border-t"
        style={{ borderColor: "var(--border-secondary)" }}
      >
        <button
          className="px-2 py-1 text-xs rounded transition-colors"
          style={{ color: "var(--text-muted)" }}
          onClick={on_close}
        >
          Cancel
        </button>
        <button
          className="px-2 py-1 text-xs rounded font-medium transition-colors disabled:opacity-50"
          disabled={
            is_clearing || (!clear_history && !clear_saved && !clear_cache)
          }
          style={{
            backgroundColor: "#ef4444",
            color: "#ffffff",
          }}
          onClick={handle_clear}
        >
          {is_clearing ? "Clearing..." : "Clear"}
        </button>
      </div>
    </motion.div>
  );
}

function DateShortcutPills({
  on_select,
}: {
  on_select: (shortcut: string) => void;
}) {
  const shortcuts = [
    { label: "Today", value: "date:today" },
    { label: "This week", value: "date:this_week" },
    { label: "This month", value: "date:this_month" },
  ];

  return (
    <div className="flex items-center gap-1.5">
      {shortcuts.map((shortcut) => (
        <button
          key={shortcut.value}
          className="px-2 py-1 text-[10px] rounded-full border transition-colors hover:scale-105"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-secondary)",
            color: "var(--text-muted)",
          }}
          onClick={() => on_select(shortcut.value)}
        >
          {shortcut.label}
        </button>
      ))}
    </div>
  );
}

interface QuickActionHandlers {
  on_archive?: (result: SearchResultItem) => void;
  on_delete?: (result: SearchResultItem) => void;
  on_toggle_star?: (result: SearchResultItem) => void;
  on_toggle_read?: (result: SearchResultItem) => void;
}

const SearchResultRow = forwardRef<
  HTMLButtonElement,
  {
    result: SearchResultItem;
    on_click: () => void;
    query_terms?: string[];
    quick_actions?: QuickActionHandlers;
  }
>(function SearchResultRow(
  { result, on_click, query_terms = [], quick_actions },
  ref,
) {
  const [is_hovered, set_is_hovered] = useState(false);

  const preview_lines = useMemo(() => {
    const raw_preview = result.preview || "";
    const plain_text = strip_html_tags(raw_preview);
    const lines = plain_text
      .split(/\n/)
      .filter((l) => l.trim())
      .slice(0, 2);

    return lines.length > 0 ? lines.join(" ") : plain_text;
  }, [result.preview]);

  const subject_highlights = useMemo(() => {
    if (query_terms.length === 0 || !result.subject) return [];

    const ranges = compute_highlight_ranges(result.subject, query_terms);

    return apply_highlights(result.subject, ranges);
  }, [result.subject, query_terms]);

  const preview_highlights = useMemo(() => {
    if (query_terms.length === 0 || !preview_lines) return [];

    const ranges = compute_highlight_ranges(preview_lines, query_terms);

    return apply_highlights(preview_lines, ranges);
  }, [preview_lines, query_terms]);

  return (
    <button
      ref={ref}
      className="flex items-center gap-3 w-full px-3 py-2.5 text-left transition-all rounded-lg group"
      style={{
        backgroundColor: is_hovered ? "var(--bg-hover)" : "transparent",
      }}
      onClick={on_click}
      onMouseEnter={() => set_is_hovered(true)}
      onMouseLeave={() => set_is_hovered(false)}
    >
      <ProfileAvatar
        use_domain_logo
        email={result.sender_email}
        image_url={result.avatar_url}
        name={result.sender_name}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[13px] font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {result.sender_name}
          </span>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            ·
          </span>
          <span
            className="text-[11px] truncate flex-1"
            style={{
              color: result.is_read
                ? "var(--text-muted)"
                : "var(--text-secondary)",
              fontWeight: result.is_read ? 400 : 500,
            }}
          >
            {subject_highlights.length > 0 ? (
              <HighlightedText
                highlights={subject_highlights}
                text={result.subject}
              />
            ) : (
              result.subject
            )}
          </span>
        </div>
        <p
          className="text-[11px] truncate"
          style={{ color: "var(--text-muted)" }}
        >
          {preview_highlights.length > 0 ? (
            <HighlightedText
              highlights={preview_highlights}
              text={preview_lines}
            />
          ) : (
            preview_lines
          )}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 relative">
        {quick_actions && is_hovered && (
          <div
            className="absolute right-0 top-0 bottom-0 w-36 pointer-events-none bg-gradient-to-r from-transparent to-[var(--bg-hover)]"
            style={{
              ["--tw-gradient-via-position" as string]: "30%",
              ["--tw-gradient-to-position" as string]: "100%",
            }}
          />
        )}
        {quick_actions && (
          <div
            className="flex items-center gap-0.5 absolute right-0 transition-opacity duration-75"
            style={{
              opacity: is_hovered ? 1 : 0,
              pointerEvents: is_hovered ? "auto" : "none",
            }}
          >
            <button
              className="p-1.5 rounded-md transition-colors hover:bg-black/10 dark:hover:bg-white/10"
              style={{ color: "var(--text-muted)" }}
              title={result.is_read ? "Mark unread" : "Mark read"}
              onClick={(e) => {
                e.stopPropagation();
                quick_actions.on_toggle_read?.(result);
              }}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                {result.is_read ? (
                  <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                ) : (
                  <path d="M22 8.98V18c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h10.1c-.06.32-.1.66-.1 1 0 1.48.65 2.79 1.67 3.71L12 11 4 6v2l8 5 5.3-3.32c.54.2 1.1.32 1.7.32 1.13 0 2.16-.39 3-1.02zM19 3c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                )}
              </svg>
            </button>
            <button
              className="p-1.5 rounded-md transition-colors hover:bg-black/10 dark:hover:bg-white/10"
              style={{
                color: result.is_starred ? "#f59e0b" : "var(--text-muted)",
              }}
              title={result.is_starred ? "Unstar" : "Star"}
              onClick={(e) => {
                e.stopPropagation();
                quick_actions.on_toggle_star?.(result);
              }}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
              </svg>
            </button>
            <button
              className="p-1.5 rounded-md transition-colors hover:bg-black/10 dark:hover:bg-white/10"
              style={{ color: "var(--text-muted)" }}
              title="Archive"
              onClick={(e) => {
                e.stopPropagation();
                quick_actions.on_archive?.(result);
              }}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z" />
              </svg>
            </button>
            <button
              className="p-1.5 rounded-md transition-colors hover:bg-black/10 dark:hover:bg-white/10"
              style={{ color: "var(--text-muted)" }}
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                quick_actions.on_delete?.(result);
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
        )}
        <div
          className="flex items-center gap-1.5 transition-opacity duration-75"
          style={{
            opacity: is_hovered && quick_actions ? 0 : 1,
          }}
        >
          {result.is_starred && (
            <svg className="w-3 h-3" fill="#f59e0b" viewBox="0 0 24 24">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
            </svg>
          )}
          {result.has_attachment && (
            <svg
              className="w-3 h-3"
              fill="currentColor"
              style={{ color: "var(--text-muted)" }}
              viewBox="0 0 24 24"
            >
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
            </svg>
          )}
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {format_relative_time(result.timestamp)}
          </span>
        </div>
      </div>
    </button>
  );
});

function EmptySearchState({ query }: { query: string }) {
  const operators = [
    {
      operator: "from:",
      example: "from:john@email.com",
      desc: "Search by sender",
    },
    {
      operator: "has:",
      example: "has:attachment",
      desc: "Filter by attachments",
    },
    { operator: "is:", example: "is:unread", desc: "Filter by status" },
    { operator: "after:", example: "after:2024-01-01", desc: "After a date" },
    { operator: '"..."', example: '"exact phrase"', desc: "Exact match" },
  ];

  return (
    <div className="py-6 px-4">
      <div className="text-center mb-5">
        <p
          className="text-sm font-medium mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          No results for &ldquo;{query}&rdquo;
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Try refining your search with operators
        </p>
      </div>
      <div
        className="rounded-lg p-3"
        style={{ backgroundColor: "var(--bg-tertiary)" }}
      >
        <p
          className="text-[10px] font-medium mb-2"
          style={{ color: "var(--text-muted)" }}
        >
          Search operators
        </p>
        <div className="space-y-1.5">
          {operators.map((op) => (
            <div
              key={op.operator}
              className="flex items-center justify-between text-[11px]"
            >
              <code
                className="px-1.5 py-0.5 rounded font-mono"
                style={{
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-secondary)",
                }}
              >
                {op.example}
              </code>
              <span style={{ color: "var(--text-muted)" }}>{op.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface QuickSearchAction {
  label: string;
  query: string;
  icon: React.ReactNode;
}

function FirstTimeSearchState({
  on_quick_action,
}: {
  on_quick_action?: (query: string) => void;
}) {
  const quick_actions: QuickSearchAction[] = [
    {
      label: "Unread",
      query: "is:unread",
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M22 8.98V18c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h10.1c-.06.32-.1.66-.1 1 0 1.48.65 2.79 1.67 3.71L12 11 4 6v2l8 5 5.3-3.32c.54.2 1.1.32 1.7.32 1.13 0 2.16-.39 3-1.02zM19 3c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
        </svg>
      ),
    },
    {
      label: "Starred",
      query: "is:starred",
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      ),
    },
    {
      label: "Attachments",
      query: "has:attachment",
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
        </svg>
      ),
    },
    {
      label: "This week",
      query: "after:7d",
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="py-8 px-6 text-center">
      <svg
        className="w-10 h-10 mx-auto mb-3"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        style={{ color: "var(--text-muted)", opacity: 0.5 }}
        viewBox="0 0 24 24"
      >
        <path
          d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
        Search by sender, subject, or content
      </p>
      {on_quick_action && (
        <div className="flex flex-wrap justify-center gap-2">
          {quick_actions.map((action) => (
            <button
              key={action.query}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-secondary)",
                color: "var(--text-secondary)",
              }}
              onClick={() => on_quick_action(action.query)}
            >
              <span style={{ color: "var(--text-muted)" }}>{action.icon}</span>
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SearchModal({
  is_open,
  on_close,
  initial_query,
  on_initial_query_consumed,
  on_search_submit,
}: SearchModalProps) {
  const navigate = useNavigate();
  const { user } = use_auth();
  const {
    state,
    autocomplete_state,
    search,
    clear_results,
    load_more,
    set_query,
    navigate_to_result,
    get_autocomplete,
    select_autocomplete,
    clear_autocomplete,
  } = use_search();

  const { state: folders_state } = use_folders();

  const [selected_index, set_selected_index] = useState(-1);
  const [show_filters, set_show_filters] = useState(false);
  const [show_autocomplete, set_show_autocomplete] = useState(false);
  const [filters, set_filters] = useState<FilterState>({
    fields: ["all"],
    has_attachments: undefined,
    is_starred: undefined,
    date_from: "",
    date_to: "",
  });
  const [search_history, set_search_history] = useState<SearchHistoryEntry[]>(
    [],
  );
  const [saved_searches, set_saved_searches] = useState<SavedSearch[]>([]);
  const [show_save_dialog, set_show_save_dialog] = useState(false);
  const [show_clear_menu, set_show_clear_menu] = useState(false);
  const [local_updates, set_local_updates] = useState<
    Map<string, Partial<SearchResultItem>>
  >(new Map());
  const [all_contacts, set_all_contacts] = useState<DecryptedContact[]>([]);
  const [contacts_loaded, set_contacts_loaded] = useState(false);

  const input_ref = useRef<HTMLInputElement>(null);
  const results_container_ref = useRef<HTMLDivElement>(null);

  const update_result_locally = useCallback(
    (id: string, updates: Partial<SearchResultItem>) => {
      set_local_updates((prev) => {
        const next = new Map(prev);
        const existing = next.get(id) || {};

        next.set(id, { ...existing, ...updates });

        return next;
      });
    },
    [],
  );

  const remove_result_locally = useCallback((id: string) => {
    set_local_updates((prev) => {
      const next = new Map(prev);

      next.set(id, { __removed: true } as Partial<SearchResultItem> & {
        __removed?: boolean;
      });

      return next;
    });
  }, []);

  const { toggle_star, toggle_read, archive_email, delete_email } =
    use_email_actions({
      on_optimistic_update: update_result_locally,
      on_remove_from_list: remove_result_locally,
    });

  useEffect(() => {
    if (!user?.id || !is_open) return;

    const load_search_data = async () => {
      const [history, saved] = await Promise.all([
        get_search_history(user.id),
        get_saved_searches(user.id),
      ]);

      set_search_history(history);
      set_saved_searches(saved);
    };

    load_search_data();
  }, [user?.id, is_open]);

  useEffect(() => {
    if (!is_open || contacts_loaded) return;

    const load_contacts = async () => {
      try {
        const response = await list_contacts({ limit: 100 });

        if (response.data?.items) {
          const decrypted = await decrypt_contacts(response.data.items);

          set_all_contacts(decrypted);
          set_contacts_loaded(true);
        }
      } catch {
        set_contacts_loaded(true);
      }
    };

    load_contacts();
  }, [is_open, contacts_loaded]);

  useEffect(() => {
    if (is_open && initial_query) {
      set_query(initial_query);
      search(initial_query, { fields: filters.fields });
      on_initial_query_consumed?.();
    }
  }, [
    is_open,
    initial_query,
    set_query,
    search,
    filters.fields,
    on_initial_query_consumed,
  ]);

  const handle_history_select = useCallback(
    async (query: string) => {
      set_query(query);
      search(query, { fields: filters.fields });
    },
    [set_query, search, filters.fields],
  );

  const handle_history_remove = useCallback(
    async (entry_id: string) => {
      if (!user?.id) return;
      const updated = await remove_from_history(user.id, entry_id);

      set_search_history(updated);
    },
    [user?.id],
  );

  const handle_clear_all_history = useCallback(async () => {
    if (!user?.id) return;
    await clear_search_data(user.id, {
      clear_history: true,
      clear_saved_searches: false,
      clear_cache: false,
    });
    set_search_history([]);
  }, [user?.id]);

  const handle_saved_search_select = useCallback(
    async (saved: SavedSearch) => {
      if (!user?.id) return;
      await update_saved_search_usage(user.id, saved.id);
      set_query(saved.query);
      search(saved.query, { fields: filters.fields });
    },
    [user?.id, set_query, search, filters.fields],
  );

  const handle_saved_search_delete = useCallback(
    async (search_id: string) => {
      if (!user?.id) return;
      const updated = await delete_saved_search_from_storage(
        user.id,
        search_id,
      );

      set_saved_searches(updated);
    },
    [user?.id],
  );

  const handle_save_search = useCallback(
    async (name: string) => {
      if (!user?.id || !state.query) return;
      const result = await save_search_to_storage(user.id, name, state.query);

      if (result.success && result.search) {
        set_saved_searches((prev) => [result.search!, ...prev]);
      }
      set_show_save_dialog(false);
    },
    [user?.id, state.query],
  );

  const handle_clear_data = useCallback(
    async (options: { history: boolean; saved: boolean; cache: boolean }) => {
      if (!user?.id) return;
      await clear_search_data(user.id, {
        clear_history: options.history,
        clear_saved_searches: options.saved,
        clear_cache: options.cache,
      });

      if (options.history) {
        set_search_history([]);
      }
      if (options.saved) {
        set_saved_searches([]);
      }
      if (options.cache) {
        clear_results();
      }
    },
    [user?.id, clear_results],
  );

  const query_terms = useMemo(
    () => extract_query_terms(state.query),
    [state.query],
  );

  const filtered_folders = useMemo(() => {
    if (!state.query || state.query.length < 2) return [];
    const query_lower = state.query.toLowerCase();

    return folders_state.folders.filter((folder) => {
      if (folder.is_system) return false;
      if (!folder.name.toLowerCase().includes(query_lower)) return false;
      if (
        folder.is_password_protected &&
        folder.password_set &&
        !is_folder_unlocked(folder.id)
      ) {
        return false;
      }

      return true;
    });
  }, [state.query, folders_state.folders]);

  const locked_folder_tokens = useMemo(() => {
    const tokens = new Set<string>();

    for (const folder of folders_state.folders) {
      if (
        folder.is_password_protected &&
        folder.password_set &&
        !is_folder_unlocked(folder.id)
      ) {
        tokens.add(folder.folder_token);
      }
    }

    return tokens;
  }, [folders_state.folders]);

  const filtered_results = useMemo(() => {
    let results = state.results;

    if (locked_folder_tokens.size > 0) {
      results = results.filter((result) => {
        if (!result.folders || result.folders.length === 0) return true;

        return !result.folders.some((f) =>
          locked_folder_tokens.has(f.folder_token),
        );
      });
    }

    if (local_updates.size > 0) {
      results = results
        .map((result) => {
          const updates = local_updates.get(result.id);

          if (!updates) return result;
          if ((updates as { __removed?: boolean }).__removed) return null;

          return { ...result, ...updates };
        })
        .filter((r): r is SearchResultItem => r !== null);
    }

    return results;
  }, [state.results, locked_folder_tokens, local_updates]);

  const filtered_contacts = useMemo(() => {
    if (!state.query || state.query.length < 2) return [];

    const query_lower = state.query.toLowerCase();

    return all_contacts
      .filter((contact) => {
        const first_name = contact.first_name?.toLowerCase() || "";
        const last_name = contact.last_name?.toLowerCase() || "";
        const full_name = `${first_name} ${last_name}`;
        const emails = contact.emails?.map((email: string) => email.toLowerCase()) || [];
        const company = contact.company?.toLowerCase() || "";
        const job_title = contact.job_title?.toLowerCase() || "";
        const phone = contact.phone?.toLowerCase() || "";
        const notes = contact.notes?.toLowerCase() || "";
        const relationship = contact.relationship?.toLowerCase() || "";
        const groups = contact.groups?.map((g: string) => g.toLowerCase()) || [];

        const address_parts: string[] = [];
        if (contact.address) {
          if (contact.address.street) address_parts.push(contact.address.street.toLowerCase());
          if (contact.address.city) address_parts.push(contact.address.city.toLowerCase());
          if (contact.address.state) address_parts.push(contact.address.state.toLowerCase());
          if (contact.address.postal_code) address_parts.push(contact.address.postal_code.toLowerCase());
          if (contact.address.country) address_parts.push(contact.address.country.toLowerCase());
        }

        const social_parts: string[] = [];
        if (contact.social_links) {
          if (contact.social_links.linkedin) social_parts.push(contact.social_links.linkedin.toLowerCase());
          if (contact.social_links.twitter) social_parts.push(contact.social_links.twitter.toLowerCase());
          if (contact.social_links.github) social_parts.push(contact.social_links.github.toLowerCase());
          if (contact.social_links.website) social_parts.push(contact.social_links.website.toLowerCase());
        }

        return (
          first_name.includes(query_lower) ||
          last_name.includes(query_lower) ||
          full_name.includes(query_lower) ||
          emails.some((email: string) => email.includes(query_lower)) ||
          company.includes(query_lower) ||
          job_title.includes(query_lower) ||
          phone.includes(query_lower) ||
          notes.includes(query_lower) ||
          relationship.includes(query_lower) ||
          groups.some((g: string) => g.includes(query_lower)) ||
          address_parts.some((part) => part.includes(query_lower)) ||
          social_parts.some((part) => part.includes(query_lower))
        );
      })
      .slice(0, 5);
  }, [state.query, all_contacts]);

  const handle_contact_click = useCallback(
    (contact: DecryptedContact) => {
      const primary_email = contact.emails?.[0];

      if (primary_email) {
        set_query(`from:${primary_email}`);
        if (on_search_submit) {
          on_search_submit(`from:${primary_email}`);
        } else {
          search(`from:${primary_email}`, { fields: ["all"] });
        }
      }
      on_close();
    },
    [set_query, search, on_search_submit, on_close],
  );

  const handle_contact_profile_click = useCallback(
    (contact: DecryptedContact) => {
      on_close();
      navigate(`/contacts?contact_id=${contact.id}`);
    },
    [on_close, navigate],
  );

  const handle_folder_click = useCallback(
    (folder: DecryptedFolder) => {
      on_close();
      navigate(`/folder/${folder.folder_token}`);
    },
    [on_close, navigate],
  );

  const quick_action_handlers: QuickActionHandlers = useMemo(
    () => ({
      on_archive: (result) => {
        archive_email(result);
      },
      on_delete: (result) => {
        delete_email(result);
      },
      on_toggle_star: (result) => {
        toggle_star(result);
      },
      on_toggle_read: (result) => {
        toggle_read(result);
      },
    }),
    [archive_email, delete_email, toggle_star, toggle_read],
  );

  const handle_quick_search = useCallback(
    (query: string) => {
      set_query(query);
      search(query, { fields: filters.fields });
    },
    [set_query, search, filters.fields],
  );

  const handle_close = useCallback(async () => {
    if (user?.id && state.query && filtered_results.length > 0) {
      const updated = await add_to_history(
        user.id,
        state.query,
        filtered_results.length,
      );

      set_search_history(updated);
    }
    clear_results();
    clear_autocomplete();
    set_selected_index(-1);
    set_show_filters(false);
    set_show_autocomplete(false);
    set_show_clear_menu(false);
    set_local_updates(new Map());
    on_close();
  }, [
    clear_results,
    clear_autocomplete,
    on_close,
    user?.id,
    state.query,
    filtered_results.length,
  ]);

  const handle_search = useCallback(
    (query: string) => {
      const search_filters: SearchFilters = {};

      if (filters.has_attachments !== undefined) {
        search_filters.has_attachments = filters.has_attachments;
      }
      if (filters.is_starred !== undefined) {
        search_filters.is_starred = filters.is_starred;
      }
      if (filters.date_from) {
        search_filters.date_from = filters.date_from;
      }
      if (filters.date_to) {
        search_filters.date_to = filters.date_to;
      }

      search(query, {
        fields: filters.fields,
        filters:
          Object.keys(search_filters).length > 0 ? search_filters : undefined,
      });
    },
    [search, filters],
  );

  const handle_input_change = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value;

      set_query(query);
      set_selected_index(-1);

      if (query.length >= 2 && !filtered_results.length) {
        set_show_autocomplete(true);
        get_autocomplete(query, filters.fields[0]);
      } else {
        set_show_autocomplete(false);
        clear_autocomplete();
      }

      handle_search(query);
    },
    [
      set_query,
      handle_search,
      get_autocomplete,
      clear_autocomplete,
      filters.fields,
      filtered_results.length,
    ],
  );

  const handle_autocomplete_select = useCallback(
    (suggestion: AutocompleteSuggestion) => {
      set_query(suggestion.text);
      set_show_autocomplete(false);
      clear_autocomplete();
      handle_search(suggestion.text);
    },
    [set_query, handle_search, clear_autocomplete],
  );

  const handle_result_click = useCallback(
    (mail_id: string) => {
      handle_close();
      navigate_to_result(mail_id);
    },
    [handle_close, navigate_to_result],
  );

  const handle_key_down = useCallback(
    (e: React.KeyboardEvent) => {
      const suggestions_count = autocomplete_state.suggestions.length;
      const results_count = filtered_results.length;

      if (show_autocomplete && suggestions_count > 0) {
        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            select_autocomplete(
              autocomplete_state.selected_index < suggestions_count - 1
                ? autocomplete_state.selected_index + 1
                : autocomplete_state.selected_index,
            );

            return;

          case "ArrowUp":
            e.preventDefault();
            select_autocomplete(
              autocomplete_state.selected_index > 0
                ? autocomplete_state.selected_index - 1
                : -1,
            );

            return;

          case "Enter":
            e.preventDefault();
            if (autocomplete_state.selected_index >= 0) {
              handle_autocomplete_select(
                autocomplete_state.suggestions[
                  autocomplete_state.selected_index
                ],
              );
            } else {
              set_show_autocomplete(false);
              handle_search(state.query);
            }

            return;

          case "Escape":
            e.preventDefault();
            set_show_autocomplete(false);
            clear_autocomplete();

            return;

          case "Tab":
            e.preventDefault();
            if (autocomplete_state.selected_index >= 0) {
              handle_autocomplete_select(
                autocomplete_state.suggestions[
                  autocomplete_state.selected_index
                ],
              );
            }

            return;
        }
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          set_selected_index((prev) =>
            prev < results_count - 1 ? prev + 1 : prev,
          );
          break;

        case "ArrowUp":
          e.preventDefault();
          set_selected_index((prev) => (prev > 0 ? prev - 1 : -1));
          break;

        case "Enter":
          e.preventDefault();
          if (
            state.query &&
            selected_index >= 0 &&
            selected_index < results_count
          ) {
            handle_result_click(filtered_results[selected_index].id);
          } else if (state.query && on_search_submit) {
            on_search_submit(state.query);
          } else if (state.query) {
            handle_search(state.query);
          }
          break;

        case "Escape":
          e.preventDefault();
          handle_close();
          break;

        case "Tab":
          if (e.shiftKey) {
            e.preventDefault();
            set_show_filters((prev) => !prev);
          }
          break;
      }
    },
    [
      filtered_results,
      state.query,
      selected_index,
      handle_result_click,
      handle_search,
      handle_close,
      show_autocomplete,
      autocomplete_state,
      select_autocomplete,
      handle_autocomplete_select,
      clear_autocomplete,
      on_search_submit,
    ],
  );

  const toggle_field = useCallback((field: SearchFieldType) => {
    set_filters((prev) => ({ ...prev, fields: [field] }));
  }, []);

  const handle_scroll = useCallback(() => {
    const container = results_container_ref.current;

    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const near_bottom = scrollHeight - scrollTop - clientHeight < 100;

    if (
      near_bottom &&
      state.has_more &&
      !state.is_searching &&
      !state.is_loading_more
    ) {
      load_more();
    }
  }, [state.has_more, state.is_searching, state.is_loading_more, load_more]);

  useEffect(() => {
    if (is_open && input_ref.current) {
      input_ref.current.focus();
    }
  }, [is_open]);

  useEffect(() => {
    set_selected_index(-1);
  }, [filtered_results]);

  useEffect(() => {
    if (state.results.length === 0) {
      set_local_updates(new Map());
    }
  }, [state.results.length]);

  useEffect(() => {
    const container = results_container_ref.current;

    if (!container) return;

    container.addEventListener("scroll", handle_scroll);

    return () => container.removeEventListener("scroll", handle_scroll);
  }, [handle_scroll]);

  useEffect(() => {
    if (state.query) {
      handle_search(state.query);
    }
  }, [
    filters.has_attachments,
    filters.is_starred,
    filters.date_from,
    filters.date_to,
    filters.fields,
  ]);

  const field_buttons = [
    { id: "all" as SearchFieldType, label: "All" },
    { id: "subject" as SearchFieldType, label: "Subject" },
    { id: "body" as SearchFieldType, label: "Body" },
    { id: "sender" as SearchFieldType, label: "Sender" },
    { id: "recipient" as SearchFieldType, label: "Recipient" },
  ];

  const show_first_time_state = !state.query;
  const show_empty_state =
    state.query &&
    !state.is_loading &&
    !state.is_searching &&
    filtered_results.length === 0 &&
    filtered_folders.length === 0 &&
    !state.error;
  const show_inline_results = !on_search_submit;

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/40 flex items-start sm:items-start justify-center pt-0 sm:pt-12 z-50 p-0 sm:p-4"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handle_close}
        >
          <motion.div
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="rounded-none sm:rounded-2xl w-full h-full sm:h-auto sm:max-w-2xl overflow-hidden transition-colors duration-200 flex flex-col"
            exit={{ scale: 0.96, opacity: 0, y: -10 }}
            initial={{ scale: 0.96, opacity: 0, y: -10 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              border: "1px solid var(--border-secondary)",
              boxShadow:
                "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05)",
            }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="p-4 border-b transition-colors duration-200 relative flex-shrink-0"
              style={{ borderColor: "var(--border-secondary)" }}
            >
              <div className="flex items-center gap-3">
                <button
                  className="sm:hidden p-1.5 -ml-1 rounded-lg transition-colors"
                  style={{
                    color: "var(--text-muted)",
                    backgroundColor: "var(--bg-hover)",
                  }}
                  onClick={handle_close}
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
                <div className="relative">
                  {state.is_loading || state.is_searching ? (
                    <Spinner className="text-[var(--accent-color)]" size="md" />
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      style={{ color: "var(--text-muted)" }}
                      viewBox="0 0 24 24"
                    >
                      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                  )}
                </div>
                <input
                  ref={input_ref}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  className="w-full text-sm outline-none transition-colors duration-200"
                  placeholder="Search your messages..."
                  style={{
                    backgroundColor: "transparent",
                    color: "var(--text-primary)",
                  }}
                  type="text"
                  value={state.query}
                  onChange={handle_input_change}
                  onKeyDown={handle_key_down}
                />
                {state.query && (
                  <button
                    className="p-1.5 rounded-full transition-all duration-150 hover:scale-110"
                    style={{
                      color: "var(--text-muted)",
                      backgroundColor: "var(--bg-hover)",
                    }}
                    onClick={() => {
                      set_query("");
                      clear_results();
                      input_ref.current?.focus();
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
                )}
                {!on_search_submit && (
                  <button
                    className="p-1.5 rounded-lg transition-all duration-150"
                    style={{
                      backgroundColor: show_filters
                        ? "var(--accent-color, #3b82f6)"
                        : "var(--bg-hover)",
                      color: show_filters ? "#ffffff" : "var(--text-muted)",
                    }}
                    title="Toggle filters (Shift+Tab)"
                    onClick={() => set_show_filters((prev) => !prev)}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
                    </svg>
                  </button>
                )}
                {!on_search_submit && state.query && filtered_results.length > 0 && (
                  <button
                    className="p-1.5 rounded-lg transition-all duration-150"
                    style={{
                      backgroundColor: "var(--bg-hover)",
                      color: "var(--text-muted)",
                    }}
                    title="Save this search"
                    onClick={() => set_show_save_dialog(true)}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z" />
                    </svg>
                  </button>
                )}
                {!on_search_submit && (
                  <div className="relative">
                    <button
                      className="p-1.5 rounded-lg transition-all duration-150"
                      style={{
                        backgroundColor: show_clear_menu
                          ? "var(--accent-color, #3b82f6)"
                          : "var(--bg-hover)",
                        color: show_clear_menu ? "#ffffff" : "var(--text-muted)",
                      }}
                      title="Clear search data"
                      onClick={() => set_show_clear_menu((prev) => !prev)}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" />
                      </svg>
                    </button>
                    <AnimatePresence>
                      {show_clear_menu && (
                        <ClearDataMenu
                          is_open={show_clear_menu}
                          on_clear={handle_clear_data}
                          on_close={() => set_show_clear_menu(false)}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>

            <AnimatePresence>
              {!on_search_submit && show_filters && (
                <motion.div
                  animate={{ height: "auto", opacity: 1 }}
                  className="border-b overflow-hidden"
                  exit={{ height: 0, opacity: 0 }}
                  initial={{ height: 0, opacity: 0 }}
                  style={{
                    borderColor: "var(--border-secondary)",
                    backgroundColor: "var(--bg-tertiary)",
                  }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="p-4 space-y-4">
                    <div>
                      <div
                        className="text-xs font-medium mb-2"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Search in
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {field_buttons.map((btn) => (
                          <button
                            key={btn.id}
                            className="px-3 py-1.5 text-xs rounded-lg transition-all duration-200 border font-medium"
                            style={{
                              backgroundColor: filters.fields.includes(btn.id)
                                ? "var(--accent-color, #3b82f6)"
                                : "var(--bg-card)",
                              color: filters.fields.includes(btn.id)
                                ? "#ffffff"
                                : "var(--text-secondary)",
                              borderColor: filters.fields.includes(btn.id)
                                ? "var(--accent-color, #3b82f6)"
                                : "var(--border-secondary)",
                              transform: filters.fields.includes(btn.id)
                                ? "scale(1.02)"
                                : "scale(1)",
                            }}
                            onClick={() => toggle_field(btn.id)}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex items-center gap-2 text-xs cursor-pointer">
                        <CustomCheckbox
                          checked={filters.has_attachments === true}
                          on_change={() =>
                            set_filters((prev) => ({
                              ...prev,
                              has_attachments: prev.has_attachments
                                ? undefined
                                : true,
                            }))
                          }
                        />
                        <span
                          className="hover:underline select-none"
                          role="button"
                          style={{ color: "var(--text-secondary)" }}
                          tabIndex={0}
                          onClick={() =>
                            set_filters((prev) => ({
                              ...prev,
                              has_attachments: prev.has_attachments
                                ? undefined
                                : true,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              set_filters((prev) => ({
                                ...prev,
                                has_attachments: prev.has_attachments
                                  ? undefined
                                  : true,
                              }));
                            }
                          }}
                        >
                          Has attachments
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs cursor-pointer">
                        <CustomCheckbox
                          checked={filters.is_starred === true}
                          on_change={() =>
                            set_filters((prev) => ({
                              ...prev,
                              is_starred: prev.is_starred ? undefined : true,
                            }))
                          }
                        />
                        <span
                          className="hover:underline select-none"
                          role="button"
                          style={{ color: "var(--text-secondary)" }}
                          tabIndex={0}
                          onClick={() =>
                            set_filters((prev) => ({
                              ...prev,
                              is_starred: prev.is_starred ? undefined : true,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              set_filters((prev) => ({
                                ...prev,
                                is_starred: prev.is_starred ? undefined : true,
                              }));
                            }
                          }}
                        >
                          Starred only
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label
                          className="text-xs block mb-1 font-medium"
                          htmlFor="search-date-from"
                          style={{ color: "var(--text-muted)" }}
                        >
                          From date
                        </label>
                        <input
                          className="w-full px-3 py-2 text-xs rounded-lg border transition-all duration-150 focus:ring-2 focus:ring-blue-500/20"
                          id="search-date-from"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-secondary)",
                            color: "var(--text-primary)",
                          }}
                          type="date"
                          value={filters.date_from}
                          onChange={(e) =>
                            set_filters((prev) => ({
                              ...prev,
                              date_from: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="flex-1">
                        <label
                          className="text-xs block mb-1 font-medium"
                          htmlFor="search-date-to"
                          style={{ color: "var(--text-muted)" }}
                        >
                          To date
                        </label>
                        <input
                          className="w-full px-3 py-2 text-xs rounded-lg border transition-all duration-150 focus:ring-2 focus:ring-blue-500/20"
                          id="search-date-to"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-secondary)",
                            color: "var(--text-primary)",
                          }}
                          type="date"
                          value={filters.date_to}
                          onChange={(e) =>
                            set_filters((prev) => ({
                              ...prev,
                              date_to: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div
              ref={results_container_ref}
              className="flex-1 sm:flex-none sm:max-h-[28rem] overflow-y-auto"
            >
              {!show_inline_results && state.query && (
                <div className="p-2">
                  {filtered_contacts.length > 0 && (
                    <>
                      <div
                        className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Contacts
                      </div>
                      {filtered_contacts.map((contact) => (
                        <ContactResultRow
                          key={contact.id}
                          contact={contact}
                          search_query={state.query}
                          on_click={() => handle_contact_click(contact)}
                          on_profile_click={() => handle_contact_profile_click(contact)}
                        />
                      ))}
                    </>
                  )}

                  {filtered_results.length > 0 && (
                    <>
                      <div
                        className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Emails
                      </div>
                      {filtered_results.slice(0, 5).map((result) => (
                        <SearchResultRow
                          key={result.id}
                          query_terms={query_terms}
                          result={result}
                          on_click={() => handle_result_click(result.id)}
                        />
                      ))}
                    </>
                  )}

                  {state.is_loading && filtered_results.length === 0 && (
                    <>
                      <SearchResultSkeleton />
                      <SearchResultSkeleton />
                      <SearchResultSkeleton />
                    </>
                  )}

                  {!state.is_loading &&
                    filtered_results.length === 0 &&
                    filtered_contacts.length === 0 && (
                      <div className="px-3 py-6 text-center">
                        <p
                          className="text-sm"
                          style={{ color: "var(--text-muted)" }}
                        >
                          No results found
                        </p>
                      </div>
                    )}

                  {(filtered_results.length > 0 || filtered_contacts.length > 0) && (
                    <button
                      className="w-full mt-2 py-2.5 text-sm font-medium rounded-lg transition-colors"
                      style={{
                        backgroundColor: "var(--accent-color, #3b82f6)",
                        color: "#ffffff",
                      }}
                      onClick={() => {
                        if (on_search_submit) {
                          on_search_submit(state.query);
                        }
                      }}
                    >
                      View all results for &ldquo;{state.query}&rdquo;
                    </button>
                  )}
                </div>
              )}

              {!show_inline_results && !state.query && (
                <>
                  <SearchHistorySection
                    history={search_history}
                    on_clear_all={handle_clear_all_history}
                    on_remove={handle_history_remove}
                    on_select={handle_history_select}
                  />
                  {search_history.length === 0 && (
                    <FirstTimeSearchState on_quick_action={handle_quick_search} />
                  )}
                </>
              )}

              {show_inline_results && state.error && (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4"
                  initial={{ opacity: 0, y: -10 }}
                >
                  <div
                    className="p-4 rounded-lg text-sm flex items-start gap-3"
                    style={{
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      color: "#ef4444",
                    }}
                  >
                    <svg
                      className="w-5 h-5 flex-shrink-0 mt-0.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                    <div>
                      <p className="font-medium">Search error</p>
                      <p className="text-xs mt-1 opacity-80">{state.error}</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {show_inline_results &&
                state.query &&
                state.is_loading &&
                filtered_results.length === 0 &&
                filtered_folders.length === 0 && (
                  <div className="p-2">
                    <SearchResultSkeleton />
                    <SearchResultSkeleton />
                    <SearchResultSkeleton />
                  </div>
                )}

              {show_inline_results && state.query && filtered_folders.length > 0 && (
                <div className="p-2 pb-0">
                  <div
                    className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Folders
                  </div>
                  {filtered_folders.slice(0, 5).map((folder) => (
                    <FolderResultRow
                      key={folder.id}
                      folder={folder}
                      on_click={() => handle_folder_click(folder)}
                    />
                  ))}
                  {filtered_folders.length > 5 && (
                    <div
                      className="px-3 py-1.5 text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      +{filtered_folders.length - 5} more folder
                      {filtered_folders.length - 5 !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              )}

              {show_inline_results && state.query && filtered_results.length > 0 && (
                <div className="p-2">
                  {filtered_folders.length > 0 && (
                    <div
                      className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Emails
                    </div>
                  )}
                  <div
                    className="px-3 py-2 text-xs flex items-center justify-between"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span>
                      Showing {filtered_results.length} of {state.total_results}{" "}
                      result
                      {state.total_results !== 1 ? "s" : ""}{" "}
                      {state.search_time_ms > 0 && (
                        <span className="opacity-60">
                          ({state.search_time_ms.toFixed(0)}ms)
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      {state.index_building && (
                        <span className="flex items-center gap-1 text-amber-500">
                          <Spinner size="xs" />
                          Indexing
                        </span>
                      )}
                      {state.search_time_ms > 0 && (
                        <span style={{ color: "var(--text-muted)" }}>
                          {state.search_time_ms < 1000
                            ? `${Math.round(state.search_time_ms)}ms`
                            : `${(state.search_time_ms / 1000).toFixed(1)}s`}
                        </span>
                      )}
                    </div>
                  </div>
                  <AnimatePresence mode="popLayout">
                    {filtered_results.map((result) => (
                      <SearchResultRow
                        key={result.id}
                        on_click={() => handle_result_click(result.id)}
                        query_terms={query_terms}
                        quick_actions={quick_action_handlers}
                        result={result}
                      />
                    ))}
                  </AnimatePresence>
                  {(state.is_searching || state.is_loading_more) && (
                    <div className="py-2">
                      <div className="flex items-center justify-center gap-2 py-3">
                        <Spinner
                          className="text-[var(--accent-color,#3b82f6)]"
                          size="sm"
                        />
                        <span
                          className="text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {state.is_loading_more
                            ? "Loading more..."
                            : "Searching..."}
                        </span>
                      </div>
                      {state.is_loading_more && <SearchResultSkeleton />}
                    </div>
                  )}
                  {state.has_more &&
                    !state.is_searching &&
                    !state.is_loading_more && (
                      <motion.button
                        className="w-full py-3 text-xs text-center transition-all duration-150 rounded-lg mt-2"
                        style={{
                          color: "var(--text-muted)",
                          backgroundColor: "var(--bg-tertiary)",
                        }}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={load_more}
                      >
                        Load more results (
                        {state.total_results - filtered_results.length}{" "}
                        remaining)
                      </motion.button>
                    )}
                </div>
              )}

              {show_inline_results && show_empty_state && <EmptySearchState query={state.query} />}

              {show_first_time_state && (
                <>
                  {search_history.length > 0 || saved_searches.length > 0 ? (
                    <>
                      <SearchHistorySection
                        history={search_history}
                        on_clear_all={handle_clear_all_history}
                        on_remove={handle_history_remove}
                        on_select={handle_history_select}
                      />
                      <SavedSearchesSection
                        on_delete={handle_saved_search_delete}
                        on_select={handle_saved_search_select}
                        saved_searches={saved_searches}
                      />
                      {search_history.length === 0 &&
                        saved_searches.length === 0 && (
                          <FirstTimeSearchState
                            on_quick_action={handle_quick_search}
                          />
                        )}
                    </>
                  ) : (
                    <FirstTimeSearchState
                      on_quick_action={handle_quick_search}
                    />
                  )}
                </>
              )}
            </div>

            <SaveSearchDialog
              is_open={show_save_dialog}
              on_close={() => set_show_save_dialog(false)}
              on_save={handle_save_search}
              query={state.query}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface AdvancedSearchModalProps {
  is_open: boolean;
  on_close: () => void;
  on_compose?: () => void;
  current_folder?: string;
}

export function AdvancedSearchModal({
  is_open,
  on_close,
  current_folder,
}: AdvancedSearchModalProps) {
  const {
    state,
    search,
    clear_results,
    remove_filter,
    add_quick_filter,
    set_sort_option,
    set_search_scope,
    set_raw_query,
    quick_filters,
    navigate_to_result,
    load_more,
  } = use_advanced_search();
  const { state: folders_state } = use_folders();

  const [selected_index, set_selected_index] = useState(-1);
  const [show_operator_hints, set_show_operator_hints] = useState(false);
  const [local_updates, set_local_updates] = useState<
    Map<string, Partial<SearchResultItem>>
  >(new Map());
  const input_ref = useRef<HTMLInputElement>(null);
  const results_container_ref = useRef<HTMLDivElement>(null);

  const update_result_locally = useCallback(
    (id: string, updates: Partial<SearchResultItem>) => {
      set_local_updates((prev) => {
        const next = new Map(prev);
        const existing = next.get(id) || {};

        next.set(id, { ...existing, ...updates });

        return next;
      });
    },
    [],
  );

  const remove_result_locally = useCallback((id: string) => {
    set_local_updates((prev) => {
      const next = new Map(prev);

      next.set(id, { __removed: true } as Partial<SearchResultItem> & {
        __removed?: boolean;
      });

      return next;
    });
  }, []);

  const { toggle_star, toggle_read, archive_email, delete_email } =
    use_email_actions({
      on_optimistic_update: update_result_locally,
      on_remove_from_list: remove_result_locally,
    });

  const locked_folder_tokens = useMemo(() => {
    const tokens = new Set<string>();

    for (const folder of folders_state.folders) {
      if (
        folder.is_password_protected &&
        folder.password_set &&
        !is_folder_unlocked(folder.id)
      ) {
        tokens.add(folder.folder_token);
      }
    }

    return tokens;
  }, [folders_state.folders]);

  const filtered_results = useMemo(() => {
    let results = state.results;

    if (locked_folder_tokens.size > 0) {
      results = results.filter((result) => {
        if (!result.folders || result.folders.length === 0) return true;

        return !result.folders.some((f) =>
          locked_folder_tokens.has(f.folder_token),
        );
      });
    }

    if (local_updates.size > 0) {
      results = results
        .map((result) => {
          const updates = local_updates.get(result.id);

          if (!updates) return result;
          if ((updates as { __removed?: boolean }).__removed) return null;

          return { ...result, ...updates };
        })
        .filter((r): r is SearchResultItem => r !== null);
    }

    return results;
  }, [state.results, locked_folder_tokens, local_updates]);

  const query_terms = useMemo(
    () => extract_query_terms(state.raw_query),
    [state.raw_query],
  );

  const handle_close = useCallback(() => {
    clear_results();
    set_selected_index(-1);
    set_show_operator_hints(false);
    set_local_updates(new Map());
    on_close();
  }, [clear_results, on_close]);

  const quick_action_handlers: QuickActionHandlers = useMemo(
    () => ({
      on_archive: (result) => {
        archive_email(result);
      },
      on_delete: (result) => {
        delete_email(result);
      },
      on_toggle_star: (result) => {
        toggle_star(result);
      },
      on_toggle_read: (result) => {
        toggle_read(result);
      },
    }),
    [archive_email, delete_email, toggle_star, toggle_read],
  );

  const handle_quick_search = useCallback(
    (query: string) => {
      set_raw_query(query);
      search(query);
    },
    [set_raw_query, search],
  );

  const handle_input_change = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value;

      set_raw_query(query);
      set_selected_index(-1);
      search(query);

      const last_char = query.slice(-1);

      set_show_operator_hints(
        query.length > 0 &&
          (last_char === " " || query.split(/\s+/).pop()?.length === 1),
      );
    },
    [set_raw_query, search],
  );

  const handle_operator_select = useCallback(
    (operator: string) => {
      const current_words = state.raw_query.split(/\s+/);
      const last_word = current_words.pop() || "";

      let new_query: string;

      if (last_word.length > 0 && !last_word.includes(":")) {
        new_query = [...current_words, operator].join(" ");
      } else {
        new_query = state.raw_query.trim() + " " + operator;
      }

      set_raw_query(new_query.trim());
      search(new_query.trim());
      set_show_operator_hints(false);
      input_ref.current?.focus();
    },
    [state.raw_query, set_raw_query, search],
  );

  const handle_result_click = useCallback(
    (mail_id: string) => {
      handle_close();
      navigate_to_result(mail_id);
    },
    [handle_close, navigate_to_result],
  );

  const handle_key_down = useCallback(
    (e: React.KeyboardEvent) => {
      const results_count = filtered_results.length;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          set_selected_index((prev) =>
            prev < results_count - 1 ? prev + 1 : prev,
          );
          break;

        case "ArrowUp":
          e.preventDefault();
          set_selected_index((prev) => (prev > 0 ? prev - 1 : -1));
          break;

        case "Enter":
          e.preventDefault();
          if (selected_index >= 0 && selected_index < results_count) {
            handle_result_click(filtered_results[selected_index].id);
          }
          break;

        case "Escape":
          e.preventDefault();
          handle_close();
          break;
      }
    },
    [filtered_results, selected_index, handle_result_click, handle_close],
  );

  const handle_scroll = useCallback(() => {
    const container = results_container_ref.current;

    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const near_bottom = scrollHeight - scrollTop - clientHeight < 100;

    if (
      near_bottom &&
      state.has_more &&
      !state.is_searching &&
      !state.is_loading
    ) {
      load_more();
    }
  }, [state.has_more, state.is_searching, state.is_loading, load_more]);

  useEffect(() => {
    if (is_open && input_ref.current) {
      input_ref.current.focus();
    }
  }, [is_open]);

  useEffect(() => {
    set_selected_index(-1);
  }, [filtered_results]);

  useEffect(() => {
    if (state.results.length === 0) {
      set_local_updates(new Map());
    }
  }, [state.results.length]);

  useEffect(() => {
    const container = results_container_ref.current;

    if (!container) return;

    container.addEventListener("scroll", handle_scroll);

    return () => container.removeEventListener("scroll", handle_scroll);
  }, [handle_scroll]);

  const is_quick_filter_active = useCallback(
    (operator: string) => {
      return state.raw_query.includes(operator);
    },
    [state.raw_query],
  );

  const show_empty_state =
    state.text_query &&
    !state.is_loading &&
    !state.is_searching &&
    filtered_results.length === 0 &&
    !state.error;

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/40 flex items-start sm:items-start justify-center pt-0 sm:pt-12 z-50 p-0 sm:p-4"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handle_close}
        >
          <motion.div
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="rounded-none sm:rounded-2xl w-full h-full sm:h-auto sm:max-w-2xl overflow-hidden transition-colors duration-200 flex flex-col"
            exit={{ scale: 0.96, opacity: 0, y: -10 }}
            initial={{ scale: 0.96, opacity: 0, y: -10 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              border: "1px solid var(--border-secondary)",
              boxShadow:
                "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05)",
            }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <ErrorBoundary>
              <div
                className="p-4 border-b transition-colors duration-200 flex-shrink-0"
                style={{ borderColor: "var(--border-secondary)" }}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {state.is_loading || state.is_searching ? (
                      <Spinner
                        className="text-[var(--accent-color)]"
                        size="md"
                      />
                    ) : (
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        style={{ color: "var(--text-muted)" }}
                        viewBox="0 0 24 24"
                      >
                        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                      </svg>
                    )}
                  </div>
                  <input
                    ref={input_ref}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    className="w-full text-sm outline-none transition-colors duration-200"
                    placeholder="Search your messages..."
                    style={{
                      backgroundColor: "transparent",
                      color: "var(--text-primary)",
                    }}
                    type="text"
                    value={state.raw_query}
                    onChange={handle_input_change}
                    onKeyDown={handle_key_down}
                  />
                  {state.raw_query && (
                    <button
                      className="p-1.5 rounded-full transition-all duration-150 hover:scale-110"
                      style={{
                        color: "var(--text-muted)",
                        backgroundColor: "var(--bg-hover)",
                      }}
                      onClick={() => {
                        set_raw_query("");
                        clear_results();
                        input_ref.current?.focus();
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
                  )}
                </div>

                {show_operator_hints && (
                  <OperatorSuggestions
                    on_select={handle_operator_select}
                    partial={state.raw_query}
                  />
                )}
              </div>

              <AnimatePresence>
                {state.active_filters.length > 0 && (
                  <motion.div
                    animate={{ height: "auto", opacity: 1 }}
                    className="px-4 py-2 border-b flex items-center gap-2 flex-wrap"
                    exit={{ height: 0, opacity: 0 }}
                    initial={{ height: 0, opacity: 0 }}
                    style={{ borderColor: "var(--border-secondary)" }}
                    transition={{ duration: 0.2 }}
                  >
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Active filters:
                    </span>
                    <AnimatePresence mode="popLayout">
                      {state.active_filters.map((filter) => (
                        <FilterChip
                          key={filter.id}
                          filter={filter}
                          on_remove={() => remove_filter(filter.id)}
                        />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>

              <div
                className="px-3 sm:px-4 py-2 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 flex-shrink-0"
                style={{
                  borderColor: "var(--border-secondary)",
                  backgroundColor: "var(--bg-tertiary)",
                }}
              >
                <div className="flex items-center gap-2 flex-wrap overflow-x-auto">
                  <span
                    className="text-xs font-medium hidden sm:inline"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Quick filters:
                  </span>
                  {quick_filters.map((filter) => (
                    <QuickFilterButton
                      key={filter.id}
                      is_active={is_quick_filter_active(filter.operator)}
                      label={filter.label}
                      on_click={() => add_quick_filter(filter.operator)}
                    />
                  ))}
                  <DateShortcutPills
                    on_select={(shortcut) => add_quick_filter(shortcut)}
                  />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <SearchScopeToggle
                    current_folder={current_folder}
                    on_change={set_search_scope}
                    scope={state.search_scope}
                  />
                  <SortDropdown
                    on_change={set_sort_option}
                    value={state.sort_option}
                  />
                </div>
              </div>

              <div
                ref={results_container_ref}
                className="flex-1 sm:flex-none sm:max-h-[28rem] overflow-y-auto"
              >
                {state.error && (
                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4"
                    initial={{ opacity: 0, y: -10 }}
                  >
                    <div
                      className="p-4 rounded-lg text-sm flex items-start gap-3"
                      style={{
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        color: "#ef4444",
                      }}
                    >
                      <svg
                        className="w-5 h-5 flex-shrink-0 mt-0.5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                      </svg>
                      <div>
                        <p className="font-medium">Search error</p>
                        <p className="text-xs mt-1 opacity-80">{state.error}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {state.raw_query &&
                  state.is_loading &&
                  filtered_results.length === 0 && (
                    <div className="p-2">
                      <SearchResultSkeleton />
                      <SearchResultSkeleton />
                      <SearchResultSkeleton />
                    </div>
                  )}

                {filtered_results.length > 0 && (
                  <div className="p-2">
                    <div
                      className="px-3 py-2 text-xs flex items-center justify-between"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <div className="flex items-center gap-3">
                        <span>
                          {filtered_results.length} of {state.total_results}{" "}
                          result
                          {state.total_results !== 1 ? "s" : ""}{" "}
                          {state.search_time_ms > 0 && (
                            <span className="opacity-60">
                              ({state.search_time_ms.toFixed(0)}ms)
                            </span>
                          )}
                        </span>
                        <FolderResultsBadges
                          folder_counts={state.result_folders}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        {state.search_time_ms > 0 && (
                          <span style={{ color: "var(--text-muted)" }}>
                            {state.search_time_ms < 1000
                              ? `${Math.round(state.search_time_ms)}ms`
                              : `${(state.search_time_ms / 1000).toFixed(1)}s`}
                          </span>
                        )}
                      </div>
                    </div>
                    <AnimatePresence mode="popLayout">
                      {filtered_results.map((result) => (
                        <SearchResultRow
                          key={result.id}
                          on_click={() => handle_result_click(result.id)}
                          query_terms={query_terms}
                          quick_actions={quick_action_handlers}
                          result={result}
                        />
                      ))}
                    </AnimatePresence>
                    {(state.is_searching || state.is_loading) &&
                      filtered_results.length > 0 && (
                        <div className="py-2">
                          <div className="flex items-center justify-center gap-2 py-3">
                            <Spinner
                              className="text-[var(--accent-color,#3b82f6)]"
                              size="sm"
                            />
                            <span
                              className="text-xs"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Loading more...
                            </span>
                          </div>
                          <SearchResultSkeleton />
                        </div>
                      )}
                    {state.has_more &&
                      !state.is_searching &&
                      !state.is_loading && (
                        <motion.button
                          className="w-full py-3 text-xs text-center transition-all duration-150 rounded-lg mt-2"
                          style={{
                            color: "var(--text-muted)",
                            backgroundColor: "var(--bg-tertiary)",
                          }}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={load_more}
                        >
                          Load more results (
                          {state.total_results - filtered_results.length}{" "}
                          remaining)
                        </motion.button>
                      )}
                  </div>
                )}

                {show_empty_state && (
                  <EmptySearchState query={state.text_query} />
                )}

                {!state.raw_query && (
                  <FirstTimeSearchState on_quick_action={handle_quick_search} />
                )}

                {!state.raw_query && (
                  <div
                    className="p-4 border-t"
                    style={{ borderColor: "var(--border-secondary)" }}
                  >
                    <div
                      className="text-xs font-semibold uppercase tracking-wider mb-3"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Search Operators
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { op: "from:", desc: "Search by sender" },
                        { op: "to:", desc: "Search by recipient" },
                        { op: "subject:", desc: "Search in subject" },
                        { op: "has:attachment", desc: "Has attachments" },
                        { op: "has:pdf", desc: "Has PDF files" },
                        { op: "is:unread", desc: "Unread emails" },
                        { op: "is:starred", desc: "Starred emails" },
                        { op: "in:sent", desc: "In sent folder" },
                        { op: "after:YYYY-MM-DD", desc: "After date" },
                        { op: "date:today", desc: "From today" },
                        { op: "larger:5mb", desc: "Larger than 5MB" },
                        { op: "-from:", desc: "Exclude sender" },
                      ].map((item) => (
                        <button
                          key={item.op}
                          className="flex items-start gap-2 p-2 rounded-lg text-left transition-colors"
                          style={{ color: "var(--text-secondary)" }}
                          onClick={() => {
                            set_raw_query(item.op);
                            search(item.op);
                            input_ref.current?.focus();
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.backgroundColor =
                              "var(--bg-hover)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.backgroundColor =
                              "transparent")
                          }
                        >
                          <code
                            className="px-1.5 py-0.5 rounded text-[11px] font-mono"
                            style={{
                              backgroundColor: "var(--bg-tertiary)",
                              color: "var(--accent-color, #3b82f6)",
                            }}
                          >
                            {item.op}
                          </code>
                          <span
                            className="text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {item.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div
                  className="p-4 border-t"
                  style={{ borderColor: "var(--border-secondary)" }}
                >
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{ backgroundColor: "var(--bg-tertiary)" }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: "var(--bg-card)" }}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        style={{ color: "var(--text-muted)" }}
                        viewBox="0 0 24 24"
                      >
                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                      </svg>
                    </div>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Search is performed client-side using encrypted tokens.
                      Your messages remain end-to-end encrypted.
                    </p>
                  </div>
                </div>
              </div>

              <div
                className="p-3 border-t flex items-center justify-between text-xs flex-shrink-0"
                style={{
                  borderColor: "var(--border-secondary)",
                  backgroundColor: "var(--bg-tertiary)",
                  color: "var(--text-muted)",
                }}
              >
                <div className="hidden sm:flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span>Navigate</span>
                    <kbd
                      className="px-1.5 py-0.5 border rounded flex items-center justify-center"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-secondary)",
                      }}
                    >
                      <svg
                        className="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M7 14l5-5 5 5z" />
                      </svg>
                    </kbd>
                    <kbd
                      className="px-1.5 py-0.5 border rounded flex items-center justify-center"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-secondary)",
                      }}
                    >
                      <svg
                        className="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M7 10l5 5 5-5z" />
                      </svg>
                    </kbd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>Select</span>
                    <kbd
                      className="px-1.5 py-0.5 border rounded"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-secondary)",
                      }}
                    >
                      Enter
                    </kbd>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                  <button
                    className="px-2 py-1 rounded transition-colors hover:bg-white/5"
                    style={{ color: "var(--text-muted)" }}
                    onClick={() => {
                      set_raw_query("");
                      clear_results();
                    }}
                  >
                    Clear
                  </button>
                  <button
                    className="sm:hidden px-3 py-1 rounded transition-colors"
                    style={{
                      color: "var(--text-muted)",
                      backgroundColor: "var(--bg-card)",
                    }}
                    onClick={handle_close}
                  >
                    Close
                  </button>
                  <kbd
                    className="hidden sm:inline-block px-1.5 py-0.5 border rounded"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-secondary)",
                    }}
                  >
                    ESC
                  </kbd>
                </div>
              </div>
            </ErrorBoundary>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
