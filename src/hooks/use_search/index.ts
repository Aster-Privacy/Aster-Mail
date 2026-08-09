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
export { reset_legacy_migration_state, schedule_legacy_envelope_migration } from "./envelope";
export { apply_highlights, compute_highlight_ranges, extract_query_terms } from "./highlight";
export { clear_search_index, disk_ids_after_hot, mark_search_index_stale, prewarm_search_index } from "./index_cache";
export { matches_query, preheader_html_source, searchable_body_source } from "./matching";
export { pause_index_download, resume_index_download, subscribe_index_refresh, use_index_download_state, use_indexing_progress } from "./progress";
export { list_index_people, scan_search_index } from "./scan";
export { can_refine_scan, candidates_are_cacheable, excluded_by_mailbox_scope, operators_equal, options_signature, passes_search_filters, resolve_mailbox_scope } from "./scan_cache";
export { add_to_history, clear_search_data, delete_saved_search_from_storage, get_saved_searches, get_search_history, remove_from_history, save_search_to_storage, update_saved_search_usage } from "./storage";
export type { ActiveFilter, AutocompleteSuggestion, CachedIndex, DecryptedIndexEntry, IndexPerson, IndexingProgress, SavedSearch, ScanCacheEntry, ScanCandidate, ScanOptions, SearchHistoryEntry, SearchMailboxScope, SearchOptions, SearchResultItem, SearchScope, SortOption, TextHighlight } from "./types";
export { use_advanced_search } from "./use_advanced_search";
export { use_search } from "./use_search_hook";
