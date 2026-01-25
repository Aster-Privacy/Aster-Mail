import type {
  InboxEmail,
  DecryptedEnvelope,
  MailItemType,
} from "@/types/email";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { strip_html_tags } from "@/lib/html_sanitizer";
import { get_email_username } from "@/lib/utils";
import { use_auth } from "@/contexts/auth_context";
import {
  encrypted_search,
  clear_search_cache,
  build_global_search_index,
  is_global_index_ready,
  type SearchFilters,
  type SearchResult,
} from "@/services/api/search";
import {
  list_mail_items,
  type MailItem,
  type MailItemFolder,
} from "@/services/api/mail";
import {
  get_passphrase_bytes,
  has_passphrase_in_memory,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import {
  decrypt_envelope_with_bytes,
  base64_to_array,
} from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  secure_store,
  secure_retrieve,
} from "@/services/crypto/secure_storage";
import {
  get_search_worker,
  search_with_worker,
  autocomplete_with_worker,
  fuzzy_search_with_worker,
  type WorkerSearchResult,
  type IndexStats,
} from "@/services/crypto/search_worker_client";
import {
  parse_search_query,
  operators_to_filters,
  create_active_filters,
  remove_operator_from_query,
  get_quick_filters,
  parse_operator_date,
  expand_date_shortcut,
  is_valid_date_shortcut,
  type ParsedSearchQuery,
  type ParsedOperator,
  type ActiveFilter,
  type SortOption,
  type SearchScope,
} from "@/utils/search_operators";
import {
  type SearchHistoryEntry,
  type SavedSearch,
  get_search_history,
  add_to_history,
  remove_from_history,
  clear_search_history,
  get_saved_searches,
  save_search as save_search_to_storage,
  delete_saved_search as delete_saved_search_from_storage,
  update_saved_search_usage,
  clear_search_data,
  type ClearSearchDataOptions,
} from "@/services/search";

const DEBOUNCE_MS = 300;
const AUTOCOMPLETE_DEBOUNCE_MS = 100;
const RESULTS_PER_PAGE = 20;
const MAX_CACHED_RESULTS = 500;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_AUTOCOMPLETE_SUGGESTIONS = 8;

type SearchField = "subject" | "body" | "sender" | "recipient" | "all";

export interface SearchResultItem extends InboxEmail {
  match_score: number;
  matched_fields: SearchField[];
  highlight_ranges?: HighlightRange[];
}

export interface HighlightRange {
  field: string;
  start: number;
  end: number;
}

export interface SearchProgress {
  phase: "idle" | "indexing" | "searching" | "decrypting" | "loading_more";
  current: number;
  total: number;
  estimated_time_remaining_ms?: number;
}

export interface SearchState {
  query: string;
  results: SearchResultItem[];
  is_loading: boolean;
  is_searching: boolean;
  is_loading_more: boolean;
  error: string | null;
  total_results: number;
  displayed_results: number;
  has_more: boolean;
  cached: boolean;
  search_time_ms: number;
  worker_ready: boolean;
  progress: SearchProgress;
  index_building: boolean;
  index_progress: number;
}

export interface AdvancedSearchState {
  raw_query: string;
  text_query: string;
  parsed_operators: ParsedOperator[];
  active_filters: ActiveFilter[];
  sort_option: SortOption;
  search_scope: SearchScope;
  results: SearchResultItem[];
  is_loading: boolean;
  is_searching: boolean;
  error: string | null;
  total_results: number;
  has_more: boolean;
  cached: boolean;
  search_time_ms: number;
  worker_ready: boolean;
  result_folders: Map<string, number>;
}

export interface SearchOptions {
  fields?: SearchField[];
  filters?: SearchFilters;
  limit?: number;
  use_fuzzy?: boolean;
  fuzzy_distance?: number;
  use_worker?: boolean;
}

export interface AutocompleteSuggestion {
  text: string;
  type: "recent" | "term" | "sender" | "subject";
  highlight_ranges?: Array<{ start: number; end: number }>;
}

export interface AutocompleteState {
  suggestions: AutocompleteSuggestion[];
  is_loading: boolean;
  selected_index: number;
}

interface UseSearchReturn {
  state: SearchState;
  autocomplete_state: AutocompleteState;
  search: (query: string, options?: SearchOptions) => Promise<void>;
  instant_search: (query: string, options?: SearchOptions) => Promise<void>;
  clear_results: () => void;
  load_more: () => Promise<void>;
  set_query: (query: string) => void;
  get_autocomplete: (prefix: string, field?: SearchField) => Promise<void>;
  select_autocomplete: (index: number) => void;
  clear_autocomplete: () => void;
  navigate_to_result: (mail_id: string) => void;
  get_worker_stats: () => Promise<IndexStats | null>;
  prefetch_results: (query: string) => void;
  cancel_search: () => void;
}

const initial_state: SearchState = {
  query: "",
  results: [],
  is_loading: false,
  is_searching: false,
  is_loading_more: false,
  error: null,
  total_results: 0,
  displayed_results: 0,
  has_more: false,
  cached: false,
  search_time_ms: 0,
  worker_ready: false,
  progress: {
    phase: "idle",
    current: 0,
    total: 0,
  },
  index_building: false,
  index_progress: 0,
};

const initial_autocomplete_state: AutocompleteState = {
  suggestions: [],
  is_loading: false,
  selected_index: -1,
};

interface ResultCache {
  results: SearchResultItem[];
  total: number;
  timestamp: number;
  expires_at: number;
}

const result_cache = new Map<string, ResultCache>();
const prefetch_queue = new Set<string>();

function get_cache_key(query: string, options: SearchOptions): string {
  return `${query}:${JSON.stringify(options)}`;
}

function is_cache_valid(cache: ResultCache): boolean {
  return Date.now() < cache.expires_at;
}

function cleanup_result_cache(): void {
  const now = Date.now();

  for (const [key, cache] of result_cache.entries()) {
    if (now >= cache.expires_at) {
      result_cache.delete(key);
    }
  }

  if (result_cache.size <= MAX_CACHED_RESULTS) return;

  const entries = Array.from(result_cache.entries());

  entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

  const to_remove = entries.slice(0, entries.length - MAX_CACHED_RESULTS);

  for (const [key] of to_remove) {
    result_cache.delete(key);
  }
}

function set_cache(
  key: string,
  results: SearchResultItem[],
  total: number,
): void {
  result_cache.set(key, {
    results,
    total,
    timestamp: Date.now(),
    expires_at: Date.now() + CACHE_TTL_MS,
  });
  cleanup_result_cache();
}

async function try_decrypt_with_vault(
  encrypted: string,
  nonce_bytes: Uint8Array,
): Promise<DecryptedEnvelope | null> {
  const vault = get_vault_from_memory();

  if (!vault?.identity_key) {
    return null;
  }

  try {
    const key_hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(vault.identity_key + "astermail-envelope-v1"),
    );
    const crypto_key = await crypto.subtle.importKey(
      "raw",
      key_hash,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(nonce_bytes) },
      crypto_key,
      new Uint8Array(base64_to_array(encrypted)),
    );

    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    return null;
  }
}

