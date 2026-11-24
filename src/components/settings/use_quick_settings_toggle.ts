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
import { useCallback, useRef, useState } from "react";

export const QUICK_SETTINGS_PANEL_QUERY = "(width >= 64rem)";

export function can_show_quick_settings_panel(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;

  return window.matchMedia(QUICK_SETTINGS_PANEL_QUERY).matches;
}

export function use_quick_settings_toggle(open_full_settings: () => void) {
  const [is_open, set_is_open] = useState(false);
  const open_full_settings_ref = useRef(open_full_settings);

  open_full_settings_ref.current = open_full_settings;

  const toggle = useCallback(() => {
    if (can_show_quick_settings_panel()) {
      set_is_open((prev) => !prev);

      return;
    }
    set_is_open(false);
    open_full_settings_ref.current();
  }, []);

  return { is_open, set_is_open, toggle };
}
