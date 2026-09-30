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

export const SKELETON_DELAY_MS = 250;
export const SKELETON_MIN_VISIBLE_MS = 400;
export const QUIET_REFRESH_DELAY_MS = 400;

export function use_delayed_flag(
  active: boolean,
  delay_ms: number = SKELETON_DELAY_MS,
  min_visible_ms: number = SKELETON_MIN_VISIBLE_MS,
): boolean {
  const [shown, set_shown] = useState(false);
  const shown_at_ref = useRef(0);

  useEffect(() => {
    if (active) {
      const timer = setTimeout(() => {
        shown_at_ref.current = Date.now();
        set_shown(true);
      }, delay_ms);

      return () => clearTimeout(timer);
    }

    const visible_for = Date.now() - shown_at_ref.current;
    const remaining = min_visible_ms - visible_for;

    if (remaining <= 0 || shown_at_ref.current === 0) {
      set_shown(false);

      return;
    }

    const timer = setTimeout(() => set_shown(false), remaining);

    return () => clearTimeout(timer);
  }, [active, delay_ms, min_visible_ms]);

  return shown;
}
