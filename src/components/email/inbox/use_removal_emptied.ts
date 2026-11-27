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
import { useEffect, useRef, useState } from "react";

import { REMOVAL_SETTLE_MS } from "@/hooks/list_removal";
import { removed_within } from "@/services/removed_items";

export const REMOVAL_REFILL_WAIT_MS = 1_500;

interface RemovalEmptiedParams {
  view_key: string;
  row_count: number;
}

export function use_removal_emptied({
  view_key,
  row_count,
}: RemovalEmptiedParams): boolean {
  const previous_ref = useRef({ view_key, row_count });
  const [emptied_key, set_emptied_key] = useState<string | null>(null);

  useEffect(() => {
    const previous = previous_ref.current;

    previous_ref.current = { view_key, row_count };
    if (row_count > 0) {
      if (emptied_key !== null) set_emptied_key(null);

      return;
    }
    if (
      previous.view_key === view_key &&
      previous.row_count > 0 &&
      removed_within(REMOVAL_SETTLE_MS)
    ) {
      set_emptied_key(view_key);
    }
  }, [view_key, row_count, emptied_key]);

  useEffect(() => {
    if (emptied_key === null) return;

    const timer = setTimeout(
      () => set_emptied_key(null),
      REMOVAL_REFILL_WAIT_MS,
    );

    return () => clearTimeout(timer);
  }, [emptied_key]);

  return emptied_key === view_key && row_count === 0;
}