async function decrypt_mail_envelope(
  encrypted_envelope: string,
  envelope_nonce: string,
): Promise<DecryptedEnvelope | null> {
  if (!encrypted_envelope) {
    return null;
  }

  const nonce_bytes = envelope_nonce
    ? base64_to_array(envelope_nonce)
    : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted_envelope);
      const json = new TextDecoder().decode(encrypted_bytes);

      return JSON.parse(json) as DecryptedEnvelope;
    } catch {
      return null;
    }
  }

  const is_version_1 = nonce_bytes.length === 1 && nonce_bytes[0] === 1;

  if (is_version_1) {
    const passphrase_bytes = get_passphrase_bytes();

    if (!passphrase_bytes) {
      return null;
    }

    try {
      const result = await decrypt_envelope_with_bytes<DecryptedEnvelope>(
        encrypted_envelope,
        passphrase_bytes,
      );

      zero_uint8_array(passphrase_bytes);

      return result;
    } catch {
      zero_uint8_array(passphrase_bytes);

      return null;
    }
  }

  return try_decrypt_with_vault(encrypted_envelope, nonce_bytes);
}

function format_timestamp(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const hours_ago = diff / 3600000;

  if (hours_ago < 1) {
    const minutes = Math.floor(diff / 60000);

    return minutes <= 1 ? "Just now" : `${minutes}m ago`;
  }

  if (hours_ago < 24) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (hours_ago < 168) {
    return date.toLocaleDateString([], { weekday: "short" });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function extract_quoted_phrases(query: string): string[] {
  const phrases: string[] = [];
  const regex = /"([^"]+)"/g;
  let match;

  while ((match = regex.exec(query)) !== null) {
    phrases.push(match[1].toLowerCase());
  }

  return phrases;
}

function matches_exact_phrases(
  result: SearchResultItem,
  phrases: string[],
): boolean {
  if (phrases.length === 0) return true;

  const searchable_text = [
    result.subject || "",
    result.preview || "",
    result.sender_name || "",
    result.sender_email || "",
  ]
    .join(" ")
    .toLowerCase();

  return phrases.every((phrase) => searchable_text.includes(phrase));
}

function filter_by_search_operators(
  results: SearchResultItem[],
  operators: ParsedOperator[],
): SearchResultItem[] {
  if (operators.length === 0) return results;

  return results.filter((result) => {
    for (const op of operators) {
      const matches = check_operator_match(result, op);

      if (op.negated) {
        if (matches) return false;
      } else {
        if (!matches) return false;
      }
    }

    return true;
  });
}

function check_operator_match(
  result: SearchResultItem,
  op: ParsedOperator,
): boolean {
  switch (op.type) {
    case "from":
      return (
        result.sender_email?.toLowerCase().includes(op.value.toLowerCase()) ||
        result.sender_name?.toLowerCase().includes(op.value.toLowerCase()) ||
        false
      );

    case "subject":
      return (
        result.subject?.toLowerCase().includes(op.value.toLowerCase()) || false
      );

    case "has": {
      const has_value = op.value.toLowerCase();

      if (["attachment", "attachments"].includes(has_value)) {
        return result.has_attachment || false;
      }

      return result.has_attachment || false;
    }

    case "is":
      switch (op.value.toLowerCase()) {
        case "unread":
          return !result.is_read;
        case "read":
          return result.is_read || false;
        case "starred":
          return result.is_starred || false;
        case "unstarred":
          return !result.is_starred;
        default:
          return true;
      }

    case "in": {
      const folder = op.value.toLowerCase();

      switch (folder) {
        case "inbox":
          return result.item_type === "received";
        case "sent":
          return result.item_type === "sent";
        case "trash":
          return result.is_trashed || false;
        case "drafts":
          return result.item_type === "draft";
        case "spam":
          return result.is_spam || false;
        case "archive":
          return result.is_archived || false;
        case "all":
          return true;
        default:
          return true;
      }
    }

    case "after": {
      const after_date = parse_operator_date(op.value);

      if (!after_date) return true;

      const result_date = new Date(result.timestamp);

      if (isNaN(result_date.getTime())) return true;

      return result_date >= after_date;
    }

    case "before": {
      const before_date = parse_operator_date(op.value);

      if (!before_date) return true;

      const result_date = new Date(result.timestamp);

      if (isNaN(result_date.getTime())) return true;

      return result_date <= before_date;
    }

    case "date": {
      if (is_valid_date_shortcut(op.value)) {
        const range = expand_date_shortcut(op.value);

        if (!range) return true;

        const result_date = new Date(result.timestamp);

        if (isNaN(result_date.getTime())) return true;

        const from_date = new Date(range.date_from);
        const to_date = new Date(range.date_to);

        to_date.setHours(23, 59, 59, 999);

        return result_date >= from_date && result_date <= to_date;
      }

      const exact_date = parse_operator_date(op.value);

      if (!exact_date) return true;

      const result_date = new Date(result.timestamp);

      if (isNaN(result_date.getTime())) return true;

      const day_start = new Date(exact_date);

      day_start.setHours(0, 0, 0, 0);

      const day_end = new Date(exact_date);

      day_end.setHours(23, 59, 59, 999);

      return result_date >= day_start && result_date <= day_end;
    }

    default:
      return true;
  }
}

export interface TextHighlight {
  text: string;
  is_match: boolean;
}

export function compute_highlight_ranges(
  text: string,
  query_terms: string[],
): HighlightRange[] {
  if (!text || query_terms.length === 0) return [];

  const ranges: HighlightRange[] = [];
  const text_lower = text.toLowerCase();

  for (const term of query_terms) {
    if (!term.trim()) continue;

    const term_lower = term.toLowerCase();
    let index = 0;

    while ((index = text_lower.indexOf(term_lower, index)) !== -1) {
      ranges.push({
        field: "text",
        start: index,
        end: index + term.length,
      });
      index += term.length;
    }
  }

  return merge_overlapping_ranges(ranges);
}

function merge_overlapping_ranges(ranges: HighlightRange[]): HighlightRange[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: HighlightRange[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

export function apply_highlights(
  text: string,
  ranges: HighlightRange[],
): TextHighlight[] {
  if (!text || ranges.length === 0) {
    return [{ text, is_match: false }];
  }

  const sorted_ranges = [...ranges].sort((a, b) => a.start - b.start);
  const result: TextHighlight[] = [];
  let last_end = 0;

  for (const range of sorted_ranges) {
    if (range.start > last_end) {
      result.push({
        text: text.slice(last_end, range.start),
        is_match: false,
      });
    }

    result.push({
      text: text.slice(range.start, range.end),
      is_match: true,
    });

    last_end = range.end;
  }

  if (last_end < text.length) {
    result.push({
      text: text.slice(last_end),
      is_match: false,
    });
  }

  return result;
}

export function extract_query_terms(query: string): string[] {
  const parsed = parse_search_query(query);
  const terms: string[] = [];

  if (parsed.text_query) {
    const quoted_regex = /"([^"]+)"/g;
    let match;

    while ((match = quoted_regex.exec(parsed.text_query)) !== null) {
      terms.push(match[1]);
    }

    const without_quotes = parsed.text_query.replace(/"[^"]+"/g, "").trim();

    if (without_quotes) {
      terms.push(...without_quotes.split(/\s+/).filter((t) => t.length >= 2));
    }
  }

  for (const op of parsed.operators) {
    if (["from", "to", "subject"].includes(op.type) && !op.negated) {
      terms.push(op.value);
    }
  }

  return [...new Set(terms)];
}

