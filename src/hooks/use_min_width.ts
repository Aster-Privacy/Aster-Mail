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
import { useSyncExternalStore } from "react";

export const WIDE_LAYOUT_MIN_WIDTH = 1280;
export const EXTRA_WIDE_LAYOUT_MIN_WIDTH = 1920;

function query_for(min_width: number): string {
  return `(min-width: ${min_width}px)`;
}

export function matches_min_width(min_width: number): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;

  return window.matchMedia(query_for(min_width)).matches;
}

export function use_min_width(min_width: number): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === "undefined" || !window.matchMedia) {
        return () => {};
      }
      const list = window.matchMedia(query_for(min_width));

      list.addEventListener("change", notify);

      return () => list.removeEventListener("change", notify);
    },
    () => matches_min_width(min_width),
    () => true,
  );
}
