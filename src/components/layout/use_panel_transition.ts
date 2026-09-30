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

interface CloseState {
  is_closing: boolean;
  close_id: number;
}

function prefers_reduced_motion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function use_panel_transition(
  is_open: boolean,
  skip_exit: boolean = false,
): {
  is_visible: boolean;
  is_closing: boolean;
} {
  const [close_state, set_close_state] = useState<CloseState>({
    is_closing: false,
    close_id: 0,
  });
  const was_open = useRef(is_open);

  if (was_open.current !== is_open) {
    was_open.current = is_open;

    const starts_exit = !is_open && !skip_exit && !prefers_reduced_motion();

    if (starts_exit) {
      set_close_state((prev) => ({
        is_closing: true,
        close_id: prev.close_id + 1,
      }));
    } else if (close_state.is_closing) {
      set_close_state((prev) => ({ ...prev, is_closing: false }));
    }
  }

  const { is_closing, close_id } = close_state;

  useEffect(() => {
    if (!is_closing) return;

    const timer = window.setTimeout(
      () =>
        set_close_state((prev) =>
          prev.close_id === close_id ? { ...prev, is_closing: false } : prev,
        ),
      PANEL_TRANSITION_MS,
    );

    return () => window.clearTimeout(timer);
  }, [is_closing, close_id]);

  return { is_visible: is_open || is_closing, is_closing };
}
