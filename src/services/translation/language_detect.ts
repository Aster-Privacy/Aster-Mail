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

import { is_js_whitespace, trim_start_index } from "@/lib/linear_trim";

export const MIN_DETECTION_LENGTH = 40;
export const MIN_CJK_DETECTION_LENGTH = 12;
export const MIN_DETECTION_CONFIDENCE = 0.62;

const MIN_STOPWORD_HIT_RATE = 0.04;
const MIN_STOPWORD_HITS = 2;
const SCRIPT_CONFIDENCE = 0.95;
const NEGATIVE_CACHE_LIMIT = 256;

export interface DetectionResult {
  language: LanguageCode;
  confidence: number;
}

const SIGNATURE_BLOCK = /\n--\s*\n[\s\S]*$/;
const URL_PREFIXES = ["https://", "http://", "www."];

function is_line_terminator(code: number): boolean {
  return code === 0x0a || code === 0x0d || code === 0x2028 || code === 0x2029;
}

function next_line_terminator(text: string, from: number): number {
  let index = from;

  while (index < text.length && !is_line_terminator(text.charCodeAt(index))) {
    index += 1;
  }

  return index;
}

export function replace_quote_lines(text: string, replacement: string): string {
  let result = "";
  let copied = 0;
  let line_start = 0;

  while (line_start <= text.length) {
    const content = trim_start_index(text, is_js_whitespace, line_start);

    if (content >= text.length) break;

    const code = text.charCodeAt(content);
    const line_end = next_line_terminator(text, content);

    if (code === 0x3e || code === 0x7c) {
      result += text.slice(copied, line_start) + replacement;
      copied = line_end;
    }

    line_start = line_end + 1;
  }

  return copied === 0 ? text : result + text.slice(copied);
}

function is_email_local_code(code: number): boolean {
  return (
    is_ascii_alphanumeric(code) ||
    code === 0x2e ||
    code === 0x5f ||
    code === 0x25 ||
    code === 0x2b ||
    code === 0x2d
  );
}

function is_email_domain_code(code: number): boolean {
  return is_ascii_alphanumeric(code) || code === 0x2e || code === 0x2d;
}

