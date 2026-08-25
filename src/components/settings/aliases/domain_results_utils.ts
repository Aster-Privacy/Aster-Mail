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

import type { DomainSearchResult } from "@/services/api/domains";

export type results_sort =
  | "relevance"
  | "price_low"
  | "price_high"
  | "az"
  | "discount";

export type results_filter = "all" | "available" | "taken";

export function discount_percent(r: DomainSearchResult): number | null {
  if (r.price_cents === null || r.renewal_price_cents === null) return null;
  if (r.renewal_price_cents <= r.price_cents) return null;
  const pct = Math.round(
    ((r.renewal_price_cents - r.price_cents) / r.renewal_price_cents) * 100,
  );

  return pct >= 5 ? pct : null;
}

function result_tld(r: DomainSearchResult): string {
  const idx = r.domain.indexOf(".");

  return idx === -1 ? "" : r.domain.slice(idx + 1).toLowerCase();
}

export function filter_results(
  results: DomainSearchResult[],
  filter: results_filter,
  tld: string | null,
  max_price_cents: number | null,
): DomainSearchResult[] {
  return results.filter((r) => {
    if (filter === "available" && !r.available) return false;
    if (filter === "taken" && r.available) return false;
    if (tld !== null && result_tld(r) !== tld.toLowerCase()) return false;
    if (
      max_price_cents !== null &&
      r.available &&
      r.price_cents !== null &&
      r.price_cents > max_price_cents
    )
      return false;

    return true;
  });
}

function compare_price(
  a: DomainSearchResult,
  b: DomainSearchResult,
  dir: 1 | -1,
): number {
  if (a.price_cents === null && b.price_cents === null) return 0;
  if (a.price_cents === null) return 1;
  if (b.price_cents === null) return -1;

  return (a.price_cents - b.price_cents) * dir;
}

function compare_discount(
  a: DomainSearchResult,
  b: DomainSearchResult,
): number {
  const da = discount_percent(a) ?? -1;
  const db = discount_percent(b) ?? -1;

  return db - da;
}

export function sort_results(
  results: DomainSearchResult[],
  sort: results_sort,
): DomainSearchResult[] {
  const indexed = results.map((r, i) => ({ r, i }));

  indexed.sort((x, y) => {
    if (x.r.available !== y.r.available) return x.r.available ? -1 : 1;
    let cmp = 0;

    if (sort === "price_low") cmp = compare_price(x.r, y.r, 1);
    else if (sort === "price_high") cmp = compare_price(x.r, y.r, -1);
    else if (sort === "az") cmp = x.r.domain.localeCompare(y.r.domain);
    else if (sort === "discount") cmp = compare_discount(x.r, y.r);
    if (cmp !== 0) return cmp;

    return x.i - y.i;
  });

  return indexed.map((x) => x.r);
}

export function paginate<T>(items: T[], visible: number): T[] {
  return items.slice(0, Math.max(0, visible));
}
