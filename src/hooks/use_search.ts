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

import type { DecryptedEnvelope, MailItemMetadata } from "@/types/email";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";

import { useState, useCallback, useRef } from "react";

import { list_encrypted_mail_items, type MailItem } from "@/services/api/mail";
import { decrypt_mail_metadata } from "@/services/crypto/mail_metadata";
import {
  decrypt_envelope_with_bytes,
  base64_to_array,
  normalize_envelope_from,
} from "@/services/crypto/envelope";
import {
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import { decrypt_message } from "@/services/crypto/key_manager";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { strip_html_tags } from "@/lib/html_sanitizer";
import { get_email_username } from "@/lib/utils";
import {
  parse_search_query,
  expand_date_shortcut,
  parse_size_value,
  parse_size_range,
  get_quick_filters,
  type ParsedOperator,
} from "@/utils/search_operators";
import { use_auth } from "@/contexts/auth_context";
import { decrypt_body_text } from "@/utils/email_crypto";
import { use_i18n } from "@/lib/i18n/context";

export interface ActiveFilter {
  id: string;
  label: string;
  removable: boolean;
}

export type SortOption = "relevance" | "date_newest" | "date_oldest" | "sender";

export interface SearchScope {
  type: "all" | "current_folder";
  folder?: string;
}

export interface SearchHistoryEntry {
  id: string;
  query: string;
  timestamp: number;
  result_count?: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  created_at: number;
  last_used_at?: number;
}

export interface SearchResultItem {
  id: string;
  subject: string;
  preview: string;
  sender_name: string;
  sender_email: string;
  timestamp: string;
  is_read: boolean;
  is_starred: boolean;
  has_attachment: boolean;
  avatar_url?: string;
  folders?: { folder_token: string; name: string }[];
}

export interface TextHighlight {
  text: string;
  is_match: boolean;
}

export interface AutocompleteSuggestion {
  text: string;
  type: string;
}

export function compute_highlight_ranges(
  text: string,
  terms: string[],
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const lower = text.toLowerCase();

  for (const term of terms) {
    const term_lower = term.toLowerCase();
    let pos = 0;

    while (pos < lower.length) {
      const idx = lower.indexOf(term_lower, pos);

      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + term_lower.length });
      pos = idx + 1;
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

export function apply_highlights(
  text: string,
  ranges: { start: number; end: number }[],
): TextHighlight[] {
  if (ranges.length === 0) return [{ text, is_match: false }];

  const parts: TextHighlight[] = [];
  let pos = 0;

  for (const range of ranges) {
    if (range.start > pos) {
      parts.push({ text: text.slice(pos, range.start), is_match: false });
    }
    parts.push({ text: text.slice(range.start, range.end), is_match: true });
    pos = range.end;
  }

  if (pos < text.length) {
    parts.push({ text: text.slice(pos), is_match: false });
  }

  return parts;
}

export function extract_query_terms(query: string): string[] {
  return query
    .replace(/\S+:\S*/g, "")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

export async function get_search_history(
  _user_id: string,
): Promise<SearchHistoryEntry[]> {
  return [];
}

export async function add_to_history(
  _user_id: string,
  _query: string,
  _result_count: number,
): Promise<SearchHistoryEntry[]> {
  return [];
}

export async function remove_from_history(
  _user_id: string,
  _entry_id: string,
): Promise<SearchHistoryEntry[]> {
  return [];
}

export async function get_saved_searches(
  _user_id: string,
): Promise<SavedSearch[]> {
  return [];
}

export async function save_search_to_storage(
  _user_id: string,
  _name: string,
  _query: string,
): Promise<{ success: boolean; search?: SavedSearch }> {
  return { success: false };
}

export async function delete_saved_search_from_storage(
  _user_id: string,
  _search_id: string,
): Promise<SavedSearch[]> {
  return [];
}

export async function update_saved_search_usage(
  _user_id: string,
  _search_id: string,
): Promise<void> {}

export async function clear_search_data(
  _user_id: string,
  _options: {
    clear_history: boolean;
    clear_saved_searches: boolean;
    clear_cache: boolean;
  },
): Promise<void> {}

interface SearchState {
  query: string;
  results: SearchResultItem[];
  is_loading: boolean;
  is_searching: boolean;
  is_loading_more: boolean;
  has_more: boolean;
  total_results: number;
  search_time_ms: number;
  error: string | null;
  index_building: boolean;
}

interface AutocompleteState {
  suggestions: AutocompleteSuggestion[];
  selected_index: number;
}

interface AdvancedSearchState {
  raw_query: string;
  text_query: string;
  results: SearchResultItem[];
  is_loading: boolean;
  is_searching: boolean;
  has_more: boolean;
  total_results: number;
  search_time_ms: number;
  error: string | null;
  active_filters: ActiveFilter[];
  sort_option: SortOption;
  search_scope: SearchScope;
  result_folders: Map<string, number>;
}

interface QuickFilter {
  id: string;
  label: string;
  operator: string;
}

interface SearchOptions {
  fields?: string[];
  filters?: {
    has_attachments?: boolean;
    is_starred?: boolean;
    date_from?: string;
    date_to?: string;
  };
  label_name_to_tokens?: Map<string, string[]>;
}

interface CachedIndex {
  items: MailItem[];
  decrypted: Map<
    string,
    { envelope: DecryptedEnvelope | null; metadata: MailItemMetadata | null }
  >;
  built_at: number;
}

const HASH_ALG = ["SHA", "256"].join("-");
const ENVELOPE_KEY_VERSIONS = ["astermail-envelope-v1", "astermail-import-v1"];
const INDEX_TTL_MS = 5 * 60 * 1000;

let cached_index: CachedIndex | null = null;
let index_build_promise: Promise<CachedIndex> | null = null;

async function try_decrypt_with_identity_key(
  encrypted: string,
  nonce_bytes: Uint8Array,
  identity_key: string,
): Promise<DecryptedEnvelope | null> {
  const encrypted_bytes = base64_to_array(encrypted);

  for (const version of ENVELOPE_KEY_VERSIONS) {
    try {
      const key_hash = await crypto.subtle.digest(
        HASH_ALG,
        new TextEncoder().encode(identity_key + version),
      );
      const crypto_key = await crypto.subtle.importKey(
        "raw",
        key_hash,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );
      const decrypted = await decrypt_aes_gcm_with_fallback(crypto_key, encrypted_bytes, nonce_bytes);

      const parsed = JSON.parse(new TextDecoder().decode(decrypted));
      const from = normalize_envelope_from(parsed.from);

      if (from) parsed.from = from;

      return parsed;
    } catch {
      continue;
    }
  }

  return null;
}

async function decrypt_envelope_for_search(
  encrypted: string,
  nonce: string,
): Promise<DecryptedEnvelope | null> {
  const nonce_bytes = nonce ? base64_to_array(nonce) : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted);
      const text = new TextDecoder().decode(encrypted_bytes);

      if (!text.startsWith("-----BEGIN PGP")) {
        return JSON.parse(text) as DecryptedEnvelope;
      }

      const vault = get_vault_from_memory();
      const pass = get_passphrase_from_memory();

      if (vault?.identity_key && pass) {
        const decrypted = await decrypt_message(text, vault.identity_key, pass);

        return JSON.parse(decrypted) as DecryptedEnvelope;
      }

      return null;
    } catch {
      return null;
    }
  }

  const passphrase = get_passphrase_bytes();

  if (!passphrase) return null;

  try {
    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<DecryptedEnvelope>(
        encrypted,
        passphrase,
      );

      zero_uint8_array(passphrase);

      return result;
    }

    zero_uint8_array(passphrase);

    const vault = get_vault_from_memory();

    if (!vault?.identity_key) return null;

    const result = await try_decrypt_with_identity_key(
      encrypted,
      nonce_bytes,
      vault.identity_key,
    );

    if (result) return result;

    if (vault.previous_keys && vault.previous_keys.length > 0) {
      for (const prev_key of vault.previous_keys) {
        const prev_result = await try_decrypt_with_identity_key(
          encrypted,
          nonce_bytes,
          prev_key,
        );

        if (prev_result) return prev_result;
      }
    }

    return null;
  } catch {
    zero_uint8_array(passphrase);

    return null;
  }
}

