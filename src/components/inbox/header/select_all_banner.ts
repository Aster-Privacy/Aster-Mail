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
export type SelectAllBanner =
  "none" | "offer" | "offer_unknown" | "selected" | "selected_unknown";

export function resolve_select_all_banner(params: {
  all_selected: boolean;
  select_all_mode: boolean;
  total_messages: number;
  page_selected_count: number;
  has_next_page: boolean;
  can_activate: boolean;
  can_clear: boolean;
}): SelectAllBanner {
  const total_counted = params.total_messages > params.page_selected_count;

  if (params.select_all_mode) {
    if (!params.can_clear) return "none";
    if (!total_counted && params.has_next_page) return "selected_unknown";

    return params.total_messages > 0 ? "selected" : "none";
  }

  if (
    !params.all_selected ||
    params.page_selected_count <= 0 ||
    !params.can_activate
  ) {
    return "none";
  }
  if (total_counted) return "offer";

  return params.has_next_page ? "offer_unknown" : "none";
}