function mail_item_to_search_result(
  item: MailItem,
  envelope: DecryptedEnvelope | null,
  score: number = 0,
  matched_fields: SearchField[] = [],
): SearchResultItem {
  const folders = item.folders?.map((f: MailItemFolder) => ({
    folder_token: f.token,
    name: f.name,
    color: f.color,
  }));

  if (!envelope) {
    return {
      id: item.id,
      item_type: item.item_type as MailItemType,
      sender_name: "Encrypted",
      sender_email: "",
      subject: "Encrypted message",
      preview: "Unable to decrypt message preview",
      timestamp: format_timestamp(new Date(item.created_at)),
      is_pinned: false,
      is_starred: item.is_starred ?? false,
      is_selected: false,
      is_read: item.is_read ?? false,
      is_trashed: item.is_trashed ?? false,
      is_archived: item.is_archived ?? false,
      is_spam: item.is_spam ?? false,
      has_attachment: item.has_attachments ?? false,
      category: "",
      category_color: "",
      avatar_url: "",
      is_encrypted: true,
      match_score: score,
      matched_fields,
      folders,
    };
  }

  return {
    id: item.id,
    item_type: item.item_type as MailItemType,
    sender_name: envelope.from.name || get_email_username(envelope.from.email),
    sender_email: envelope.from.email,
    subject: envelope.subject || "(No subject)",
    preview: strip_html_tags(envelope.body_text).substring(0, 200),
    timestamp: format_timestamp(new Date(envelope.sent_at || item.created_at)),
    is_pinned: false,
    is_starred: item.is_starred ?? false,
    is_selected: false,
    is_read: item.is_read ?? false,
    is_trashed: item.is_trashed ?? false,
    is_archived: item.is_archived ?? false,
    is_spam: item.is_spam ?? false,
    has_attachment: item.has_attachments ?? false,
    category: "Personal",
    category_color:
      "bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-500",
    avatar_url: "",
    is_encrypted: false,
    match_score: score,
    matched_fields,
    folders,
  };
}