async function do_build_search_index(user_email: string): Promise<CachedIndex> {
  let all_items: MailItem[] = [];
  let cursor: string | undefined;
  let page_count = 0;

  do {
    const response = await list_encrypted_mail_items({ cursor });

    if (response.error) {
      cached_index = null;
      throw new Error(`search_fetch_failed:${response.error}`);
    }

    if (!response.data?.items) break;
    all_items.push(...response.data.items);
    cursor = response.data.next_cursor;
    page_count++;
  } while (cursor);

  if (all_items.length === 0 && page_count === 0) {
    cached_index = null;
    throw new Error("search_fetch_failed:no_response");
  }

  const decrypted = new Map<
    string,
    { envelope: DecryptedEnvelope | null; metadata: MailItemMetadata | null }
  >();

  const batch_size = 20;

  for (let i = 0; i < all_items.length; i += batch_size) {
    const batch = all_items.slice(i, i + batch_size);

    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const envelope = await decrypt_envelope_for_search(
          item.encrypted_envelope,
          item.envelope_nonce,
        );

        if (envelope?.body_text) {
          const sender_email = envelope.from?.email || "";

          envelope.body_text = await decrypt_body_text(
            envelope.body_text,
            user_email,
            sender_email,
          );
        }

        let metadata: MailItemMetadata | null = null;

        if (item.encrypted_metadata && item.metadata_nonce) {
          metadata = await decrypt_mail_metadata(
            item.encrypted_metadata,
            item.metadata_nonce,
            item.metadata_version,
          );
        }

        return { id: item.id, envelope, metadata };
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        decrypted.set(result.value.id, {
          envelope: result.value.envelope,
          metadata: result.value.metadata,
        });
      }
    }

    if (i > 0 && i % 100 === 0) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  const index: CachedIndex = {
    items: all_items,
    decrypted,
    built_at: Date.now(),
  };

  cached_index = index;

  return index;
}

