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

export const PANEL_TRANSITION_MS = 160;

function prefers_reduced_motion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function use_panel_transition(is_open: boolean): {
  is_visible: boolean;
  is_closing: boolean;
} {
  const [is_closing, set_is_closing] = useState(false);
  const was_open = useRef(is_open);

  useEffect(() => {
    if (was_open.current === is_open) return;

    was_open.current = is_open;

    if (is_open) {
      set_is_closing(false);

      return;
    }

    if (prefers_reduced_motion()) return;

    set_is_closing(true);

    const timer = window.setTimeout(
      () => set_is_closing(false),
      PANEL_TRANSITION_MS,
    );

    return () => window.clearTimeout(timer);
  }, [is_open]);

  return { is_visible: is_open || is_closing, is_closing };
}