export function use_search(): UseSearchReturn {
  const navigate = useNavigate();
  const { user } = use_auth();
  const [state, set_state] = useState<SearchState>(initial_state);
  const [autocomplete_state, set_autocomplete_state] =
    useState<AutocompleteState>(initial_autocomplete_state);
  const [current_options, set_current_options] = useState<SearchOptions>({});

  const debounce_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autocomplete_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const abort_controller_ref = useRef<AbortController | null>(null);
  const offset_ref = useRef(0);
  const search_start_time_ref = useRef(0);
  const is_mounted_ref = useRef(true);
  const prev_user_id_ref = useRef<string | null>(null);

  useEffect(() => {
    is_mounted_ref.current = true;

    return () => {
      is_mounted_ref.current = false;
    };
  }, []);

  useEffect(() => {
    const current_user_id = user?.id || null;
    const prev_user_id = prev_user_id_ref.current;

    if (prev_user_id !== null && prev_user_id !== current_user_id) {
      result_cache.clear();
      set_state(initial_state);
      set_autocomplete_state(initial_autocomplete_state);
    }

    prev_user_id_ref.current = current_user_id;
  }, [user?.id]);

  useEffect(() => {
    const worker = get_search_worker();
    const unsubscribe_ready = worker.on_ready(() => {
      if (is_mounted_ref.current) {
        set_state((prev) => ({ ...prev, worker_ready: true }));
      }
    });

    const unsubscribe_error = worker.on_error(() => {
      if (is_mounted_ref.current) {
        set_state((prev) => ({ ...prev, worker_ready: false }));
      }
    });

    if (worker.is_ready()) {
      set_state((prev) => ({ ...prev, worker_ready: true }));
    }

    return () => {
      unsubscribe_ready();
      unsubscribe_error();
    };
  }, []);

  const perform_search = useCallback(
    async (
      query: string,
      options: SearchOptions,
      append: boolean = false,
    ): Promise<void> => {
      if (!has_passphrase_in_memory()) {
        if (is_mounted_ref.current) {
          set_state((prev) => ({
            ...prev,
            error: "Session expired. Please log in again.",
            is_loading: false,
            is_searching: false,
            is_loading_more: false,
          }));
        }

        return;
      }

      abort_controller_ref.current?.abort();
      abort_controller_ref.current = new AbortController();
      search_start_time_ref.current = performance.now();

      if (!is_global_index_ready()) {
        if (is_mounted_ref.current) {
          set_state((prev) => ({
            ...prev,
            index_building: true,
            progress: { phase: "indexing", current: 0, total: 100 },
          }));
        }
        await build_global_search_index();
        if (is_mounted_ref.current) {
          set_state((prev) => ({
            ...prev,
            index_building: false,
            index_progress: 100,
          }));
        }
      }

      const current_offset = append ? offset_ref.current : 0;
      const limit = options.limit || RESULTS_PER_PAGE;
      const cache_key = get_cache_key(query, { ...options, limit: undefined });

      if (!append) {
        const cached = result_cache.get(cache_key);

        if (cached && is_cache_valid(cached)) {
          const paginated = cached.results.slice(
            current_offset,
            current_offset + limit,
          );
          const search_time = performance.now() - search_start_time_ref.current;

          if (is_mounted_ref.current) {
            set_state((prev) => ({
              ...prev,
              results: paginated,
              is_searching: false,
              is_loading: false,
              is_loading_more: false,
              total_results: cached.total,
              displayed_results: paginated.length,
              has_more: current_offset + limit < cached.total,
              cached: true,
              search_time_ms: search_time,
              progress: { phase: "idle", current: 0, total: 0 },
            }));

            offset_ref.current = current_offset + paginated.length;
          }

          return;
        }
      }

      if (is_mounted_ref.current) {
        set_state((prev) => ({
          ...prev,
          is_searching: !append,
          is_loading_more: append,
          error: null,
          progress: {
            phase: append ? "loading_more" : "searching",
            current: 0,
            total: 0,
          },
        }));
      }

      try {
        let mail_ids: string[];
        let total: number;
        let is_cached: boolean;
        let worker_results: WorkerSearchResult[] | null = null;

        const parsed_query = parse_search_query(query);
        const has_operators = parsed_query.operators.length > 0;
        const search_text = parsed_query.text_query.replace(/"/g, "").trim();

        if (!search_text && has_operators) {
          const all_mail_response = await list_mail_items({ limit: 200 });

          if (all_mail_response.data?.items) {
            mail_ids = all_mail_response.data.items.map((item) => item.id);
            total = mail_ids.length;
            is_cached = false;
          } else {
            mail_ids = [];
            total = 0;
            is_cached = false;
          }
        } else {
          const search_result: SearchResult = await encrypted_search(
            search_text || query,
            {
              fields: options.fields,
              filters: options.filters,
              limit: 200,
              offset: 0,
              use_worker: options.use_worker !== false,
            },
          );

          mail_ids = search_result.mail_ids;
          total = search_result.total;
          is_cached = search_result.cached;

          if (options.use_fuzzy && mail_ids.length === 0 && search_text) {
            const fuzzy_results = await fuzzy_search_with_worker(search_text, {
              fields: options.fields,
              max_distance: options.fuzzy_distance,
              limit: 200,
            });

            if (fuzzy_results.length > 0) {
              worker_results = fuzzy_results;
              mail_ids = fuzzy_results.map((r) => r.message_id);
              total = fuzzy_results.length;
              is_cached = false;
            }
          }
        }

        if (abort_controller_ref.current?.signal.aborted) {
          return;
        }

        if (mail_ids.length === 0) {
          const search_time = performance.now() - search_start_time_ref.current;

          if (is_mounted_ref.current) {
            set_state((prev) => ({
              ...prev,
              results: append ? prev.results : [],
              is_searching: false,
              is_loading: false,
              is_loading_more: false,
              total_results: 0,
              displayed_results: append ? prev.displayed_results : 0,
              has_more: false,
              cached: is_cached,
              search_time_ms: search_time,
              progress: { phase: "idle", current: 0, total: 0 },
            }));
          }

          return;
        }

        const page_mail_ids = mail_ids.slice(
          current_offset,
          current_offset + limit,
        );

        const mail_response = await list_mail_items({
          ids: page_mail_ids,
          limit: page_mail_ids.length,
        });

        if (abort_controller_ref.current?.signal.aborted) {
          return;
        }

        if (!mail_response.data) {
          if (is_mounted_ref.current) {
            set_state((prev) => ({
              ...prev,
              error: "Failed to load search results",
              is_searching: false,
              is_loading: false,
              is_loading_more: false,
              progress: { phase: "idle", current: 0, total: 0 },
            }));
          }

          return;
        }

        const mail_items = mail_response.data.items;
        const mail_map = new Map(mail_items.map((item) => [item.id, item]));
        const results: SearchResultItem[] = [];

        const worker_result_map = new Map(
          worker_results?.map((r) => [r.message_id, r]) || [],
        );

        const decrypt_promises = page_mail_ids.map(async (mail_id) => {
          const item = mail_map.get(mail_id);

          if (!item) return null;

          if (abort_controller_ref.current?.signal.aborted) {
            return null;
          }

          const envelope = await decrypt_mail_envelope(
            item.encrypted_envelope,
            item.envelope_nonce,
          );

          const worker_result = worker_result_map.get(mail_id);

          return mail_item_to_search_result(
            item,
            envelope,
            worker_result?.score || 0,
            worker_result?.matched_fields || [],
          );
        });

        const decrypted_results = await Promise.all(decrypt_promises);

        for (const result of decrypted_results) {
          if (result) {
            results.push(result);
          }
        }

        if (abort_controller_ref.current?.signal.aborted) {
          return;
        }

        const quoted_phrases = extract_quoted_phrases(query);

        let filtered_results = filter_by_search_operators(
          results,
          parsed_query.operators,
        );

        filtered_results = filtered_results.filter((r) =>
          matches_exact_phrases(r, quoted_phrases),
        );

        if (worker_results) {
          filtered_results.sort((a, b) => b.match_score - a.match_score);
        }

        if (!append && mail_ids.length <= 100) {
          const all_mail_response = await list_mail_items({
            ids: mail_ids,
            limit: mail_ids.length,
          });

          if (all_mail_response.data) {
            const all_mail_map = new Map(
              all_mail_response.data.items.map((item) => [item.id, item]),
            );

            const all_results: SearchResultItem[] = [];

            for (const mail_id of mail_ids) {
              const item = all_mail_map.get(mail_id);

              if (!item) continue;

              const envelope = await decrypt_mail_envelope(
                item.encrypted_envelope,
                item.envelope_nonce,
              );

              const worker_result = worker_result_map.get(mail_id);

              all_results.push(
                mail_item_to_search_result(
                  item,
                  envelope,
                  worker_result?.score || 0,
                  worker_result?.matched_fields || [],
                ),
              );
            }

            if (worker_results) {
              all_results.sort((a, b) => b.match_score - a.match_score);
            }

            set_cache(cache_key, all_results, total);
          }
        }

        offset_ref.current = current_offset + filtered_results.length;
        const search_time = performance.now() - search_start_time_ref.current;

        if (is_mounted_ref.current) {
          set_state((prev) => {
            const new_results = append
              ? [...prev.results, ...filtered_results]
              : filtered_results;

            return {
              ...prev,
              results: new_results,
              is_searching: false,
              is_loading: false,
              is_loading_more: false,
              total_results: total,
              displayed_results: new_results.length,
              has_more: offset_ref.current < total,
              cached: is_cached,
              search_time_ms: search_time,
              progress: { phase: "idle", current: 0, total: 0 },
            };
          });
        }
      } catch (error) {
        if (abort_controller_ref.current?.signal.aborted) {
          return;
        }

        if (is_mounted_ref.current) {
          set_state((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : "Search failed",
            is_searching: false,
            is_loading: false,
            is_loading_more: false,
            progress: { phase: "idle", current: 0, total: 0 },
          }));
        }
      }
    },
    [],
  );

  const search = useCallback(
    async (query: string, options: SearchOptions = {}): Promise<void> => {
      if (debounce_timer_ref.current) {
        clearTimeout(debounce_timer_ref.current);
      }

      abort_controller_ref.current?.abort();

      set_state((prev) => ({
        ...prev,
        query,
        is_loading: true,
        progress: { phase: "searching", current: 0, total: 0 },
      }));

      set_current_options(options);
      offset_ref.current = 0;

      if (!query.trim()) {
        set_state((prev) => ({
          ...prev,
          results: [],
          is_loading: false,
          is_searching: false,
          is_loading_more: false,
          total_results: 0,
          displayed_results: 0,
          has_more: false,
          progress: { phase: "idle", current: 0, total: 0 },
        }));

        return;
      }

      debounce_timer_ref.current = setTimeout(() => {
        perform_search(query, options);
      }, DEBOUNCE_MS);
    },
    [perform_search],
  );

  const instant_search = useCallback(
    async (query: string, options: SearchOptions = {}): Promise<void> => {
      if (debounce_timer_ref.current) {
        clearTimeout(debounce_timer_ref.current);
      }

      abort_controller_ref.current?.abort();

      set_state((prev) => ({
        ...prev,
        query,
        is_loading: true,
        progress: { phase: "searching", current: 0, total: 0 },
      }));

      set_current_options(options);
      offset_ref.current = 0;

      if (!query.trim()) {
        set_state((prev) => ({
          ...prev,
          results: [],
          is_loading: false,
          is_searching: false,
          is_loading_more: false,
          total_results: 0,
          displayed_results: 0,
          has_more: false,
          progress: { phase: "idle", current: 0, total: 0 },
        }));

        return;
      }

      await perform_search(query, options);
    },
    [perform_search],
  );

  const get_autocomplete = useCallback(
    async (prefix: string, field: SearchField = "all"): Promise<void> => {
      if (autocomplete_timer_ref.current) {
        clearTimeout(autocomplete_timer_ref.current);
      }

      if (!prefix.trim() || prefix.length < 2) {
        set_autocomplete_state(initial_autocomplete_state);

        return;
      }

      set_autocomplete_state((prev) => ({
        ...prev,
        is_loading: true,
      }));

      autocomplete_timer_ref.current = setTimeout(async () => {
        try {
          const prefix_lower = prefix.toLowerCase();

          const worker_suggestions = await autocomplete_with_worker(
            prefix,
            field,
            MAX_AUTOCOMPLETE_SUGGESTIONS,
          );

          const term_suggestions: AutocompleteSuggestion[] =
            worker_suggestions.map((s): AutocompleteSuggestion => {
              const idx = s.toLowerCase().indexOf(prefix_lower);

              return {
                text: s,
                type: field === "sender" ? "sender" : "term",
                highlight_ranges:
                  idx >= 0 ? [{ start: idx, end: idx + prefix.length }] : [],
              };
            });

          if (is_mounted_ref.current) {
            set_autocomplete_state({
              suggestions: term_suggestions,
              is_loading: false,
              selected_index: -1,
            });
          }
        } catch {
          if (is_mounted_ref.current) {
            set_autocomplete_state((prev) => ({
              ...prev,
              is_loading: false,
            }));
          }
        }
      }, AUTOCOMPLETE_DEBOUNCE_MS);
    },
    [],
  );

  const select_autocomplete = useCallback((index: number) => {
    set_autocomplete_state((prev) => ({
      ...prev,
      selected_index: Math.max(
        -1,
        Math.min(index, prev.suggestions.length - 1),
      ),
    }));
  }, []);

  const clear_autocomplete = useCallback(() => {
    if (autocomplete_timer_ref.current) {
      clearTimeout(autocomplete_timer_ref.current);
    }

    set_autocomplete_state(initial_autocomplete_state);
  }, []);

  const set_query = useCallback((query: string) => {
    set_state((prev) => ({ ...prev, query }));
  }, []);

  const clear_results = useCallback(() => {
    if (debounce_timer_ref.current) {
      clearTimeout(debounce_timer_ref.current);
    }

    if (autocomplete_timer_ref.current) {
      clearTimeout(autocomplete_timer_ref.current);
    }

    abort_controller_ref.current?.abort();
    offset_ref.current = 0;

    set_state(initial_state);
    set_autocomplete_state(initial_autocomplete_state);
  }, []);

  const cancel_search = useCallback(() => {
    abort_controller_ref.current?.abort();

    if (debounce_timer_ref.current) {
      clearTimeout(debounce_timer_ref.current);
    }

    set_state((prev) => ({
      ...prev,
      is_loading: false,
      is_searching: false,
      is_loading_more: false,
      progress: { phase: "idle", current: 0, total: 0 },
    }));
  }, []);

  const load_more = useCallback(async (): Promise<void> => {
    if (
      state.is_searching ||
      state.is_loading_more ||
      !state.has_more ||
      !state.query
    ) {
      return;
    }

    set_state((prev) => ({
      ...prev,
      is_loading_more: true,
      progress: {
        phase: "loading_more",
        current: prev.displayed_results,
        total: prev.total_results,
      },
    }));

    await perform_search(state.query, current_options, true);
  }, [
    state.is_searching,
    state.is_loading_more,
    state.has_more,
    state.query,
    current_options,
    perform_search,
  ]);

  const navigate_to_result = useCallback(
    (mail_id: string) => {
      const result = state.results.find((r) => r.id === mail_id);
      let from_view = "inbox";

      if (result) {
        if (result.is_trashed) {
          from_view = "trash";
        } else if (result.is_archived) {
          from_view = "archive";
        } else if (result.is_spam) {
          from_view = "spam";
        } else if (result.item_type === "sent") {
          from_view = "sent";
        } else if (result.item_type === "draft") {
          from_view = "drafts";
        } else if (result.item_type === "scheduled") {
          from_view = "scheduled";
        } else if (result.is_starred) {
          from_view = "starred";
        }
      }

      navigate(`/email/${mail_id}`, { state: { from_view } });
    },
    [navigate, state.results],
  );

  const get_worker_stats = useCallback(async (): Promise<IndexStats | null> => {
    try {
      return await get_search_worker().get_stats();
    } catch {
      return null;
    }
  }, []);

  const prefetch_results = useCallback((query: string) => {
    if (!query.trim() || prefetch_queue.has(query)) return;

    prefetch_queue.add(query);

    setTimeout(async () => {
      try {
        const search_result = await search_with_worker(query, {
          fields: ["all"],
          limit: 50,
        });

        if (search_result.results.length > 0) {
          const mail_ids = search_result.results.map((r) => r.message_id);
          const mail_response = await list_mail_items({
            ids: mail_ids,
            limit: mail_ids.length,
          });

          if (mail_response.data) {
            const mail_map = new Map(
              mail_response.data.items.map((item) => [item.id, item]),
            );

            const worker_result_map = new Map(
              search_result.results.map((r) => [r.message_id, r]),
            );

            const results: SearchResultItem[] = [];

            for (const mail_id of mail_ids) {
              const item = mail_map.get(mail_id);

              if (!item) continue;

              const envelope = await decrypt_mail_envelope(
                item.encrypted_envelope,
                item.envelope_nonce,
              );

              const worker_result = worker_result_map.get(mail_id);

              results.push(
                mail_item_to_search_result(
                  item,
                  envelope,
                  worker_result?.score || 0,
                  worker_result?.matched_fields || [],
                ),
              );
            }

            results.sort((a, b) => b.match_score - a.match_score);

            const cache_key = get_cache_key(query, { fields: ["all"] });

            set_cache(cache_key, results, search_result.total);
          }
        }
      } catch {
        return;
      }

      prefetch_queue.delete(query);
    }, 100);
  }, []);

  useEffect(() => {
    return () => {
      if (debounce_timer_ref.current) {
        clearTimeout(debounce_timer_ref.current);
      }

      if (autocomplete_timer_ref.current) {
        clearTimeout(autocomplete_timer_ref.current);
      }

      abort_controller_ref.current?.abort();
    };
  }, []);

  return {
    state,
    autocomplete_state,
    search,
    instant_search,
    clear_results,
    load_more,
    set_query,
    get_autocomplete,
    select_autocomplete,
    clear_autocomplete,
    navigate_to_result,
    get_worker_stats,
    prefetch_results,
    cancel_search,
  };
}

