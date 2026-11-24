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

import { is_list_view_ready, prefetch_view } from "./view_prefetch";

export const VIEW_COMMIT_HOLD_MS = 350;

export function use_committed_view(
  target: string,
  is_ready: (view: string) => boolean = is_list_view_ready,
  prefetch: (view: string) => Promise<boolean> = prefetch_view,
  hold_ms: number = VIEW_COMMIT_HOLD_MS,
): string {
  const [committed, set_committed] = useState(target);
  const ready_now = committed !== target && is_ready(target);

  if (ready_now) set_committed(target);

  useEffect(() => {
    if (committed === target) return;

    let settled = false;
    const commit = () => {
      if (settled) return;
      settled = true;
      set_committed(target);
    };
    const timer = window.setTimeout(commit, hold_ms);

    prefetch(target).then(commit, commit);

    return () => {
      settled = true;
      window.clearTimeout(timer);
    };
  }, [target, committed, hold_ms, prefetch]);

  return ready_now ? target : committed;
}
