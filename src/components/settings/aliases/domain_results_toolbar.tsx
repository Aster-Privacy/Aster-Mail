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

import type { results_filter, results_sort } from "./domain_results_utils";

export interface DomainResultsToolbarProps {
  tlds: string[];
  active_tld: string | null;
  on_tld: (tld: string | null) => void;
  filter: results_filter;
  on_filter: (f: results_filter) => void;
  sort: results_sort;
  on_sort: (s: results_sort) => void;
  max_price: number | null;
  on_max_price: (cents: number | null) => void;
  count: number;
}
