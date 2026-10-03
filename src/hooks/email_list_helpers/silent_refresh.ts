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

import type { InboxEmail } from "@/types/email";

import { drop_removed_after } from "@/services/removed_items";

function same_value(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    typeof left !== "object" ||
    typeof right !== "object" ||
    left === null ||
    right === null
  ) {
    return false;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;

    return left.every((value, index) => same_value(value, right[index]));
  }

  if (
    Object.getPrototypeOf(left) !== Object.prototype ||
    Object.getPrototypeOf(right) !== Object.prototype
  ) {
    return false;
  }

  const left_record = left as Record<string, unknown>;
  const right_record = right as Record<string, unknown>;
  const keys = new Set([
    ...Object.keys(left_record),
    ...Object.keys(right_record),
  ]);

  for (const key of keys) {
    if (!same_value(left_record[key], right_record[key])) return false;
  }

  return true;
}

export function merge_silent_refresh_emails(
  previous: InboxEmail[],
  incoming: InboxEmail[],
  started_at: number,
): InboxEmail[] {
  const surviving = drop_removed_after(incoming, started_at);
  const selected_ids = new Set(
    previous.filter((e) => e.is_selected).map((e) => e.id),
  );
  const previous_by_id = new Map(previous.map((e) => [e.id, e]));

  const merged = surviving.map((e) => {
    const next = selected_ids.has(e.id) ? { ...e, is_selected: true } : e;
    const existing = previous_by_id.get(e.id);

    return existing && same_value(existing, next) ? existing : next;
  });

  const unchanged =
    merged.length === previous.length &&
    merged.every((e, index) => e === previous[index]);

  return unchanged ? previous : merged;
}
