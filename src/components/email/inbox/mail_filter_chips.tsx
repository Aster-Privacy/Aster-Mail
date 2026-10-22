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
import { useCallback, useState } from "react";

import { AdvancedFilterModal } from "@/components/search/advanced_filter_modal";
import { SearchChipRow } from "@/components/search/search_chip_row";
import { clear_search_filters } from "@/utils/search_query";

const SCOPE_VIEW = "all";

export function inbox_chip_submit_query(query: string): string {
  const trimmed = query.trim();

  return trimmed === clear_search_filters("", SCOPE_VIEW) ? "" : trimmed;
}

interface MailFilterChipsProps {
  on_search_submit: (query: string) => void;
}

export function MailFilterChips({
  on_search_submit,
}: MailFilterChipsProps): React.ReactElement {
  const [query, set_query] = useState("");
  const [advanced_open, set_advanced_open] = useState(false);

  const handle_query_change = useCallback(
    (next: string) => {
      set_query(next);
      on_search_submit(inbox_chip_submit_query(next));
    },
    [on_search_submit],
  );

  return (
    <>
      <SearchChipRow
        on_advanced_click={() => set_advanced_open(true)}
        on_query_change={handle_query_change}
        query={query}
        scope_view={SCOPE_VIEW}
      />
      <AdvancedFilterModal
        is_open={advanced_open}
        on_close={() => set_advanced_open(false)}
        on_search_submit={handle_query_change}
        query={query}
        scope_view={SCOPE_VIEW}
      />
    </>
  );
}