function is_ascii_letter(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

function is_ascii_alphanumeric(code: number): boolean {
  return is_ascii_letter(code) || (code >= 0x30 && code <= 0x39);
}

function url_match_end(text: string, at: number): number {
  for (const prefix of URL_PREFIXES) {
    if (!text.startsWith(prefix, at)) continue;

    const body_start = at + prefix.length;
    const body_end = trim_start_index(
      text,
      (code) => !is_js_whitespace(code),
      body_start,
    );

    return body_end > body_start ? body_end : -1;
  }

  return -1;
}

function email_domain_end(text: string, domain_start: number): number {
  const run_end = trim_start_index(text, is_email_domain_code, domain_start);

  for (let dot = run_end - 3; dot > domain_start; dot -= 1) {
    if (
      text.charCodeAt(dot) === 0x2e &&
      is_ascii_letter(text.charCodeAt(dot + 1)) &&
      is_ascii_letter(text.charCodeAt(dot + 2))
    ) {
      return trim_start_index(text, is_ascii_letter, dot + 1);
    }
  }

  return -1;
}

export function replace_urls_and_emails(
  text: string,
  replacement: string,
): string {
  let result = "";
  let copied = 0;
  let local_run_end = -1;
  let local_match_end = -1;
  let position = 0;

  while (position < text.length) {
    let match_end = url_match_end(text, position);

    if (match_end === -1) {
      if (position >= local_run_end) {
        local_run_end = trim_start_index(text, is_email_local_code, position);
        local_match_end =
          local_run_end > position && text.charCodeAt(local_run_end) === 0x40
            ? email_domain_end(text, local_run_end + 1)
            : -1;
      }

      if (local_run_end > position) match_end = local_match_end;
    }

    if (match_end === -1) {
      position += 1;
      continue;
    }

    result += text.slice(copied, position) + replacement;
    copied = match_end;
    position = match_end;
  }

  return copied === 0 ? text : result + text.slice(copied);
}

export function strip_for_detection(text: string): string {
  return replace_urls_and_emails(
    replace_quote_lines(text, " ").replace(SIGNATURE_BLOCK, " "),
    " ",
  )
    .replace(/\s+/g, " ")
    .trim();
}

const SCRIPT_TESTS: ReadonlyArray<{ language: LanguageCode; pattern: RegExp }> =
  [
    { language: "ko", pattern: /[가-힯ᄀ-ᇿ㄰-㆏]/g },
    { language: "ja", pattern: /[぀-ゟ゠-ヿ]/g },
    { language: "ar", pattern: /[؀-ۿݐ-ݿﭐ-﷿]/g },
    { language: "ru", pattern: /[Ѐ-ӿ]/g },
    { language: "zh", pattern: /[一-鿿㐀-䶿]/g },
  ];

const SCRIPT_SHARE_THRESHOLD = 0.1;
const KANA_JA_FLOOR = 0.05;
const JA_KANA_PATTERN = /[぀-ゟ゠-ヿ]/g;

function detect_by_script(text: string): DetectionResult | null {
  const total = text.replace(/\s/g, "").length;

  if (total === 0) return null;

  let best: LanguageCode | null = null;
  let best_share = 0;

  for (const test of SCRIPT_TESTS) {
    test.pattern.lastIndex = 0;

    const matches = text.match(test.pattern);
    const share = matches ? matches.length / total : 0;

    if (share > best_share) {
      best_share = share;
      best = test.language;
    }
  }

  if (!best || best_share < SCRIPT_SHARE_THRESHOLD) return null;

  if (best === "zh") {
    JA_KANA_PATTERN.lastIndex = 0;

    const kana = text.match(JA_KANA_PATTERN);
    const kana_share = kana ? kana.length / total : 0;

    if (kana_share >= KANA_JA_FLOOR) {
      return { language: "ja", confidence: SCRIPT_CONFIDENCE };
    }
  }

  return { language: best, confidence: SCRIPT_CONFIDENCE };
}

const STOPWORDS: Readonly<Record<string, readonly string[]>> = {
  en: [
    "the",
    "and",
    "you",
    "your",
    "for",
    "with",
    "this",
    "that",
    "have",
    "from",
    "please",
    "will",
    "not",
    "are",
    "was",
    "been",
    "our",
    "we",
    "can",
    "if",
    "is",
    "it",
    "to",
    "of",
    "my",
    "me",
  ],
  de: [
    "und",
    "der",
    "die",
    "das",
    "sie",
    "ist",
    "nicht",
    "mit",
    "für",
    "ein",
    "eine",
    "auf",
    "wir",
    "ihre",
    "haben",
    "bitte",
    "wird",
    "auch",
    "dass",
    "von",
    "ich",
    "den",
    "dem",
    "sich",
    "noch",
    "nur",
    "aber",
    "oder",
    "kann",
    "danke",
    "mich",
    "mir",
    "schon",
    "jetzt",
  ],
  es: [
    "que",
    "los",
    "las",
    "una",
    "por",
    "para",
    "con",
    "del",
    "está",
    "como",
    "más",
    "pero",
    "este",
    "esta",
    "sus",
    "puede",
    "hemos",
    "gracias",
    "ser",
    "todo",
    "hola",
    "puedes",
    "tus",
    "tenemos",
    "nunca",
    "ademas",
    "además",
    "muy",
    "también",
    "tambien",
    "desde",
    "hasta",
    "cuando",
    "donde",
    "porque",
    "estamos",
    "somos",
    "tienen",
    "saludo",
    "usted",
    "el",
    "y",
    "qué",
    "sí",
    "cómo",
    "aquí",
    "ahora",
    "hay",
    "eso",
    "esto",
    "ya",
    "tengo",
    "tiene",
    "estoy",
    "están",
    "entonces",
    "aunque",
    "mucho",
    "mucha",
    "siempre",
    "después",
    "quién",
    "cuál",
    "pues",
    "buenas",
    "buenos",
    "saludos",
    "mensaje",
    "mensajes",
    "correo",
    "cuenta",
  ],
  fr: [
    "les",
    "des",
    "une",
    "vous",
    "pour",
    "avec",
    "dans",
    "sur",
    "est",
    "pas",
    "votre",
    "nous",
    "que",
    "qui",
    "plus",
    "être",
    "cette",
    "sont",
    "merci",
    "par",
    "je",
    "elle",
    "ce",
    "du",
    "ne",
    "très",
    "bonjour",
    "aussi",
    "avez",
    "suis",
    "mon",
    "mes",
    "ai",
  ],
  it: [
    "che",
    "non",
    "per",
    "con",
    "una",
    "sono",
    "questo",
    "come",
    "della",
    "dei",
    "alla",
    "più",
    "tuo",
    "vostro",
    "grazie",
    "essere",
    "anche",
    "nella",
    "delle",
    "gli",
    "il",
    "è",
    "sarà",
    "dalle",
    "alle",
    "nostro",
    "nostra",
    "ogni",
    "viene",
    "gentile",
    "cordiali",
    "saluti",
    "ciao",
    "questa",
    "siamo",
    "abbiamo",
    "molto",
    "tutti",
    "ancora",
    "perché",
    "presso",
  ],
  nl: [
    "een",
    "het",
    "van",
    "niet",
    "voor",
    "met",
    "aan",
    "zijn",
    "wij",
    "uw",
    "dat",
    "dit",
    "maar",
    "ook",
    "worden",
    "heeft",
    "kunt",
    "bedankt",
    "onze",
    "naar",
    "ik",
    "op",
    "te",
    "om",
    "er",
    "nog",
    "wel",
    "graag",
  ],
  pl: [
    "nie",
    "jest",
    "się",
    "oraz",
    "dla",
    "przez",
    "jako",
    "tego",
    "które",
    "wszystkie",
    "twoje",
    "proszę",
    "można",
    "będzie",
    "jeśli",
    "aby",
    "przy",
    "tym",
    "już",
  ],
  pt: [
    "que",
    "não",
    "para",
    "com",
    "uma",
    "por",
    "seu",
    "sua",
    "está",
    "como",
    "mais",
    "você",
    "isso",
    "pelo",
    "obrigado",
    "ser",
    "nós",
    "são",
    "das",
    "dos",
    "esta",
    "este",
    "todo",
    "pode",
    "os",
    "até",
    "olá",
    "tudo",
    "vou",
    "também",
    "muito",
    "obrigada",
    "seus",
    "suas",
    "ao",
    "às",
    "é",
    "nosso",
    "nossa",
    "vocês",
    "então",
    "hoje",
    "amanhã",
    "abraços",
    "em",
    "já",
    "onde",
    "neste",
    "nesta",
    "deste",
    "desta",
    "nisso",
    "vosso",
    "vossa",
    "vossos",
    "vossas",
    "agradeço",
    "boa",
    "bom",
    "pela",
    "pelos",
    "pelas",
    "foi",
    "tem",
    "têm",
    "há",
    "estou",
    "estão",
    "ainda",
    "agora",
    "depois",
    "lhe",
    "fazer",
    "gostaria",
    "desde",
    "porque",
  ],
  tr: [
    "için",
    "bir",
    "ile",
    "olan",
    "daha",
    "veya",
    "bu",
    "ve",
    "size",
    "olarak",
    "sonra",
    "kadar",
    "üzere",
    "değil",
    "gibi",
    "lütfen",
    "sizin",
    "her",
    "çok",
    "var",
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

const ORTHOGRAPHY_MARKERS: ReadonlyArray<{
  language: LanguageCode;
  pattern: RegExp;
}> = [
  { language: "pt", pattern: /[ãõ]/ },
  { language: "es", pattern: /ñ/ },
];

function token_language(token: string): LanguageCode | null {
  const stopword = DISCRIMINATIVE_STOPWORDS.get(token);

  if (stopword) return stopword;

  for (const marker of ORTHOGRAPHY_MARKERS) {
    if (marker.pattern.test(token)) return marker.language;
  }

  return null;
}

const TOKEN_SPLIT = /[^\p{L}¿¡]+/u;
const SPANISH_OPENING_MARK = /^[¿¡]+/;
const TRAILING_WEIGHT_FLOOR = 0.35;

function position_weight(index: number, count: number): number {
  if (count <= 1) return 1;

  const progress = index / (count - 1);

  return 1 - (1 - TRAILING_WEIGHT_FLOOR) * progress;
}

function detect_by_stopwords(text: string): DetectionResult | null {
  const entries = text
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .map((raw) => {
      const token = raw.replace(SPANISH_OPENING_MARK, "");

      return { token, opens_spanish: token !== raw };
    })
    .filter((entry) => entry.token);
  const tokens = entries.map((entry) => entry.token);

  if (tokens.length < 8) return null;

  const weighted = new Map<LanguageCode, number>();
  let top_raw_hits = 0;
  const raw_hits = new Map<LanguageCode, number>();

  for (let index = 0; index < tokens.length; index += 1) {
    const language = entries[index].opens_spanish
      ? "es"
      : token_language(tokens[index]);

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

  if ((raw_hits.get(top_language) ?? 0) < MIN_STOPWORD_HITS) return null;

  const confidence = top_weight / (top_weight + second_weight);

  return { language: top_language, confidence };
}

export function detect_language(text: string): DetectionResult | null {
  const stripped = strip_for_detection(text);

  if (stripped.length >= MIN_CJK_DETECTION_LENGTH) {
    const script = detect_by_script(stripped);

    if (script) return script;
  }

  if (stripped.length < MIN_DETECTION_LENGTH) return null;

  return detect_by_stopwords(stripped);
}

const negative_cache = new Set<string>();

function cache_key(
  message_id: string,
  accepted: readonly LanguageCode[],
): string {
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

  const result =
    (stripped.length >= MIN_CJK_DETECTION_LENGTH
      ? detect_by_script(stripped)
      : null) ??
    (stripped.length >= MIN_DETECTION_LENGTH
      ? detect_by_stopwords(stripped)
      : null);

  if (stripped.length < MIN_DETECTION_LENGTH && !result) return null;

  if (!result) return null;

  if (accepted.includes(result.language)) {
    if (result.confidence >= MIN_DETECTION_CONFIDENCE) remember_negative(key);

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
