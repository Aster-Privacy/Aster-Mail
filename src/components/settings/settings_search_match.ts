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

export interface SearchFieldTexts {
  labels: string[];
  keywords: string[];
  context: string[];
  descriptions: string[];
}

interface PreparedField {
  texts: string[];
  words: string[];
}

export interface PreparedSearchFields {
  labels: PreparedField;
  keywords: PreparedField;
  context: PreparedField;
  descriptions: PreparedField;
}

type FieldName = keyof PreparedSearchFields;

const FIELD_WEIGHTS: Record<FieldName, number> = {
  labels: 4,
  keywords: 3,
  context: 2,
  descriptions: 1,
};

const STRENGTH_EXACT = 1;
const STRENGTH_PREFIX = 0.8;
const STRENGTH_SUBSTRING = 0.6;
const STRENGTH_TYPO = 0.4;
const STRENGTH_TYPO_PREFIX = 0.35;

const SCORE_LABEL_EXACT = 1000;
const SCORE_LABEL_PREFIX = 900;
const SCORE_LABEL_PHRASE = 800;
const SCORE_KEYWORD_EXACT = 700;
const SCORE_KEYWORD_PREFIX = 650;
const SCORE_WORDS_BASE = 100;
const SCORE_WORDS_SCALE = 100;

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;
const PLACEHOLDER = /\{\{[^}]*\}\}|\{[^}]*\}/g;
const NON_LATIN = /[^ -ɏ]/u;

export function normalize_search_text(value: string): string {
  return fold_search_text(value.replace(PLACEHOLDER, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function split_search_words(value: string): string[] {
  return value.split(WORD_SPLIT).filter((word) => word.length > 0);
}

export function is_searchable_query(query: string): boolean {
  const normalized = normalize_search_text(query);

  if (normalized.length >= 2) return true;

  return normalized.length === 1 && NON_LATIN.test(normalized);
}

export function damerau_levenshtein(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: number[][] = [];

  for (let i = 0; i < rows; i++) {
    table.push(new Array<number>(cols).fill(0));
    table[i][0] = i;
  }
  for (let j = 0; j < cols; j++) table[0][j] = j;

  for (let i = 1; i < rows; i++) {
    let row_min = Number.POSITIVE_INFINITY;

    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        table[i - 1][j] + 1,
        table[i][j - 1] + 1,
        table[i - 1][j - 1] + cost,
      );

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, table[i - 2][j - 2] + 1);
      }
      table[i][j] = value;
      row_min = Math.min(row_min, value);
    }
    if (row_min > limit) return limit + 1;
  }

  return table[a.length][b.length];
}

export function typo_limit(word: string): number {
  if (NON_LATIN.test(word)) return 0;
  if (word.length >= 8) return 2;
  if (word.length >= 4) return 1;

  return 0;
}

function prepare_field(values: string[]): PreparedField {
  const texts: string[] = [];
  const words = new Set<string>();

  for (const value of values) {
    const normalized = normalize_search_text(value);

    if (!normalized) continue;
    texts.push(normalized);
    for (const word of split_search_words(normalized)) words.add(word);
  }

  return { texts, words: [...words] };
}

export function prepare_search_fields(
  fields: SearchFieldTexts,
): PreparedSearchFields {
  return {
    labels: prepare_field(fields.labels),
    keywords: prepare_field(
      fields.keywords.flatMap((value) => value.split(/[,،、，]/)),
    ),
    context: prepare_field(fields.context),
    descriptions: prepare_field(fields.descriptions),
  };
}

function word_strength(query_word: string, field: PreparedField): number {
  let best = 0;
  const limit = typo_limit(query_word);
  const allow_substring = query_word.length >= 3 || NON_LATIN.test(query_word);

  for (const word of field.words) {
    if (word === query_word) return STRENGTH_EXACT;
    if (word.startsWith(query_word)) {
      best = Math.max(best, STRENGTH_PREFIX);
      continue;
    }
    if (best >= STRENGTH_SUBSTRING || limit === 0) continue;
    if (damerau_levenshtein(query_word, word, limit) <= limit) {
      best = Math.max(best, STRENGTH_TYPO);
    } else if (
      word.length > query_word.length &&
      damerau_levenshtein(
        query_word,
        word.slice(0, query_word.length),
        limit,
      ) <= limit
    ) {
      best = Math.max(best, STRENGTH_TYPO_PREFIX);
    }
  }

  if (best < STRENGTH_SUBSTRING && allow_substring) {
    if (field.texts.some((text) => text.includes(query_word))) {
      best = Math.max(best, STRENGTH_SUBSTRING);
    }
  }

  return best;
}

function phrase_score(query: string, fields: PreparedSearchFields): number {
  let score = 0;

  for (const text of fields.labels.texts) {
    if (text === query) return SCORE_LABEL_EXACT;
    if (text.startsWith(query)) score = Math.max(score, SCORE_LABEL_PREFIX);
    else if (text.includes(query)) score = Math.max(score, SCORE_LABEL_PHRASE);
  }
  if (score > 0) return score;

  for (const text of fields.keywords.texts) {
    if (text === query) return SCORE_KEYWORD_EXACT;
    if (text.startsWith(query)) score = Math.max(score, SCORE_KEYWORD_PREFIX);
  }

  return score;
}

export function score_search_fields(
  query: string,
  fields: PreparedSearchFields,
): number {
  const normalized = normalize_search_text(query);

  if (!normalized) return 0;

  const phrase = phrase_score(normalized, fields);

  if (phrase > 0) return phrase;

  const query_words = split_search_words(normalized);

  if (query_words.length === 0) return 0;

  let total = 0;

  for (const query_word of query_words) {
    let best = 0;

    for (const name of Object.keys(FIELD_WEIGHTS) as FieldName[]) {
      const strength = word_strength(query_word, fields[name]);

      best = Math.max(best, strength * FIELD_WEIGHTS[name]);
    }
    if (best === 0) return 0;
    total += best;
  }

  return SCORE_WORDS_BASE + (total / query_words.length) * SCORE_WORDS_SCALE;
}
