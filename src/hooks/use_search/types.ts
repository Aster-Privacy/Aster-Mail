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

import { type MailItem } from "@/services/api/mail";
import { type ParsedOperator } from "@/utils/search_operators";
import { type SnapshotMeta } from "@/services/search_index_store";
import { type ChunkSkipPlan } from "@/services/search_chunk_filter";

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
  item_type?: string;
  folders?: { folder_token: string; name: string }[];
  thread_token?: string;
  thread_message_count?: number;
  grouped_email_ids?: string[];
}

export interface TextHighlight {
  text: string;
  is_match: boolean;
}

export interface AutocompleteSuggestion {
  text: string;
  type: string;
}

export interface AppliedCorrection {
  original_query: string;
  corrected_query: string;
  original_term: string;
  corrected_term: string;
}

export interface SearchState {
  query: string;
  results: SearchResultItem[];
  results_query: string;
  correction: AppliedCorrection | null;
  is_loading: boolean;
  is_searching: boolean;
  is_loading_more: boolean;
  has_more: boolean;
  total_results: number;
  search_time_ms: number;
  error: string | null;
  index_building: boolean;
  hidden_spam_trash: number;
  index_incomplete: boolean;
  index_pending: boolean;
  indexed_count: number;
}

export interface AutocompleteState {
  suggestions: AutocompleteSuggestion[];
  selected_index: number;
}

export interface AdvancedSearchState {
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

export interface QuickFilter {
  id: string;
  label: string;
  operator: string;
}

export interface SearchOptions {
  fields?: string[];
  filters?: {
    has_attachments?: boolean;
    is_starred?: boolean;
    date_from?: string;
    date_to?: string;
  };
  label_name_to_tokens?: Map<string, string[]>;
  search_body?: boolean;
}

export interface SearchHaystack {
  subject: string;
  sender_name: string;
  sender_email: string;
  contact: string;
  recipients: string;
}

export interface DecryptedIndexEntry {
  envelope: DecryptedEnvelope | null;
  metadata: MailItemMetadata | null;
  search_body_text: string;
  meta_fp: string;
  has_body: boolean;
  haystack?: SearchHaystack;
}

export interface CachedIndex {
  items: MailItem[];
  decrypted: Map<string, DecryptedIndexEntry>;
  built_at: number;
  include_body: boolean;
  user_email: string;
  disk_chunk_ids: number[];
  total_indexed: number;
  complete: boolean;
  meta: SnapshotMeta | null;
}

export interface IndexingProgress {
  building: boolean;
  current: number;
  total: number;
}

export interface ScanOptions {
  skip?: ChunkSkipPlan | null;
  on_chunk?: () => void;
  on_unreadable_chunk?: () => void;
}

export interface IndexPerson {
  name: string;
  email: string;
  count: number;
}

export interface ScanCandidate {
  item: MailItem;
  entry: DecryptedIndexEntry;
  result: SearchResultItem;
  excluded_by_scope?: boolean;
}

export interface SearchMailboxScope {
  include_spam: boolean;
  include_trash: boolean;
}

export interface ScanCacheEntry {
  terms: string[];
  operators: ParsedOperator[];
  options_key: string;
  built_at: number;
  saved_at: number;
  candidates: ScanCandidate[];
}
