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
import { useEffect, useRef, useCallback } from "react";

export function use_shift_key_ref() {
  const shift_ref = useRef(false);

  useEffect(() => {
    const on_down = (e: KeyboardEvent) => {
      if (e.key === "Shift") shift_ref.current = true;
    };
    const on_up = (e: KeyboardEvent) => {
      if (e.key === "Shift") shift_ref.current = false;
    };
    const on_blur = () => {
      shift_ref.current = false;
    };

    window.addEventListener("keydown", on_down);
    window.addEventListener("keyup", on_up);
    window.addEventListener("blur", on_blur);

    return () => {
      window.removeEventListener("keydown", on_down);
      window.removeEventListener("keyup", on_up);
      window.removeEventListener("blur", on_blur);
    };
  }, []);

  return shift_ref;
}

export function use_shift_range_select<T>(
  items: T[],
  get_id: (item: T) => string,
  selected: Set<string>,
  set_selected: (next: Set<string>) => void,
) {
  const shift_ref = use_shift_key_ref();
  const last_index_ref = useRef<number | null>(null);
  const items_ref = useRef(items);
  const selected_ref = useRef(selected);
  const get_id_ref = useRef(get_id);

  items_ref.current = items;
  selected_ref.current = selected;
  get_id_ref.current = get_id;

  return useCallback(
    (index: number) => {
      const current_items = items_ref.current;
      const current_selected = selected_ref.current;
      const get_id_fn = get_id_ref.current;
      const last = last_index_ref.current;
      const shift = shift_ref.current;

      if (index < 0 || index >= current_items.length) return;

      const next = new Set(current_selected);

      if (
        shift &&
        last !== null &&
        last !== index &&
        last >= 0 &&
        last < current_items.length
      ) {
        const start = Math.min(last, index);
        const end = Math.max(last, index);
        const anchor_id = get_id_fn(current_items[last]);
        const should_select = current_selected.has(anchor_id);

        for (let i = start; i <= end; i++) {
          const item_id = get_id_fn(current_items[i]);

          if (should_select) {
            next.add(item_id);
          } else {
            next.delete(item_id);
          }
        }
      } else {
        const id = get_id_fn(current_items[index]);

        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }

      set_selected(next);
      last_index_ref.current = index;
    },
    [set_selected, shift_ref],
  );
}
