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

export const ROW_STORE_LIMIT = 1500;

export type RowStore = Map<string, InboxEmail>;

export interface CategoryRowCache {
  owner: string | null;
  rows: RowStore;
  pages: Map<string, InboxEmail[]>;
}

export const category_row_cache: CategoryRowCache = {
  owner: null,
  rows: new Map(),
  pages: new Map(),
};

export function claim_category_row_cache(owner: string): CategoryRowCache {
  if (category_row_cache.owner !== owner) {
    category_row_cache.rows.clear();
    category_row_cache.pages.clear();
    category_row_cache.owner = owner;
  }

  return category_row_cache;
}

export function clear_category_row_cache(): void {
  category_row_cache.rows.clear();
  category_row_cache.pages.clear();
  category_row_cache.owner = null;
}

function row_keys(row: InboxEmail): string[] {
  const grouped = row.grouped_email_ids ?? [];

  return grouped.includes(row.id) ? grouped : [row.id, ...grouped];
}

export function remember_rows(
  store: RowStore,
  rows: readonly InboxEmail[],
): void {
  for (const row of rows) {
    for (const key of row_keys(row)) {
      store.delete(key);
      store.set(key, row);
    }
  }
  while (store.size > ROW_STORE_LIMIT) {
    const oldest = store.keys().next().value;

    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function patch_row(
  store: RowStore,
  id: string,
  updates: Partial<InboxEmail>,
): void {
  const row = store.get(id);

  if (!row) return;

  const patched = row.id === id ? { ...row, ...updates } : row;

  if (patched === row) return;
  for (const key of row_keys(row)) {
    if (store.get(key) === row) store.set(key, patched);
  }
}

export function forget_rows(store: RowStore, ids: Iterable<string>): void {
  for (const id of ids) {
    const row = store.get(id);

    if (!row) continue;
    for (const key of row_keys(row)) {
      if (store.get(key) === row) store.delete(key);
    }
  }
}

export function assemble_cached_page(
  store: RowStore,
  ids: readonly string[],
  is_unread: (id: string) => boolean,
): InboxEmail[] | null {
  if (ids.length === 0) return null;

  const seen = new Set<InboxEmail>();
  const rows: InboxEmail[] = [];

  for (const id of ids) {
    const row = store.get(id);

    if (!row) return null;
    if (seen.has(row)) continue;
    seen.add(row);

    const is_read = !is_unread(id);

    rows.push(row.is_read === is_read ? row : { ...row, is_read });
  }

  return rows;
}

export function assemble_known_rows(
  store: RowStore,
  ids: readonly string[],
  is_unread: (id: string) => boolean,
): InboxEmail[] | null {
  const seen = new Set<InboxEmail>();
  const rows: InboxEmail[] = [];

  for (const id of ids) {
    const row = store.get(id);

    if (!row || seen.has(row)) continue;
    seen.add(row);

    const is_read = !is_unread(id);

    rows.push(row.is_read === is_read ? row : { ...row, is_read });
  }

  return rows.length > 0 ? rows : null;
}
