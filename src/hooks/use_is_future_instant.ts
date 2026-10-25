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

import { is_future_instant } from "@/utils/schedule_targets";

const MAX_TIMER_DELAY_MS = 2_147_483_647;

export function use_is_future_instant(
  instant: Date | null | undefined,
  is_active: boolean = true,
): boolean {
  const [tick, set_tick] = useState(0);
  const target_ms = instant ? instant.getTime() : Number.NaN;

  useEffect(() => {
    if (!is_active || Number.isNaN(target_ms)) return;

    const remaining_ms = target_ms - Date.now();

    if (remaining_ms < 0) return;

    const refresh = () => set_tick((value) => value + 1);
    const handle_visibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = setTimeout(
      refresh,
      Math.min(remaining_ms + 1, MAX_TIMER_DELAY_MS),
    );

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handle_visibility);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handle_visibility);
    };
  }, [is_active, target_ms, tick]);

  return is_future_instant(instant);
}
