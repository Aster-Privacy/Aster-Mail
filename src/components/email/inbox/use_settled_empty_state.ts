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
import { useEffect, useState } from "react";

export const EMPTY_COMMIT_GRACE_MS = 400;

interface SettledEmptyStateParams {
  view_key: string;
  is_empty: boolean;
  is_settled: boolean;
}

export function use_settled_empty_state({
  view_key,
  is_empty,
  is_settled,
}: SettledEmptyStateParams): boolean {
  const [committed_key, set_committed_key] = useState<string | null>(null);

  useEffect(() => {
    if (!is_empty) {
      if (committed_key !== null) set_committed_key(null);

      return;
    }
    if (!is_settled || committed_key === view_key) return;

    const timer = setTimeout(() => {
      set_committed_key(view_key);
    }, EMPTY_COMMIT_GRACE_MS);

    return () => clearTimeout(timer);
  }, [view_key, is_empty, is_settled, committed_key]);

  return committed_key === view_key && is_empty;
}
