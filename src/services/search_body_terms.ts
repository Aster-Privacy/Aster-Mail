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
import { fold_search_text } from "@/utils/search_fold";

export const BODY_TERM_BUCKETS = 32;
export const MIN_BODY_TERM_CHARS = 2;
export const MAX_BODY_TERM_CHARS = 40;
export const MAX_BODY_TERMS_PER_ENTRY = 4096;

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;

export interface StoredPostings {
  t: string[];
  p: number[][];
}

export interface ParsedPostings {
  terms: string[];
  slots: number[][];
}

export function split_search_words(text: string): string[] {
  if (!text) return [];

  return fold_search_text(text)
    .split(WORD_SPLIT)
    .filter(
      (word) =>
        word.length >= MIN_BODY_TERM_CHARS &&
        word.length <= MAX_BODY_TERM_CHARS,
    );
}

export function build_body_terms(
  body_text: string,
  attachment_names: readonly string[] = [],
): string[] {
  const unique = new Set<string>();

  for (const source of [body_text, ...attachment_names]) {
    for (const word of split_search_words(source)) {
      if (unique.size >= MAX_BODY_TERMS_PER_ENTRY) break;
      unique.add(word);
    }
  }

  return [...unique].sort();
}

export function term_bucket(word: string): number {
  const a = word.charCodeAt(0) || 0;
  const b = word.charCodeAt(1) || 0;

  return ((a * 31 + b) >>> 0) % BODY_TERM_BUCKETS;
}

function lower_bound(sorted: readonly string[], value: string): number {
  let low = 0;
  let high = sorted.length;

  while (low < high) {
    const mid = (low + high) >>> 1;

    if (sorted[mid] < value) low = mid + 1;
    else high = mid;
  }

  return low;
}

export function sorted_has_prefix(
  sorted: readonly string[],
  prefix: string,
): boolean {
  const at = lower_bound(sorted, prefix);

  return at < sorted.length && sorted[at].startsWith(prefix);
}

export function build_chunk_postings(
  entry_terms: readonly (readonly string[] | undefined)[],
): Map<number, StoredPostings> {
  const by_bucket = new Map<number, Map<string, number[]>>();

  entry_terms.forEach((terms, slot) => {
    if (!terms) return;

    for (const term of terms) {
      const bucket = term_bucket(term);
      let postings = by_bucket.get(bucket);

      if (!postings) {
        postings = new Map();
        by_bucket.set(bucket, postings);
      }

      const slots = postings.get(term);

      if (slots) slots.push(slot);
      else postings.set(term, [slot]);
    }
  });

  const stored = new Map<number, StoredPostings>();

  for (const [bucket, postings] of by_bucket) {
    const terms = [...postings.keys()].sort();

    stored.set(bucket, {
      t: terms,
      p: terms.map((term) => delta_encode(postings.get(term)!)),
    });
  }

  return stored;
}

function delta_encode(slots: number[]): number[] {
  const encoded: number[] = [];
  let previous = 0;

  for (const slot of slots) {
    encoded.push(slot - previous);
    previous = slot;
  }

  return encoded;
}

function delta_decode(encoded: number[]): number[] {
  const slots: number[] = [];
  let current = 0;

  for (const step of encoded) {
    current += step;
    slots.push(current);
  }

  return slots;
}

export function parse_postings(
  stored: StoredPostings | null | undefined,
): ParsedPostings | null {
  if (
    !stored ||
    !Array.isArray(stored.t) ||
    !Array.isArray(stored.p) ||
    stored.t.length !== stored.p.length
  ) {
    return null;
  }

  return { terms: stored.t, slots: stored.p };
}

export function postings_prefix_slots(
  postings: ParsedPostings | null,
  prefix: string,
): Set<number> {
  const found = new Set<number>();

  if (!postings) return found;

  for (
    let i = lower_bound(postings.terms, prefix);
    i < postings.terms.length && postings.terms[i].startsWith(prefix);
    i++
  ) {
    for (const slot of delta_decode(postings.slots[i])) found.add(slot);
  }

  return found;
}

export function drop_postings_slots(
  stored: StoredPostings,
  dropped: ReadonlySet<number>,
): StoredPostings {
  const terms: string[] = [];
  const slots: number[][] = [];

  stored.t.forEach((term, i) => {
    const kept = delta_decode(stored.p[i]).filter((s) => !dropped.has(s));

    if (kept.length === 0) return;
    terms.push(term);
    slots.push(delta_encode(kept));
  });

  return { t: terms, p: slots };
}

export function query_body_words(terms: readonly string[]): string[][] {
  return terms.map((term) => split_search_words(term));
}
