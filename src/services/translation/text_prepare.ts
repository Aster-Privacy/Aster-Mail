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
import type { LanguageCode } from "./engine_types";

export interface ProtectedText {
  masked: string;
  entities: string[];
}

export interface RestoreResult {
  text: string;
  missing: number;
}

const URL_PATTERN = "(?:https?:\\/\\/|www\\.)[^\\s<>()\\[\\]]+";
const EMAIL_PATTERN = "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}";
const BASE64_PATTERN = "[A-Za-z0-9+/]{24,}={0,2}";
const CURRENCY_PATTERN =
  "(?:[$\\u20ac\\u00a3\\u00a5\\u20bd\\u20a9\\u20b9]\\s?\\d[\\d.,]*|\\d[\\d.,]*\\s?(?:USD|EUR|GBP|JPY|CHF|CAD|AUD|SEK|NOK|DKK|PLN|RUB|TRY|CNY|KRW))";
const ISO_DATE_PATTERN = "\\d{4}-\\d{2}-\\d{2}(?:[T ]\\d{2}:\\d{2}(?::\\d{2})?)?";
const NUMERIC_DATE_PATTERN = "\\d{1,2}[\\/.\\-]\\d{1,2}[\\/.\\-]\\d{2,4}";
const TIME_PATTERN = "\\d{1,2}:\\d{2}(?::\\d{2})?\\s?(?:[AaPp]\\.?[Mm]\\.?)?";
const PHONE_PATTERN = "\\+?\\d[\\d\\s().-]{7,}\\d";
const ORDER_ID_PATTERN = "#?\\b[A-Z0-9]{2,}(?:-[A-Z0-9]{2,}){1,}\\b";
const TRACKING_PATTERN = "\\b(?=[A-Z0-9]*\\d)[A-Z0-9]{8,}\\b";
const GROUPED_NUMBER_PATTERN = "\\b\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?\\b";
const SEPARATED_CODE_PATTERN = "\\b\\d{3,4}[ -]\\d{3,4}\\b";
const CODE_PATTERN = "\\b\\d{4,10}\\b";

const PROTECTED_PATTERN = new RegExp(
  [
    URL_PATTERN,
    EMAIL_PATTERN,
    ISO_DATE_PATTERN,
    NUMERIC_DATE_PATTERN,
    CURRENCY_PATTERN,
    TIME_PATTERN,
    PHONE_PATTERN,
    BASE64_PATTERN,
    ORDER_ID_PATTERN,
    TRACKING_PATTERN,
    GROUPED_NUMBER_PATTERN,
    SEPARATED_CODE_PATTERN,
    CODE_PATTERN,
  ].join("|"),
  "g",
);

const TOKEN_PREFIX = "ZQX";
const TOKEN_SUFFIX = "QZX";

function index_to_letters(index: number): string {
  let value = index + 1;
  let out = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;

    out = String.fromCharCode(65 + remainder) + out;
    value = Math.floor((value - 1) / 26);
  }

  return out;
}

function letters_to_index(letters: string): number {
  let value = 0;

  for (const character of letters.toUpperCase()) {
    value = value * 26 + (character.charCodeAt(0) - 64);
  }

  return value - 1;
}

function token_for(index: number): string {
  return `${TOKEN_PREFIX}${index_to_letters(index)}${TOKEN_SUFFIX}`;
}

const TOKEN_PATTERN = /ZQX\s*([A-Za-z]{1,4})\s*QZX/gi;

export function protect_entities(text: string): ProtectedText {
  const entities: string[] = [];

  const masked = text.replace(PROTECTED_PATTERN, (match) => {
    const index = entities.length;

    entities.push(match);

    return token_for(index);
  });

  return { masked, entities };
}

export function restore_entities(
  masked: string,
  entities: string[],
): RestoreResult {
  const counts = new Array<number>(entities.length).fill(0);
  const order: number[] = [];
  let stray = 0;

  const text = masked.replace(TOKEN_PATTERN, (match, letters: string) => {
    const index = letters_to_index(letters);

    if (!Number.isInteger(index) || index < 0 || index >= entities.length) {
      stray += 1;

      return match;
    }

    counts[index] += 1;
    order.push(index);

    return entities[index];
  });

  let missing = stray;

  for (const count of counts) {
    if (count !== 1) missing += 1;
  }

  for (let position = 1; position < order.length; position += 1) {
    if (order[position] <= order[position - 1]) {
      missing += 1;
      break;
    }
  }

  return { text, missing };
}

export interface Segment {
  text: string;
  node_index: number;
}

export interface SegmentedNode {
  node_index: number;
  segments: string[];
}

interface SentenceSegment {
  segment: string;
}

interface SentenceSegmenter {
  segment(input: string): Iterable<SentenceSegment>;
}

type SentenceSegmenterConstructor = new (
  locale: string | undefined,
  options: { granularity: "sentence" },
) => SentenceSegmenter;

function get_segmenter_constructor(): SentenceSegmenterConstructor | null {
  if (typeof Intl === "undefined") return null;

  const candidate = (Intl as unknown as { Segmenter?: unknown }).Segmenter;

  return typeof candidate === "function"
    ? (candidate as SentenceSegmenterConstructor)
    : null;
}

let sentence_segmenter: SentenceSegmenter | null | undefined;

function get_sentence_segmenter(locale: LanguageCode): SentenceSegmenter | null {
  const constructor = get_segmenter_constructor();

  if (!constructor) return null;

  try {
    return new constructor(locale, { granularity: "sentence" });
  } catch {
    if (sentence_segmenter === undefined) {
      try {
        sentence_segmenter = new constructor(undefined, {
          granularity: "sentence",
        });
      } catch {
        sentence_segmenter = null;
      }
    }

    return sentence_segmenter;
  }
}

export function segment_sentences(text: string, locale: LanguageCode): string[] {
  if (!text.trim()) return [];

  const segmenter = get_sentence_segmenter(locale);

  if (!segmenter) return [text];

  const parts: string[] = [];

  for (const entry of segmenter.segment(text)) {
    if (entry.segment.trim()) parts.push(entry.segment);
  }

  return parts.length > 0 ? parts : [text];
}

export function segment_nodes(
  texts: string[],
  locale: LanguageCode,
): SegmentedNode[] {
  return texts.map((text, node_index) => ({
    node_index,
    segments: segment_sentences(text, locale),
  }));
}

export function flatten_segments(nodes: SegmentedNode[]): Segment[] {
  const flat: Segment[] = [];

  for (const node of nodes) {
    for (const text of node.segments) {
      flat.push({ text, node_index: node.node_index });
    }
  }

  return flat;
}

export function regroup_segments(
  nodes: SegmentedNode[],
  translated: string[],
): string[] {
  const output: string[] = [];
  let cursor = 0;

  for (const node of nodes) {
    const count = node.segments.length;

    output.push(translated.slice(cursor, cursor + count).join(""));
    cursor += count;
  }

  return output;
}

export function expected_segment_count(nodes: SegmentedNode[]): number {
  return nodes.reduce((total, node) => total + node.segments.length, 0);
}