export async function prewarm_search_index(user_email: string): Promise<void> {
  try {
    await build_search_index(user_email);
  } catch {
    // ignore - the next real search will surface the error
  }
}

async function build_search_index(user_email: string): Promise<CachedIndex> {
  if (cached_index && Date.now() - cached_index.built_at < INDEX_TTL_MS) {
    return cached_index;
  }

  if (index_build_promise) {
    return index_build_promise;
  }

  index_build_promise = do_build_search_index(user_email).finally(() => {
    index_build_promise = null;
  });

  return index_build_promise;
}

function matches_operator(
  op: ParsedOperator,
  envelope: DecryptedEnvelope,
  metadata: MailItemMetadata | null,
  item: MailItem,
  label_name_to_tokens?: Map<string, string[]>,
): boolean {
  const val = op.value.toLowerCase();

  switch (op.type) {
    case "from": {
      const sender = (envelope.from?.email || "").toLowerCase();
      const sender_name = (envelope.from?.name || "").toLowerCase();

      return sender.includes(val) || sender_name.includes(val);
    }
    case "to": {
      const recipients = (envelope.to || [])
        .map(
          (r: { email?: string; name?: string }) =>
            `${(r.email || "").toLowerCase()} ${(r.name || "").toLowerCase()}`,
        )
        .join(" ");

      return recipients.includes(val);
    }
    case "subject":
      return (envelope.subject || "").toLowerCase().includes(val);
    case "has": {
      if (val === "attachment" || val === "attachments")
        return metadata?.has_attachments ?? false;
      if (!metadata?.has_attachments) return false;
      const body_lower = (envelope.body_text || "").toLowerCase();
      const html_lower = (
        envelope.body_html ||
        envelope.html_body ||
        ""
      ).toLowerCase();
      const combined = body_lower + " " + html_lower;
      const ext_map: Record<string, string[]> = {
        pdf: [".pdf"],
        image: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"],
        document: [".doc", ".docx", ".odt", ".txt", ".rtf"],
        spreadsheet: [".xls", ".xlsx", ".ods", ".csv"],
        video: [".mp4", ".webm", ".avi", ".mov"],
        audio: [".mp3", ".wav", ".ogg", ".aac", ".flac"],
        archive: [".zip", ".rar", ".7z", ".gz", ".tar"],
      };
      const extensions = ext_map[val];

      if (!extensions) return true;

      return extensions.some((ext) => combined.includes(ext));
    }
    case "is":
      if (val === "unread") return !(metadata?.is_read ?? false);
      if (val === "read") return metadata?.is_read ?? false;
      if (val === "starred") return metadata?.is_starred ?? false;
      if (val === "unstarred") return !(metadata?.is_starred ?? false);

      return true;
    case "in": {
      const all_names = [
        ...(item.labels || []).map((l) => l.name.toLowerCase()),
        ...(item.folders || []).map((f) => f.name.toLowerCase()),
      ];

      if (val === "all") return true;
      if (
        val === "inbox" &&
        item.item_type === "received" &&
        !item.is_trashed &&
        !item.is_spam
      )
        return true;
      if (val === "sent" && item.item_type === "sent") return true;
      if (val === "trash" && item.is_trashed) return true;
      if (val === "spam" && item.is_spam) return true;
      if (val === "drafts" && item.item_type === "draft") return true;

      return all_names.some((f) => f.includes(val));
    }
    case "before": {
      const ts = new Date(item.message_ts || item.created_at).getTime();
      const target = new Date(op.value).getTime();

      return !isNaN(target) && ts < target;
    }
    case "after": {
      const ts = new Date(item.message_ts || item.created_at).getTime();
      const target = new Date(op.value).getTime();

      return !isNaN(target) && ts > target;
    }
    case "date": {
      const range = expand_date_shortcut(val);

      if (!range) return true;
      const ts = new Date(item.message_ts || item.created_at).getTime();
      const [fy, fm, fd] = range.date_from.split("-").map(Number);
      const [ty, tm, td] = range.date_to.split("-").map(Number);
      const from_ts = new Date(fy, fm - 1, fd, 0, 0, 0, 0).getTime();
      const to_ts = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();

      return ts >= from_ts && ts <= to_ts;
    }
    case "filename":
    case "attachment": {
      if (!metadata?.has_attachments) return false;
      const content = (
        (envelope.body_text || "") +
        " " +
        (envelope.body_html || envelope.html_body || "")
      ).toLowerCase();

      return content.includes(val);
    }
    case "larger": {
      const threshold = parse_size_value(op.value);

      if (threshold === null) return true;
      const size = metadata?.size_bytes ?? 0;

      return size > threshold;
    }
    case "smaller": {
      const threshold = parse_size_value(op.value);

      if (threshold === null) return true;
      const size = metadata?.size_bytes ?? 0;

      return size < threshold;
    }
    case "size": {
      const range = parse_size_range(op.value);

      if (!range) return true;
      const size = metadata?.size_bytes ?? 0;

      return size >= range.min && size <= range.max;
    }
    case "id":
      return item.id === op.value;
    case "label":
    case "folder": {
      if (label_name_to_tokens) {
        const matching_tokens: string[] = [];

        for (const [name, tokens] of label_name_to_tokens) {
          if (name.includes(val)) {
            matching_tokens.push(...tokens);
          }
        }
        if (matching_tokens.length > 0) {
          const item_tokens = [
            ...(item.labels || []).map((l) => l.token),
            ...(item.folders || []).map((f) => f.token),
            ...(item.tag_tokens || []),
          ];

          return item_tokens.some((t) => matching_tokens.includes(t));
        }
      }
      const all_names = [
        ...(item.labels || []).map((l) => l.name.toLowerCase()),
        ...(item.folders || []).map((f) => f.name.toLowerCase()),
      ];

      return all_names.some((l) => l.length > 0 && l.includes(val));
    }
    default:
      return true;
  }
}