export function use_search_suggestions(
  query: string,
  field: SearchField = "all",
): { suggestions: string[]; is_loading: boolean } {
  const [suggestions, set_suggestions] = useState<string[]>([]);
  const [is_loading, set_is_loading] = useState(false);
  const timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer_ref.current) {
      clearTimeout(timer_ref.current);
    }

    if (!query.trim() || query.length < 2) {
      set_suggestions([]);

      return;
    }

    set_is_loading(true);

    timer_ref.current = setTimeout(async () => {
      try {
        const result = await autocomplete_with_worker(query, field, 8);

        set_suggestions(result);
      } catch {
        set_suggestions([]);
      }

      set_is_loading(false);
    }, AUTOCOMPLETE_DEBOUNCE_MS);

    return () => {
      if (timer_ref.current) {
        clearTimeout(timer_ref.current);
      }
    };
  }, [query, field]);

  return { suggestions, is_loading };
}

export function use_autocomplete() {
  const [suggestions, set_suggestions] = useState<string[]>([]);
  const [is_loading, set_is_loading] = useState(false);
  const debounce_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  const get_suggestions = useCallback(
    async (prefix: string, field: SearchField = "all", limit: number = 10) => {
      if (debounce_ref.current) {
        clearTimeout(debounce_ref.current);
      }

      if (!prefix || prefix.length < 2) {
        set_suggestions([]);

        return;
      }

      set_is_loading(true);

      debounce_ref.current = setTimeout(async () => {
        try {
          const results = await autocomplete_with_worker(prefix, field, limit);

          set_suggestions(results);
        } catch {
          set_suggestions([]);
        } finally {
          set_is_loading(false);
        }
      }, AUTOCOMPLETE_DEBOUNCE_MS);
    },
    [],
  );

  const clear_suggestions = useCallback(() => {
    if (debounce_ref.current) {
      clearTimeout(debounce_ref.current);
    }

    set_suggestions([]);
  }, []);

  useEffect(() => {
    return () => {
      if (debounce_ref.current) {
        clearTimeout(debounce_ref.current);
      }
    };
  }, []);

  return {
    suggestions,
    is_loading,
    get_suggestions,
    clear_suggestions,
  };
}

