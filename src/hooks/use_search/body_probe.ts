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
import type { DecryptedIndexEntry } from "./types";
import type { ParsedOperator } from "@/utils/search_operators";
import type { SnapshotReader } from "@/services/search_index_store";

import {
  collect_grams,
  gram_present,
  type GramFilter,
} from "@/services/search_chunk_filter";
import {
  sorted_has_prefix,
  split_search_words,
} from "@/services/search_body_terms";
import { fold_search_text } from "@/utils/search_fold";

export type BodyChunkVerdict = "skip" | "scan";

export interface BodyProbe {
  words: readonly string[];
  matches(term: string, entry_id: string, entry: DecryptedIndexEntry): boolean;
  load_chunk(
    reader: Pick<SnapshotReader, "read_body_hits">,
    chunk_id: number,
    header: GramFilter | null,
  ): Promise<BodyChunkVerdict>;
}

function probe_term_key(term: string): string {
  return fold_search_text(term) || term.toLowerCase();
}

export function create_body_probe(
  terms: readonly string[],
  operators: readonly ParsedOperator[],
): BodyProbe | null {
  const text_operators = operators.filter((op) => op.type === "text");
  const required = [
    ...terms,
    ...text_operators.filter((op) => !op.negated).map((op) => op.value),
  ];
  const excluded = text_operators
    .filter((op) => op.negated)
    .map((op) => op.value);
  const words_by_term = new Map<string, string[]>();
  const required_keys = new Set<string>();

  for (const source of [...required, ...excluded]) {
    const key = probe_term_key(source);

    if (!words_by_term.has(key)) {
      words_by_term.set(key, split_search_words(key));
    }
  }
  for (const source of required) required_keys.add(probe_term_key(source));

  const query_terms = [...words_by_term].filter(([key]) =>
    required_keys.has(key),
  );
  const words = [
    ...new Set([...words_by_term.values()].flatMap((list) => list)),
  ];

  if (words.length === 0) return null;

  const hits = new Map<string, Set<string>>();

  const words_for = (term: string): string[] => {
    const key = probe_term_key(term);
    let found = words_by_term.get(key);

    if (!found) {
      found = split_search_words(key);
      words_by_term.set(key, found);
    }

    return found;
  };

  const header_may_hold = (filter: GramFilter | null, term: string) => {
    if (!filter) return true;

    const grams = new Set<string>();

    collect_grams(term, grams);

    for (const gram of grams) {
      if (!gram_present(filter, gram)) return false;
    }

    return true;
  };

  return {
    words,
    matches(term, entry_id, entry) {
      const term_words = words_for(term);

      if (term_words.length === 0) return false;

      return term_words.every(
        (word) =>
          hits.get(word)?.has(entry_id) === true ||
          (!!entry.index_terms && sorted_has_prefix(entry.index_terms, word)),
      );
    },
    async load_chunk(reader, chunk_id, header) {
      const chunk_hits = await reader.read_body_hits(chunk_id, words);

      if (!chunk_hits) return "scan";

      for (const [word, ids] of chunk_hits) {
        if (ids.size === 0) continue;

        const known = hits.get(word);

        if (known) for (const id of ids) known.add(id);
        else hits.set(word, new Set(ids));
      }

      if (query_terms.some(([, term_words]) => term_words.length === 0)) {
        return "scan";
      }

      for (const [term, term_words] of query_terms) {
        const body_may_hold = term_words.every(
          (word) => (chunk_hits.get(word)?.size ?? 0) > 0,
        );

        if (!body_may_hold && !header_may_hold(header, term)) return "skip";
      }

      return "scan";
    },
  };
}