function matches_query(
  terms: string[],
  operators: ParsedOperator[],
  envelope: DecryptedEnvelope | null,
  metadata: MailItemMetadata | null,
  item: MailItem,
  label_name_to_tokens?: Map<string, string[]>,
  fields?: string[],
): boolean {
  if (!envelope) return false;

  for (const op of operators) {
    const result = matches_operator(
      op,
      envelope,
      metadata,
      item,
      label_name_to_tokens,
    );

    if (op.negated ? result : !result) return false;
  }

  if (terms.length === 0) return true;

  const search_all = !fields || fields.length === 0 || fields.includes("all");
  const subject = (envelope.subject || "").toLowerCase();
  const sender_name = (envelope.from?.name || "").toLowerCase();
  const sender_email = (envelope.from?.email || "").toLowerCase();
  const recipients = (envelope.to || [])
    .map(
      (r: { email?: string; name?: string }) =>
        `${(r.email || "").toLowerCase()} ${(r.name || "").toLowerCase()}`,
    )
    .join(" ");
  const body = strip_html_tags(envelope.body_text || "").toLowerCase();

  return terms.every((term) => {
    if (search_all) {
      return (
        subject.includes(term) ||
        sender_name.includes(term) ||
        sender_email.includes(term) ||
        body.includes(term)
      );
    }
    let match = false;

    if (fields!.includes("subject")) match = match || subject.includes(term);
    if (fields!.includes("sender"))
      match =
        match || sender_name.includes(term) || sender_email.includes(term);
    if (fields!.includes("recipient"))
      match = match || recipients.includes(term);
    if (fields!.includes("body")) match = match || body.includes(term);

    return match;
  });
}