export function use_fuzzy_search() {
  const [results, set_results] = useState<WorkerSearchResult[]>([]);
  const [is_loading, set_is_loading] = useState(false);

  const search = useCallback(
    async (
      query: string,
      options?: {
        fields?: SearchField[];
        max_distance?: number;
        limit?: number;
      },
    ) => {
      if (!query.trim()) {
        set_results([]);

        return;
      }

      set_is_loading(true);

      try {
        const search_results = await fuzzy_search_with_worker(query, options);

        set_results(search_results);
      } catch {
        set_results([]);
      } finally {
        set_is_loading(false);
      }
    },
    [],
  );

  const clear_results = useCallback(() => {
    set_results([]);
  }, []);

  return {
    results,
    is_loading,
    search,
    clear_results,
  };
}

export function clear_search_result_cache(): void {
  result_cache.clear();
}

const SORT_PREFERENCE_KEY = "astermail_search_sort_preference";

const initial_advanced_state: AdvancedSearchState = {
  raw_query: "",
  text_query: "",
  parsed_operators: [],
  active_filters: [],
  sort_option: "relevance",
  search_scope: { type: "all" },
  results: [],
  is_loading: false,
  is_searching: false,
  error: null,
  total_results: 0,
  has_more: false,
  cached: false,
  search_time_ms: 0,
  worker_ready: false,
  result_folders: new Map(),
};

interface UseAdvancedSearchReturn {
  state: AdvancedSearchState;
  search: (query: string) => Promise<void>;
  clear_results: () => void;
  remove_filter: (filter_id: string) => void;
  add_quick_filter: (operator: string) => void;
  set_sort_option: (option: SortOption) => void;
  set_search_scope: (scope: SearchScope) => void;
  set_raw_query: (query: string) => void;
  get_parsed_query: () => ParsedSearchQuery;
  quick_filters: Array<{ id: string; label: string; operator: string }>;
  navigate_to_result: (mail_id: string) => void;
  load_more: () => Promise<void>;
}

