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

import {
  is_vocabulary_term,
  release_deletion_index,
  vocabulary_candidates,
  vocabulary_count,
  vocabulary_has_term,
} from "./vocabulary";

export const MIN_CORRECTABLE_TERM_LENGTH = 4;
export const LONG_TERM_LENGTH = 7;
export const MAX_EDIT_DISTANCE_SHORT = 1;
export const MAX_EDIT_DISTANCE_LONG = 2;
export const MIN_CANDIDATE_COUNT = 10;
export const MIN_CORRECTED_RESULTS = 3;

const NEVER_CORRECT_KEY = "aster_search_never_correct";
const NEVER_CORRECT_MAX_TERMS = 200;

export interface QueryCorrection {
  original_query: string;
  corrected_query: string;
  original_term: string;
  corrected_term: string;
}

export function max_edit_distance_for(term: string): number {
  return term.length >= LONG_TERM_LENGTH
    ? MAX_EDIT_DISTANCE_LONG
    : MAX_EDIT_DISTANCE_SHORT;
}

export function damerau_levenshtein(
  a: string,
  b: string,
  limit: number,
): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  let previous_previous: number[] = [];
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current: number[] = [];

  for (let i = 1; i <= a.length; i++) {
    current = new Array(b.length + 1);
    current[0] = i;

    let row_best = current[0];

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      let value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, previous_previous[j - 2] + 1);
      }

      current[j] = value;

      if (value < row_best) row_best = value;
    }

    if (row_best > limit) return limit + 1;

    previous_previous = previous;
    previous = current;
  }

  return previous[b.length];
}

export function load_never_correct_terms(): Set<string> {
  try {
    const raw = localStorage.getItem(NEVER_CORRECT_KEY);

    if (!raw) return new Set();

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) return new Set();

    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

export function remember_never_correct_term(term: string): void {
  const normalized = term.trim().toLowerCase();

  if (!normalized) return;

  try {
    const terms = load_never_correct_terms();

    terms.add(normalized);

    const bounded = Array.from(terms).slice(-NEVER_CORRECT_MAX_TERMS);

    localStorage.setItem(NEVER_CORRECT_KEY, JSON.stringify(bounded));
  } catch {
    return;
  }
}

export function clear_never_correct_terms(): void {
  try {
    localStorage.removeItem(NEVER_CORRECT_KEY);
  } catch {
    return;
  }
}

export function is_correctable_term(
  term: string,
  never_correct: Set<string>,
): boolean {
  if (term.length < MIN_CORRECTABLE_TERM_LENGTH) return false;
  if (!is_vocabulary_term(term)) return false;
  if (never_correct.has(term)) return false;
  if (vocabulary_has_term(term)) return false;

  return true;
}

export function suggest_term_correction(term: string): string | null {
  const limit = max_edit_distance_for(term);

  let best: { term: string; count: number; distance: number } | null = null;

  for (const candidate of vocabulary_candidates(term)) {
    if (candidate === term) continue;

    const count = vocabulary_count(candidate);

    if (count < MIN_CANDIDATE_COUNT) continue;

    const distance = damerau_levenshtein(term, candidate, limit);

    if (distance > limit) continue;

    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && count > best.count)
    ) {
      best = { term: candidate, count, distance };
    }
  }

  return best ? best.term : null;
}

function rewrite_query(
  query: string,
  original_term: string,
  corrected_term: string,
): string {
  let replaced = false;

  return query
    .split(/(\s+)/)
    .map((chunk) => {
      if (replaced) return chunk;
      if (!chunk.trim()) return chunk;
      if (chunk.includes(":") || chunk.includes('"')) return chunk;
      if (chunk.toLowerCase() !== original_term) return chunk;

      replaced = true;

      return corrected_term;
    })
    .join("");
}

export function suggest_query_correction(
  query: string,
  terms: string[],
): QueryCorrection | null {
  const never_correct = load_never_correct_terms();

  try {
    for (const term of terms) {
      if (!is_correctable_term(term, never_correct)) continue;

      const corrected_term = suggest_term_correction(term);

      if (!corrected_term) continue;

      const corrected_query = rewrite_query(query, term, corrected_term);

      if (corrected_query === query) continue;

      return {
        original_query: query,
        corrected_query,
        original_term: term,
        corrected_term,
      };
    }

    return null;
  } finally {
    release_deletion_index();
  }
}
