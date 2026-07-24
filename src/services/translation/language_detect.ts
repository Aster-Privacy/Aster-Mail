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
import { type LanguageCode, normalize_language } from "./engine_types";

export const MIN_DETECTION_LENGTH = 40;
export const MIN_DETECTION_CONFIDENCE = 0.62;

const MIN_STOPWORD_HIT_RATE = 0.04;
const SCRIPT_CONFIDENCE = 0.95;
const NEGATIVE_CACHE_LIMIT = 256;

export interface DetectionResult {
  language: LanguageCode;
  confidence: number;
}

const QUOTE_LINE = /^\s*(?:>|\|)+.*$/gm;
const SIGNATURE_BLOCK = /\n--\s*\n[\s\S]*$/;
const URL_OR_EMAIL =
  /(?:https?:\/\/|www\.)\S+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function strip_for_detection(text: string): string {
  return text
    .replace(QUOTE_LINE, " ")
    .replace(SIGNATURE_BLOCK, " ")
    .replace(URL_OR_EMAIL, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SCRIPT_TESTS: ReadonlyArray<{ language: LanguageCode; pattern: RegExp }> = [
  { language: "ko", pattern: /[가-힯ᄀ-ᇿ㄰-㆏]/g },
  { language: "ja", pattern: /[぀-ゟ゠-ヿ]/g },
  { language: "ar", pattern: /[؀-ۿݐ-ݿﭐ-﷿]/g },
  { language: "ru", pattern: /[Ѐ-ӿ]/g },
  { language: "zh", pattern: /[一-鿿㐀-䶿]/g },
];

const SCRIPT_SHARE_THRESHOLD = 0.1;

function detect_by_script(text: string): DetectionResult | null {
  const total = text.replace(/\s/g, "").length;

  if (total === 0) return null;

  for (const test of SCRIPT_TESTS) {
    test.pattern.lastIndex = 0;

    const matches = text.match(test.pattern);

    if (matches && matches.length / total >= SCRIPT_SHARE_THRESHOLD) {
      return { language: test.language, confidence: SCRIPT_CONFIDENCE };
    }
  }

  return null;
}

const STOPWORDS: Readonly<Record<string, readonly string[]>> = {
  en: [
    "the", "and", "you", "your", "for", "with", "this", "that", "have", "from",
    "please", "will", "not", "are", "was", "been", "our", "we", "can", "if",
  ],
  de: [
    "und", "der", "die", "das", "sie", "ist", "nicht", "mit", "für", "ein",
    "eine", "auf", "wir", "ihre", "haben", "bitte", "wird", "auch", "dass", "von",
  ],
  es: [
    "que", "los", "las", "una", "por", "para", "con", "del", "está", "como",
    "más", "pero", "este", "esta", "sus", "puede", "hemos", "gracias", "ser", "todo",
    "hola", "puedes", "tus", "tenemos", "nunca", "ademas", "además", "muy",
    "también", "tambien", "desde", "hasta", "cuando", "donde", "porque",
    "estamos", "somos", "tienen", "saludo", "usted",
  ],
  fr: [
    "les", "des", "une", "vous", "pour", "avec", "dans", "sur", "est", "pas",
    "votre", "nous", "que", "qui", "plus", "être", "cette", "sont", "merci", "par",
  ],
  it: [
    "che", "non", "per", "con", "una", "sono", "questo", "come", "della", "dei",
    "alla", "più", "tuo", "vostro", "grazie", "essere", "anche", "nella", "delle", "gli",
  ],
  nl: [
    "een", "het", "van", "niet", "voor", "met", "aan", "zijn", "wij", "uw",
    "dat", "dit", "maar", "ook", "worden", "heeft", "kunt", "bedankt", "onze", "naar",
  ],
  pl: [
    "nie", "jest", "się", "oraz", "dla", "przez", "jako", "tego", "które",
    "wszystkie", "twoje", "proszę", "można", "będzie", "jeśli", "aby", "przy", "tym", "już",
  ],
  pt: [
    "que", "não", "para", "com", "uma", "por", "seu", "sua", "está", "como",
    "mais", "você", "isso", "pelo", "obrigado", "ser", "nós", "são", "das", "dos",
    "esta", "este", "todo", "pode",
  ],
  tr: [
    "için", "bir", "ile", "olan", "daha", "veya", "bu", "ve", "size", "olarak",
    "sonra", "kadar", "üzere", "değil", "gibi", "lütfen", "sizin", "her", "çok", "var",
  ],
};

const DISCRIMINATIVE_STOPWORDS: ReadonlyMap<string, LanguageCode> = (() => {
  const owners = new Map<string, LanguageCode | null>();

  for (const [code, words] of Object.entries(STOPWORDS)) {
    const language = normalize_language(code);

    if (!language) continue;

    for (const word of words) {
      owners.set(word, owners.has(word) ? null : language);
    }
  }

  const discriminative = new Map<string, LanguageCode>();

  for (const [word, language] of owners) {
    if (language) discriminative.set(word, language);
  }

  return discriminative;
})();

const TOKEN_SPLIT = /[^\p{L}]+/u;
const TRAILING_WEIGHT_FLOOR = 0.35;

function position_weight(index: number, count: number): number {
  if (count <= 1) return 1;

  const progress = index / (count - 1);

  return 1 - (1 - TRAILING_WEIGHT_FLOOR) * progress;
}

function detect_by_stopwords(text: string): DetectionResult | null {
  const tokens = text.toLowerCase().split(TOKEN_SPLIT).filter(Boolean);

  if (tokens.length < 8) return null;

  const weighted = new Map<LanguageCode, number>();
  let top_raw_hits = 0;
  const raw_hits = new Map<LanguageCode, number>();

  for (let index = 0; index < tokens.length; index += 1) {
    const language = DISCRIMINATIVE_STOPWORDS.get(tokens[index]);

    if (!language) continue;

    const next_raw = (raw_hits.get(language) ?? 0) + 1;

    raw_hits.set(language, next_raw);
    if (next_raw > top_raw_hits) top_raw_hits = next_raw;

    weighted.set(
      language,
      (weighted.get(language) ?? 0) + position_weight(index, tokens.length),
    );
  }

  let top_language: LanguageCode | null = null;
  let top_weight = 0;
  let second_weight = 0;

  for (const [language, weight] of weighted) {
    if (weight > top_weight) {
      second_weight = top_weight;
      top_weight = weight;
      top_language = language;
    } else if (weight > second_weight) {
      second_weight = weight;
    }
  }

  if (!top_language || top_raw_hits / tokens.length < MIN_STOPWORD_HIT_RATE) {
    return null;
  }

  const confidence = top_weight / (top_weight + second_weight);

  return { language: top_language, confidence };
}

export function detect_language(text: string): DetectionResult | null {
  const stripped = strip_for_detection(text);

  if (stripped.length < MIN_DETECTION_LENGTH) return null;

  return detect_by_script(stripped) ?? detect_by_stopwords(stripped);
}

const negative_cache = new Set<string>();

function cache_key(message_id: string, accepted: readonly LanguageCode[]): string {
  return `${message_id}|${[...accepted].sort().join(",")}`;
}

function remember_negative(key: string): void {
  if (negative_cache.size >= NEGATIVE_CACHE_LIMIT) {
    const oldest = negative_cache.values().next();

    if (!oldest.done) negative_cache.delete(oldest.value);
  }

  negative_cache.add(key);
}

export function clear_detection_cache(): void {
  negative_cache.clear();
}

export function detect_translatable_language(
  message_id: string,
  text: string,
  accepted: readonly LanguageCode[],
): DetectionResult | null {
  const key = cache_key(message_id, accepted);

  if (negative_cache.has(key)) return null;

  const stripped = strip_for_detection(text);

  if (stripped.length < MIN_DETECTION_LENGTH) return null;

  const result = detect_by_script(stripped) ?? detect_by_stopwords(stripped);

  if (!result || accepted.includes(result.language)) {
    remember_negative(key);

    return null;
  }

  if (result.confidence < MIN_DETECTION_CONFIDENCE) return null;

  return result;
}

export type TranslationMode = "off" | "ask" | "always";

export type TranslationDecision =
  | { kind: "idle" }
  | { kind: "offer"; language: LanguageCode }
  | { kind: "translate"; language: LanguageCode };

export interface TranslationDecisionInput {
  mode: TranslationMode;
  translatable: boolean;
  message_id: string;
  body_text: string;
  target: LanguageCode;
  configured_accepted: readonly LanguageCode[];
  never_languages: ReadonlySet<LanguageCode>;
}

export function detection_accepted_set(
  target: LanguageCode,
  configured_accepted: readonly LanguageCode[],
): LanguageCode[] {
  const accepted: LanguageCode[] = [target];

  for (const code of configured_accepted) {
    if (!accepted.includes(code)) accepted.push(code);
  }

  return accepted;
}

export interface KeepTranslationInput {
  mode: TranslationMode;
  translatable: boolean;
  source: LanguageCode | null;
  target: LanguageCode;
  configured_accepted: readonly LanguageCode[];
  never_languages: ReadonlySet<LanguageCode>;
}

export function should_keep_translation(input: KeepTranslationInput): boolean {
  if (input.mode === "off" || !input.translatable || !input.source) {
    return false;
  }

  if (input.never_languages.has(input.source)) return false;

  const accepted =
    input.mode === "always"
      ? detection_accepted_set(input.target, [])
      : detection_accepted_set(input.target, input.configured_accepted);

  return !accepted.includes(input.source);
}

export function decide_translation(
  input: TranslationDecisionInput,
): TranslationDecision {
  if (input.mode === "off" || !input.translatable) return { kind: "idle" };

  const accepted =
    input.mode === "always"
      ? detection_accepted_set(input.target, [])
      : detection_accepted_set(input.target, input.configured_accepted);

  const detected = detect_translatable_language(
    input.message_id,
    input.body_text,
    accepted,
  );

  if (!detected || input.never_languages.has(detected.language)) {
    return { kind: "idle" };
  }

  return input.mode === "always"
    ? { kind: "translate", language: detected.language }
    : { kind: "offer", language: detected.language };
}