function to_search_result(
  item: MailItem,
  envelope: DecryptedEnvelope | null,
  metadata: MailItemMetadata | null,
): SearchResultItem {
  return {
    id: item.id,
    subject: envelope?.subject || "(Encrypted)",
    preview: envelope
      ? strip_html_tags(envelope.body_text || "").substring(0, 150)
      : "",
    sender_name:
      envelope?.from?.name || get_email_username(envelope?.from?.email || ""),
    sender_email: envelope?.from?.email || "",
    timestamp: item.message_ts || item.created_at,
    is_read: metadata?.is_read ?? false,
    is_starred: metadata?.is_starred ?? false,
    has_attachment: metadata?.has_attachments ?? false,
    folders: [
      ...(item.labels || []).map((l) => ({
        folder_token: l.token,
        name: l.name,
      })),
      ...(item.folders || []).map((f) => ({
        folder_token: f.token,
        name: f.name,
      })),
    ],
  };
}

export function use_search() {
  const { user } = use_auth();
  const { t } = use_i18n();
  const [state, set_state] = useState<SearchState>({
    query: "",
    results: [],
    is_loading: false,
    is_searching: false,
    is_loading_more: false,
    has_more: false,
    total_results: 0,
    search_time_ms: 0,
    error: null,
    index_building: false,
  });

  const abort_ref = useRef<AbortController | null>(null);

  const [autocomplete_state] = useState<AutocompleteState>({
    suggestions: [],
    selected_index: -1,
  });

  const clear_index = useCallback(() => {
    cached_index = null;
  }, []);

  const search = useCallback(
    async (query: string, options?: SearchOptions) => {
      set_state((prev) => ({
        ...prev,
        query,
        is_searching: true,
        error: null,
      }));

      if (!query || query.length < 2) {
        set_state((prev) => ({
          ...prev,
          results: [],
          is_searching: false,
          total_results: 0,
          search_time_ms: 0,
        }));

        return;
      }

      abort_ref.current?.abort();
      abort_ref.current = new AbortController();

      const start = Date.now();

      try {
        set_state((prev) => ({ ...prev, index_building: true }));

        const index = await build_search_index(user?.email || "");

        set_state((prev) => ({ ...prev, index_building: false }));

        if (abort_ref.current?.signal.aborted) return;

        const parsed = parse_search_query(query);
        const terms = parsed.text_query
          .split(/\s+/)
          .filter((t) => t.length >= 2)
          .map((t) => t.toLowerCase());
        const operators = parsed.operators;

        if (terms.length === 0 && operators.length === 0) {
          set_state((prev) => ({
            ...prev,
            results: [],
            is_searching: false,
            total_results: 0,
            search_time_ms: Date.now() - start,
          }));

          return;
        }

        const results: SearchResultItem[] = [];

        for (const item of index.items) {
          const data = index.decrypted.get(item.id);

          if (!data) continue;

          const { envelope, metadata } = data;

          if (
            !matches_query(
              terms,
              operators,
              envelope,
              metadata,
              item,
              options?.label_name_to_tokens,
              options?.fields,
            )
          ) {
            continue;
          }

          if (options?.filters) {
            const f = options.filters;

            if (
              f.has_attachments !== undefined &&
              (metadata?.has_attachments ?? false) !== f.has_attachments
            )
              continue;
            if (
              f.is_starred !== undefined &&
              (metadata?.is_starred ?? false) !== f.is_starred
            )
              continue;
            if (f.date_from) {
              const ts = new Date(item.message_ts || item.created_at).getTime();

              if (ts < new Date(f.date_from).getTime()) continue;
            }
            if (f.date_to) {
              const ts = new Date(item.message_ts || item.created_at).getTime();

              if (ts > new Date(f.date_to).getTime()) continue;
            }
          }

          results.push(to_search_result(item, envelope, metadata));
        }

        results.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );

        set_state((prev) => ({
          ...prev,
          results,
          is_searching: false,
          total_results: results.length,
          search_time_ms: Date.now() - start,
          has_more: false,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        const is_fetch_error = message.startsWith("search_fetch_failed:");

        set_state((prev) => ({
          ...prev,
          is_searching: false,
          index_building: false,
          error: is_fetch_error
            ? t("common.search_load_failed_try_again")
            : t("common.search_failed_try_again"),
        }));
      }
    },
    [user?.email],
  );

  const clear_results = useCallback(() => {
    set_state({
      query: "",
      results: [],
      is_loading: false,
      is_searching: false,
      is_loading_more: false,
      has_more: false,
      total_results: 0,
      search_time_ms: 0,
      error: null,
      index_building: false,
    });
  }, []);

  const set_query = useCallback((query: string) => {
    set_state((prev) => ({ ...prev, query }));
  }, []);

  return {
    state,
    autocomplete_state,
    search,
    clear_results,
    clear_index,
    load_more: () => {},
    set_query,
    navigate_to_result: (_id: string) => {},
    get_autocomplete: (_query: string, _field?: string) => {},
    select_autocomplete: (_index: number) => {},
    clear_autocomplete: () => {},
  };
}

export function use_advanced_search() {
  const [raw_query, set_raw_query_state] = useState("");
  const [sort_option, set_sort_option_state] =
    useState<SortOption>("relevance");
  const [search_scope, set_search_scope_state] = useState<SearchScope>({
    type: "all",
  });

  const {
    state: underlying,
    search: underlying_search,
    clear_results: underlying_clear,
  } = use_search();

  const parsed = parse_search_query(raw_query);

  const state: AdvancedSearchState = {
    raw_query,
    text_query: parsed.text_query,
    results: underlying.results,
    is_loading: underlying.is_loading,
    is_searching: underlying.is_searching,
    has_more: underlying.has_more,
    total_results: underlying.total_results,
    search_time_ms: underlying.search_time_ms,
    error: underlying.error,
    active_filters: parsed.operators.map((op) => ({
      id: `${op.type}-${op.value}`,
      label: `${op.negated ? "-" : ""}${op.type}:${op.value}`,
      removable: true,
    })),
    sort_option,
    search_scope,
    result_folders: new Map(),
  };

  const quick_filters: QuickFilter[] = get_quick_filters();

  const search = useCallback(
    (query: string) => {
      underlying_search(query, { fields: ["all"] });
    },
    [underlying_search],
  );

  return {
    state,
    search,
    clear_results: () => {
      set_raw_query_state("");
      underlying_clear();
    },
    remove_filter: (_id: string) => {},
    add_quick_filter: (operator: string) => {
      set_raw_query_state((prev) => {
        if (prev.includes(operator)) return prev;
        const next = prev ? `${prev} ${operator}` : operator;

        underlying_search(next, { fields: ["all"] });

        return next;
      });
    },
    set_sort_option: set_sort_option_state,
    set_search_scope: set_search_scope_state,
    set_raw_query: set_raw_query_state,
    quick_filters,
    navigate_to_result: (_id: string) => {},
    load_more: () => {},
  };
}