export function use_advanced_search(): UseAdvancedSearchReturn {
  const { user } = use_auth();
  const navigate = useNavigate();
  const [state, set_state] = useState<AdvancedSearchState>(
    initial_advanced_state,
  );
  const debounce_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort_controller_ref = useRef<AbortController | null>(null);
  const search_start_time_ref = useRef(0);
  const is_mounted_ref = useRef(true);
  const offset_ref = useRef(0);

  const load_sort_preference = useCallback(async () => {
    if (!user?.id) return;

    try {
      const stored = await secure_retrieve<SortOption>(
        `${SORT_PREFERENCE_KEY}_${user.id}`,
      );

      if (stored && is_mounted_ref.current) {
        set_state((prev) => ({ ...prev, sort_option: stored }));
      }
    } catch {
      return;
    }
  }, [user?.id]);

  const save_sort_preference = useCallback(
    async (option: SortOption) => {
      if (!user?.id) return;

      try {
        await secure_store(`${SORT_PREFERENCE_KEY}_${user.id}`, option);
      } catch {
        return;
      }
    },
    [user?.id],
  );

  useEffect(() => {
    is_mounted_ref.current = true;
    load_sort_preference();

    return () => {
      is_mounted_ref.current = false;
    };
  }, [load_sort_preference]);

  useEffect(() => {
    const worker = get_search_worker();
    const unsubscribe_ready = worker.on_ready(() => {
      if (is_mounted_ref.current) {
        set_state((prev) => ({ ...prev, worker_ready: true }));
      }
    });

    const unsubscribe_error = worker.on_error(() => {
      if (is_mounted_ref.current) {
        set_state((prev) => ({ ...prev, worker_ready: false }));
      }
    });

    if (worker.is_ready()) {
      set_state((prev) => ({ ...prev, worker_ready: true }));
    }

    return () => {
      unsubscribe_ready();
      unsubscribe_error();
    };
  }, []);

  const get_parsed_query = useCallback((): ParsedSearchQuery => {
    return parse_search_query(state.raw_query);
  }, [state.raw_query]);

  const set_raw_query = useCallback((query: string) => {
    const parsed = parse_search_query(query);
    const active_filters = create_active_filters(parsed.operators);

    set_state((prev) => ({
      ...prev,
      raw_query: query,
      text_query: parsed.text_query,
      parsed_operators: parsed.operators,
      active_filters,
    }));
  }, []);

  const sort_results_fn = useCallback(
    (
      results: SearchResultItem[],
      sort_option: SortOption,
    ): SearchResultItem[] => {
      const sorted = [...results];

      switch (sort_option) {
        case "relevance":
          sorted.sort((a, b) => b.match_score - a.match_score);
          break;
        case "date_newest":
          sorted.sort((a, b) => {
            const date_a = new Date(a.timestamp).getTime() || 0;
            const date_b = new Date(b.timestamp).getTime() || 0;

            return date_b - date_a;
          });
          break;
        case "date_oldest":
          sorted.sort((a, b) => {
            const date_a = new Date(a.timestamp).getTime() || 0;
            const date_b = new Date(b.timestamp).getTime() || 0;

            return date_a - date_b;
          });
          break;
        case "sender":
          sorted.sort((a, b) =>
            (a.sender_name || "").localeCompare(b.sender_name || ""),
          );
          break;
      }

      return sorted;
    },
    [],
  );

  const filter_by_operators = useCallback(
    (
      results: SearchResultItem[],
      operators: ParsedOperator[],
    ): SearchResultItem[] => {
      if (operators.length === 0) return results;

      return results.filter((result) => {
        for (const op of operators) {
          switch (op.type) {
            case "from":
              if (
                !result.sender_email
                  ?.toLowerCase()
                  .includes(op.value.toLowerCase()) &&
                !result.sender_name
                  ?.toLowerCase()
                  .includes(op.value.toLowerCase())
              ) {
                return false;
              }
              break;

            case "subject":
              if (
                !result.subject?.toLowerCase().includes(op.value.toLowerCase())
              ) {
                return false;
              }
              break;

            case "has":
              if (
                ["attachment", "attachments"].includes(
                  op.value.toLowerCase(),
                ) &&
                !result.has_attachment
              ) {
                return false;
              }
              break;

            case "is":
              switch (op.value.toLowerCase()) {
                case "unread":
                  if (result.is_read) return false;
                  break;
                case "read":
                  if (!result.is_read) return false;
                  break;
                case "starred":
                  if (!result.is_starred) return false;
                  break;
                case "unstarred":
                  if (result.is_starred) return false;
                  break;
              }
              break;

            case "in": {
              const folder = op.value.toLowerCase();

              switch (folder) {
                case "inbox":
                  if (result.item_type !== "received") return false;
                  break;
                case "sent":
                  if (result.item_type !== "sent") return false;
                  break;
                case "trash":
                  if (!result.is_trashed) return false;
                  break;
                case "drafts":
                  if (result.item_type !== "draft") return false;
                  break;
                case "spam":
                  if (!result.is_spam) return false;
                  break;
                case "archive":
                  if (!result.is_archived) return false;
                  break;
              }
              break;
            }
          }
        }

        return true;
      });
    },
    [],
  );

  const count_result_folders = useCallback(
    (results: SearchResultItem[]): Map<string, number> => {
      const folder_counts = new Map<string, number>();

      for (const result of results) {
        let folder = "inbox";

        if (result.is_trashed) {
          folder = "trash";
        } else if (result.is_spam) {
          folder = "spam";
        } else if (result.is_archived) {
          folder = "archive";
        } else if (result.item_type === "sent") {
          folder = "sent";
        } else if (result.item_type === "draft") {
          folder = "drafts";
        }

        folder_counts.set(folder, (folder_counts.get(folder) || 0) + 1);
      }

      return folder_counts;
    },
    [],
  );

  const perform_search = useCallback(
    async (
      raw_query: string,
      text_query: string,
      parsed_operators: ParsedOperator[],
      sort_option: SortOption,
      search_scope: SearchScope,
      append: boolean = false,
    ): Promise<void> => {
      if (!text_query.trim() && parsed_operators.length === 0) {
        set_state((prev) => ({
          ...prev,
          results: [],
          total_results: 0,
          has_more: false,
          is_loading: false,
          is_searching: false,
        }));

        return;
      }

      if (!has_passphrase_in_memory()) {
        set_state((prev) => ({
          ...prev,
          error: "Session expired. Please log in again.",
          is_loading: false,
          is_searching: false,
        }));

        return;
      }

      abort_controller_ref.current?.abort();
      abort_controller_ref.current = new AbortController();
      search_start_time_ref.current = performance.now();

      if (!is_global_index_ready()) {
        await build_global_search_index();
      }

      set_state((prev) => ({
        ...prev,
        is_searching: true,
        error: null,
      }));

      try {
        const operator_filters = operators_to_filters(parsed_operators);

        const search_filters: SearchFilters = {};

        if (operator_filters.has_attachments !== undefined) {
          search_filters.has_attachments = operator_filters.has_attachments;
        }
        if (operator_filters.is_read !== undefined) {
          search_filters.is_read = operator_filters.is_read;
        }
        if (operator_filters.is_starred !== undefined) {
          search_filters.is_starred = operator_filters.is_starred;
        }
        if (operator_filters.date_from) {
          search_filters.date_from = operator_filters.date_from;
        }
        if (operator_filters.date_to) {
          search_filters.date_to = operator_filters.date_to;
        }
        if (operator_filters.folder && search_scope.type === "all") {
          search_filters.folder = operator_filters.folder;
        } else if (
          search_scope.type === "current_folder" &&
          search_scope.folder
        ) {
          search_filters.folder = search_scope.folder;
        }

        const fields: SearchField[] = [];
        const query_parts: string[] = [];

        if (text_query) {
          query_parts.push(text_query);
        }

        if (operator_filters.from) {
          fields.push("sender");
          query_parts.push(operator_filters.from);
        }
        if (operator_filters.to) {
          fields.push("recipient");
          query_parts.push(operator_filters.to);
        }
        if (operator_filters.subject) {
          fields.push("subject");
          query_parts.push(operator_filters.subject);
        }
        if (fields.length === 0) {
          fields.push("all");
        }

        const search_query =
          query_parts.length > 0 ? query_parts.join(" ") : raw_query;

        const search_result = await encrypted_search(search_query, {
          fields,
          filters:
            Object.keys(search_filters).length > 0 ? search_filters : undefined,
          limit: 200,
          offset: append ? offset_ref.current : 0,
          use_worker: true,
        });

        if (abort_controller_ref.current?.signal.aborted) {
          return;
        }

        if (search_result.mail_ids.length === 0) {
          const search_time = performance.now() - search_start_time_ref.current;

          set_state((prev) => ({
            ...prev,
            results: append ? prev.results : [],
            is_searching: false,
            is_loading: false,
            total_results: 0,
            has_more: false,
            cached: search_result.cached,
            search_time_ms: search_time,
            result_folders: new Map(),
          }));

          return;
        }

        const mail_response = await list_mail_items({
          ids: search_result.mail_ids,
          limit: search_result.mail_ids.length,
        });

        if (abort_controller_ref.current?.signal.aborted) {
          return;
        }

        if (!mail_response.data) {
          set_state((prev) => ({
            ...prev,
            error: "Failed to load search results",
            is_searching: false,
            is_loading: false,
          }));

          return;
        }

        const mail_items = mail_response.data.items;
        const mail_map = new Map(mail_items.map((item) => [item.id, item]));
        const results: SearchResultItem[] = [];

        for (const mail_id of search_result.mail_ids) {
          const item = mail_map.get(mail_id);

          if (!item) continue;

          if (abort_controller_ref.current?.signal.aborted) {
            return;
          }

          const envelope = await decrypt_mail_envelope(
            item.encrypted_envelope,
            item.envelope_nonce,
          );

          results.push(mail_item_to_search_result(item, envelope, 0, []));
        }

        const filtered_results = filter_by_operators(results, parsed_operators);
        const sorted_results = sort_results_fn(filtered_results, sort_option);

        const folder_counts = count_result_folders(sorted_results);

        offset_ref.current = sorted_results.length;
        const search_time = performance.now() - search_start_time_ref.current;

        if (is_mounted_ref.current) {
          set_state((prev) => ({
            ...prev,
            results: append
              ? [...prev.results, ...sorted_results]
              : sorted_results,
            is_searching: false,
            is_loading: false,
            total_results: search_result.total,
            has_more: offset_ref.current < search_result.total,
            cached: search_result.cached,
            search_time_ms: search_time,
            result_folders: folder_counts,
          }));
        }
      } catch (error) {
        if (abort_controller_ref.current?.signal.aborted) {
          return;
        }

        if (is_mounted_ref.current) {
          set_state((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : "Search failed",
            is_searching: false,
            is_loading: false,
          }));
        }
      }
    },
    [filter_by_operators, sort_results_fn, count_result_folders],
  );

  const search = useCallback(
    async (query: string): Promise<void> => {
      if (debounce_timer_ref.current) {
        clearTimeout(debounce_timer_ref.current);
      }

      const parsed = parse_search_query(query);
      const active_filters = create_active_filters(parsed.operators);

      set_state((prev) => ({
        ...prev,
        raw_query: query,
        text_query: parsed.text_query,
        parsed_operators: parsed.operators,
        active_filters,
        is_loading: true,
      }));

      offset_ref.current = 0;

      debounce_timer_ref.current = setTimeout(() => {
        set_state((current) => {
          perform_search(
            current.raw_query,
            current.text_query,
            current.parsed_operators,
            current.sort_option,
            current.search_scope,
            false,
          );

          return current;
        });
      }, DEBOUNCE_MS);
    },
    [perform_search],
  );

  const clear_results = useCallback(() => {
    if (debounce_timer_ref.current) {
      clearTimeout(debounce_timer_ref.current);
    }

    abort_controller_ref.current?.abort();
    offset_ref.current = 0;

    set_state(initial_advanced_state);
  }, []);

  const remove_filter = useCallback(
    (filter_id: string) => {
      set_state((current) => {
        const filter = current.active_filters.find((f) => f.id === filter_id);

        if (!filter) return current;

        const operator_index = current.parsed_operators.findIndex(
          (op, idx) => `${op.type}-${idx}-${op.value}` === filter_id,
        );

        if (operator_index >= 0) {
          const operator = current.parsed_operators[operator_index];
          const new_query = remove_operator_from_query(
            current.raw_query,
            operator.raw,
          );
          const parsed = parse_search_query(new_query);
          const new_active_filters = create_active_filters(parsed.operators);

          setTimeout(() => {
            perform_search(
              new_query,
              parsed.text_query,
              parsed.operators,
              current.sort_option,
              current.search_scope,
              false,
            );
          }, 0);

          return {
            ...current,
            raw_query: new_query,
            text_query: parsed.text_query,
            parsed_operators: parsed.operators,
            active_filters: new_active_filters,
            is_loading: true,
          };
        }

        return current;
      });
    },
    [perform_search],
  );

  const add_quick_filter = useCallback(
    (operator: string) => {
      set_state((current) => {
        const new_query = current.raw_query.trim()
          ? `${current.raw_query.trim()} ${operator}`
          : operator;

        const parsed = parse_search_query(new_query);
        const new_active_filters = create_active_filters(parsed.operators);

        setTimeout(() => {
          perform_search(
            new_query,
            parsed.text_query,
            parsed.operators,
            current.sort_option,
            current.search_scope,
            false,
          );
        }, 0);

        return {
          ...current,
          raw_query: new_query,
          text_query: parsed.text_query,
          parsed_operators: parsed.operators,
          active_filters: new_active_filters,
          is_loading: true,
        };
      });
    },
    [perform_search],
  );

  const set_sort_option = useCallback(
    (option: SortOption) => {
      set_state((prev) => ({
        ...prev,
        sort_option: option,
        results: sort_results_fn(prev.results, option),
      }));

      save_sort_preference(option);
    },
    [sort_results_fn, save_sort_preference],
  );

  const set_search_scope = useCallback(
    (scope: SearchScope) => {
      set_state((current) => {
        if (current.raw_query) {
          setTimeout(() => {
            perform_search(
              current.raw_query,
              current.text_query,
              current.parsed_operators,
              current.sort_option,
              scope,
              false,
            );
          }, 0);
        }

        return {
          ...current,
          search_scope: scope,
        };
      });
    },
    [perform_search],
  );

  const navigate_to_result = useCallback(
    (mail_id: string) => {
      const result = state.results.find((r) => r.id === mail_id);
      let from_view = "inbox";

      if (result) {
        if (result.is_trashed) {
          from_view = "trash";
        } else if (result.is_archived) {
          from_view = "archive";
        } else if (result.is_spam) {
          from_view = "spam";
        } else if (result.item_type === "sent") {
          from_view = "sent";
        } else if (result.item_type === "draft") {
          from_view = "drafts";
        } else if (result.item_type === "scheduled") {
          from_view = "scheduled";
        } else if (result.is_starred) {
          from_view = "starred";
        }
      }

      navigate(`/email/${mail_id}`, { state: { from_view } });
    },
    [navigate, state.results],
  );

  const load_more = useCallback(async (): Promise<void> => {
    set_state((current) => {
      if (current.is_searching || !current.has_more) {
        return current;
      }

      perform_search(
        current.raw_query,
        current.text_query,
        current.parsed_operators,
        current.sort_option,
        current.search_scope,
        true,
      );

      return { ...current, is_loading: true };
    });
  }, [perform_search]);

  useEffect(() => {
    return () => {
      if (debounce_timer_ref.current) {
        clearTimeout(debounce_timer_ref.current);
      }

      abort_controller_ref.current?.abort();
    };
  }, []);

  const quick_filters = useMemo(() => get_quick_filters(), []);

  return {
    state,
    search,
    clear_results,
    remove_filter,
    add_quick_filter,
    set_sort_option,
    set_search_scope,
    set_raw_query,
    get_parsed_query,
    quick_filters,
    navigate_to_result,
    load_more,
  };
}

export { clear_search_cache };
export type {
  ActiveFilter,
  SortOption,
  SearchScope,
  ParsedOperator,
  SearchHistoryEntry,
  SavedSearch,
  ClearSearchDataOptions,
};

export {
  get_search_history,
  add_to_history,
  remove_from_history,
  clear_search_history,
  get_saved_searches,
  save_search_to_storage,
  delete_saved_search_from_storage,
  update_saved_search_usage,
  clear_search_data,
};
