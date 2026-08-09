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
export { build_query_from_filters } from "./build";
export { expand_date_shortcut, is_valid_date_shortcut } from "./dates";
export { create_active_filters, operators_to_filters } from "./filters";
export type { ExtendedSearchFilters } from "./filters";
export { get_operator_suggestions, parse_search_query, validate_operator } from "./parse";
export type { OperatorSuggestion } from "./parse";
export { add_operator_to_query, format_date_for_operator, get_quick_filters, parse_operator_date, remove_operator_from_query } from "./query";
export { format_size_for_display, get_attachment_mimes, parse_size_range, parse_size_value } from "./size";
export type { ActiveFilter, DateShortcut, HasOperatorValue, InOperatorValue, IsOperatorValue, ParsedOperator, ParsedSearchQuery, SearchOperatorType, SearchScope, SortOption } from "./types";
