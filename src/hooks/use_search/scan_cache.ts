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

import type {  MailItemMetadata } from "@/types/email";


import {
  type MailItem,
} from "@/services/api/mail";
import {
  type ParsedOperator,
} from "@/utils/search_operators";
import {
  date_boundary_local,
} from "@/services/search_chunk_filter";

import { CachedIndex, ScanCacheEntry, ScanCandidate, SearchMailboxScope, SearchOptions } from "./types";
export const PROGRESS_FLUSH_MS = 120;
const REFINE_CACHE_MAX_CHARS = 2_000_000;

export function resolve_mailbox_scope(
  operators: ParsedOperator[],
): SearchMailboxScope {
  const scope: SearchMailboxScope = {
    include_spam: false,
    include_trash: false,
  };

  for (const op of operators) {
    if (op.negated) continue;
    if (op.type !== "in" && op.type !== "label" && op.type !== "folder")
      continue;

    const val = op.value.toLowerCase();

    if (val === "anywhere") {
      scope.include_spam = true;
      scope.include_trash = true;
    } else if (val === "spam") {
      scope.include_spam = true;
    } else if (val === "trash") {
      scope.include_trash = true;
    }
  }

  return scope;
}

export function excluded_by_mailbox_scope(
  item: MailItem,
  scope: SearchMailboxScope,
): boolean {
  if (item.is_trashed && !scope.include_trash) return true;
  if (item.is_spam && !scope.include_spam) return true;

  return false;
}

export function passes_search_filters(
  item: MailItem,
  metadata: MailItemMetadata | null,
  filters?: SearchOptions["filters"],
): boolean {
  if (!filters) return true;

  if (
    filters.has_attachments !== undefined &&
    (metadata?.has_attachments ?? false) !== filters.has_attachments
  ) {
    return false;
  }
  if (
    filters.is_starred !== undefined &&
    (metadata?.is_starred ?? false) !== filters.is_starred
  ) {
    return false;
  }
  if (filters.date_from) {
    const ts = new Date(item.message_ts || item.created_at).getTime();

    if (ts < date_boundary_local(filters.date_from, false)) return false;
  }
  if (filters.date_to) {
    const ts = new Date(item.message_ts || item.created_at).getTime();

    if (ts > date_boundary_local(filters.date_to, true)) return false;
  }

  return true;
}

export function options_signature(options?: SearchOptions): string {
  const labels = options?.label_name_to_tokens
    ? [...options.label_name_to_tokens.entries()]
        .map(([name, tokens]) => `${name}=${tokens.join(",")}`)
        .sort()
        .join("|")
    : "";

  return JSON.stringify([
    options?.fields ?? null,
    options?.filters ?? null,
    options?.search_body ?? null,
    labels,
  ]);
}

export function operators_equal(
  a: ParsedOperator[],
  b: ParsedOperator[],
): boolean {
  if (a.length !== b.length) return false;

  return a.every(
    (op, i) =>
      op.type === b[i].type &&
      op.value === b[i].value &&
      !!op.negated === !!b[i].negated,
  );
}

export function candidates_are_cacheable(candidates: ScanCandidate[]): boolean {
  let chars = 0;

  for (const candidate of candidates) {
    chars += candidate.entry.search_body_text.length;

    if (chars > REFINE_CACHE_MAX_CHARS) return false;
  }

  return true;
}

export function can_refine_scan(
  cache: ScanCacheEntry | null,
  terms: string[],
  operators: ParsedOperator[],
  options_key: string,
  index: Pick<CachedIndex, "built_at" | "meta">,
): boolean {
  if (!cache) return false;
  if (cache.options_key !== options_key) return false;
  if (cache.built_at !== index.built_at) return false;
  if (cache.saved_at !== (index.meta?.saved_at ?? 0)) return false;
  if (!operators_equal(cache.operators, operators)) return false;

  return cache.terms.every((prev) => terms.some((next) => next.includes(prev)));
}

