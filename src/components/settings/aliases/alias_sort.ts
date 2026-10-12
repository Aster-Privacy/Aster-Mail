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
export const ALIAS_SORT_MODES = ["newest", "oldest", "az", "za"] as const;

export type AliasSortMode = (typeof ALIAS_SORT_MODES)[number];

export const ALIAS_SORT_STORAGE_KEY = "aster_alias_list_sort";

export interface SortableAliasEntry {
  sort_address: string;
  created_at: string;
}

export function is_alias_sort_mode(value: unknown): value is AliasSortMode {
  return (
    typeof value === "string" &&
    (ALIAS_SORT_MODES as readonly string[]).includes(value)
  );
}

export function read_alias_sort_mode(): AliasSortMode {
  try {
    const stored = localStorage.getItem(ALIAS_SORT_STORAGE_KEY);

    return is_alias_sort_mode(stored) ? stored : "newest";
  } catch {
    return "newest";
  }
}

export function store_alias_sort_mode(mode: AliasSortMode): void {
  try {
    localStorage.setItem(ALIAS_SORT_STORAGE_KEY, mode);
  } catch {
    return;
  }
}

function created_time(value: string): number {
  const time = Date.parse(value);

  return Number.isNaN(time) ? 0 : time;
}

export function sort_alias_entries<T extends SortableAliasEntry>(
  entries: readonly T[],
  mode: AliasSortMode,
  locale?: string,
): T[] {
  const collator = new Intl.Collator(locale, {
    numeric: true,
    sensitivity: "base",
  });
  const by_address = (a: T, b: T) =>
    collator.compare(a.sort_address, b.sort_address);
  const by_created = (a: T, b: T) =>
    created_time(a.created_at) - created_time(b.created_at);

  return [...entries].sort((a, b) => {
    switch (mode) {
      case "oldest":
        return by_created(a, b) || by_address(a, b);
      case "az":
        return by_address(a, b) || by_created(b, a);
      case "za":
        return by_address(b, a) || by_created(b, a);
      default:
        return by_created(b, a) || by_address(a, b);
    }
  });
}
