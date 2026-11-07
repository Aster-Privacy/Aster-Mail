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
export interface PageRange {
  start: number;
  end: number;
  total: number | null;
}

export function resolve_page_range(params: {
  current_page: number;
  page_size: number;
  page_row_count: number;
  total: number;
  total_pages: number;
}): PageRange {
  const start = params.current_page * params.page_size + 1;
  const page_end = (params.current_page + 1) * params.page_size;
  const end =
    params.page_row_count > 0
      ? Math.min(start + params.page_row_count - 1, page_end)
      : page_end;
  const is_last_page = params.current_page >= params.total_pages - 1;
  const total_known =
    params.total >= start && (is_last_page || params.total > end);

  if (!total_known) return { start, end, total: null };

  return { start, end: Math.min(end, params.total), total: params.total };
}
