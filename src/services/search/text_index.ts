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

const GRAM_SIZE = 3;
const MIN_TERM_LENGTH_FOR_INDEX = GRAM_SIZE;
const DEFAULT_BODY_POSTING_BUDGET = 6_000_000;

export interface TextIndexDocument {
  header_text: string;
  body_text: string;
}

function extract_grams(text: string, into: Set<string>): void {
  const len = text.length;

  if (len < GRAM_SIZE) return;

  for (let i = 0; i + GRAM_SIZE <= len; i++) {
    into.add(text.slice(i, i + GRAM_SIZE));
  }
}

function add_grams_to_map(
  grams: Set<string>,
  doc_id: number,
  map: Map<string, number[]>,
): number {
  let added = 0;

  for (const gram of grams) {
    let postings = map.get(gram);

    if (!postings) {
      postings = [];
      map.set(gram, postings);
    }
    postings.push(doc_id);
    added++;
  }

  return added;
}

export class TextIndex {
  private header_grams: Map<string, number[]> = new Map();
  private body_grams: Map<string, number[]> | null = new Map();
  private body_postings = 0;
  private readonly body_budget: number;

  doc_count = 0;
  body_indexed = true;

  constructor(body_budget: number = DEFAULT_BODY_POSTING_BUDGET) {
    this.body_budget = body_budget;
  }

  add_document(doc_id: number, doc: TextIndexDocument): void {
    this.doc_count++;

    if (doc.header_text) {
      const header_set = new Set<string>();

      extract_grams(doc.header_text, header_set);
      add_grams_to_map(header_set, doc_id, this.header_grams);
    }

    if (!this.body_indexed || !this.body_grams) return;

    if (doc.body_text) {
      const body_set = new Set<string>();

      extract_grams(doc.body_text, body_set);
      this.body_postings += add_grams_to_map(body_set, doc_id, this.body_grams);

      if (this.body_postings > this.body_budget) {
        this.body_grams = null;
        this.body_indexed = false;
        this.body_postings = 0;
      }
    }
  }

  private term_candidates(
    term: string,
    include_body: boolean,
  ): Set<number> | null {
    if (term.length < MIN_TERM_LENGTH_FOR_INDEX) return null;

    const grams = new Set<string>();

    extract_grams(term, grams);

    if (grams.size === 0) return null;

    let result: Set<number> | null = null;

    for (const gram of grams) {
      const header_postings = this.header_grams.get(gram);
      const body_postings =
        include_body && this.body_grams ? this.body_grams.get(gram) : undefined;

      if (!header_postings && !body_postings) {
        return new Set<number>();
      }

      const gram_docs = new Set<number>();

      if (header_postings) {
        for (const id of header_postings) gram_docs.add(id);
      }
      if (body_postings) {
        for (const id of body_postings) gram_docs.add(id);
      }

      if (result === null) {
        result = gram_docs;
      } else {
        const next = new Set<number>();
        const [small, large] =
          result.size <= gram_docs.size
            ? [result, gram_docs]
            : [gram_docs, result];

        for (const id of small) {
          if (large.has(id)) next.add(id);
        }
        result = next;
      }

      if (result.size === 0) return result;
    }

    return result;
  }

  candidates(terms: string[], include_body: boolean): Set<number> | null {
    if (terms.length === 0) return null;

    if (include_body && !this.body_indexed) return null;

    let result: Set<number> | null = null;

    for (const term of terms) {
      const term_set = this.term_candidates(term, include_body);

      if (term_set === null) continue;

      if (result === null) {
        result = term_set;
      } else {
        const next = new Set<number>();
        const [small, large] =
          result.size <= term_set.size
            ? [result, term_set]
            : [term_set, result];

        for (const id of small) {
          if (large.has(id)) next.add(id);
        }
        result = next;
      }

      if (result.size === 0) return result;
    }

    return result;
  }
}
