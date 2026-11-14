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
export type ListClickIntent = "toggle" | "range" | null;

export interface ListClickModifiers {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  button?: number;
}

export interface ListToggleOptions {
  range?: boolean;
  anchor_id?: string | null;
}

export interface RangeSelectionInput {
  ids: readonly string[];
  selected_ids: ReadonlySet<string>;
  anchor_id: string;
  target_id: string;
  previous_target_id: string | null;
  should_select: boolean;
}

export interface RangeSelectionChange {
  id: string;
  selected: boolean;
}

export function list_click_intent(
  event: ListClickModifiers,
  is_mac: boolean,
): ListClickIntent {
  if ((event.button ?? 0) !== 0) return null;
  if (event.shiftKey) return "range";

  const toggle_pressed = is_mac ? event.metaKey : event.ctrlKey;

  return toggle_pressed ? "toggle" : null;
}

export function plan_range_selection({
  ids,
  selected_ids,
  anchor_id,
  target_id,
  previous_target_id,
  should_select,
}: RangeSelectionInput): RangeSelectionChange[] | null {
  const anchor_index = ids.indexOf(anchor_id);
  const target_index = ids.indexOf(target_id);

  if (anchor_index === -1 || target_index === -1) return null;

  const new_start = Math.min(anchor_index, target_index);
  const new_end = Math.max(anchor_index, target_index);
  const changes: RangeSelectionChange[] = [];

  if (previous_target_id !== null) {
    const previous_index = ids.indexOf(previous_target_id);

    if (previous_index !== -1) {
      const old_start = Math.min(anchor_index, previous_index);
      const old_end = Math.max(anchor_index, previous_index);

      for (let i = old_start; i <= old_end; i++) {
        if (i >= new_start && i <= new_end) continue;
        const id = ids[i];

        if (selected_ids.has(id) === should_select) {
          changes.push({ id, selected: !should_select });
        }
      }
    }
  }

  for (let i = new_start; i <= new_end; i++) {
    const id = ids[i];

    if (selected_ids.has(id) !== should_select) {
      changes.push({ id, selected: should_select });
    }
  }

  return changes;
}

export function apply_range_selection(
  selected_ids: ReadonlySet<string>,
  changes: readonly RangeSelectionChange[],
): Set<string> {
  const next = new Set(selected_ids);

  for (const change of changes) {
    if (change.selected) next.add(change.id);
    else next.delete(change.id);
  }

  return next;
}
