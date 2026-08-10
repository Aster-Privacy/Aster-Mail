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

import type { DecryptedEnvelope } from "@/types/email";

export const MIN_VOCABULARY_TERM_LENGTH = 4;
export const MAX_VOCABULARY_TERM_LENGTH = 24;
export const VOCABULARY_CAP = 12000;
export const VOCABULARY_PRUNE_TRIGGER = 24000;
export const VOCABULARY_BODY_CHARS = 512;

const SUBJECT_WEIGHT = 3;
const SENDER_WEIGHT = 3;
const BODY_WEIGHT = 1;

const LATIN_TERM = /^[\p{Script=Latin}][\p{Script=Latin}']*$/u;
const TERM_SEPARATOR = /[^\p{L}\p{N}']+/u;

const term_counts = new Map<string, number>();

let deletion_index: Map<string, string[]> | null = null;

export function is_vocabulary_term(term: string): boolean {
  return (
    term.length >= MIN_VOCABULARY_TERM_LENGTH &&
    term.length <= MAX_VOCABULARY_TERM_LENGTH &&
    LATIN_TERM.test(term)
  );
}

export function tokenize_for_vocabulary(text: string): string[] {
  if (!text) return [];

  return text.toLowerCase().split(TERM_SEPARATOR).filter(is_vocabulary_term);
}

function prune_vocabulary(): void {
  const ranked = Array.from(term_counts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  term_counts.clear();

  for (const [term, count] of ranked.slice(0, VOCABULARY_CAP)) {
    term_counts.set(term, count);
  }
}

export function add_vocabulary_text(text: string, weight: number): void {
  const tokens = tokenize_for_vocabulary(text);

  if (tokens.length === 0) return;

  for (const token of tokens) {
    term_counts.set(token, (term_counts.get(token) ?? 0) + weight);
  }

  deletion_index = null;

  if (term_counts.size > VOCABULARY_PRUNE_TRIGGER) {
    prune_vocabulary();
  }
}

export function add_vocabulary_entry(
  envelope: DecryptedEnvelope | null,
  search_body_text: string,
): void {
  if (envelope) {
    add_vocabulary_text(envelope.subject || "", SUBJECT_WEIGHT);
    add_vocabulary_text(envelope.from?.name || "", SENDER_WEIGHT);
  }

  if (search_body_text) {
    add_vocabulary_text(
      search_body_text.slice(0, VOCABULARY_BODY_CHARS),
      BODY_WEIGHT,
    );
  }
}

export function reset_vocabulary(): void {
  term_counts.clear();
  deletion_index = null;
}

export function vocabulary_size(): number {
  return term_counts.size;
}

export function vocabulary_count(term: string): number {
  return term_counts.get(term) ?? 0;
}

export function vocabulary_has_term(term: string): boolean {
  return term_counts.has(term);
}

export function single_deletions(term: string): string[] {
  const variants: string[] = [];

  for (let i = 0; i < term.length; i++) {
    variants.push(term.slice(0, i) + term.slice(i + 1));
  }

  return variants;
}

function ensure_deletion_index(): Map<string, string[]> {
  if (deletion_index) return deletion_index;

  const index = new Map<string, string[]>();

  const link = (key: string, term: string): void => {
    const existing = index.get(key);

    if (existing) {
      existing.push(term);

      return;
    }

    index.set(key, [term]);
  };

  for (const term of term_counts.keys()) {
    link(term, term);

    for (const variant of single_deletions(term)) {
      link(variant, term);
    }
  }

  deletion_index = index;

  return index;
}

export function release_deletion_index(): void {
  deletion_index = null;
}

export function deletion_index_size(): number {
  return deletion_index ? deletion_index.size : 0;
}

export function vocabulary_candidates(term: string): string[] {
  const index = ensure_deletion_index();
  const found = new Set<string>();

  for (const key of [term, ...single_deletions(term)]) {
    for (const candidate of index.get(key) ?? []) {
      found.add(candidate);
    }
  }

  return Array.from(found);
}
