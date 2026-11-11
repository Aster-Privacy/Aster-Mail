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
const MIN_CODE_LENGTH = 4;
const MAX_CODE_LENGTH = 10;
const MAX_KEYWORD_DISTANCE = 80;
const MAX_BLOCKING_DISTANCE = 24;

const BOUNDARY_CHAR =
  /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{N}_]/u;
const CODE_TOKEN = /[A-Za-z0-9]+/g;
const CODE_CHARS = /^[A-Z0-9]+$/;
const HAS_DIGIT = /\d/;
const ONLY_DIGITS = /^\d+$/;
const UNJOINABLE_WORDS = /^(?:OTP|PIN|MFA|TFA|SMS|CODE|ID|REF|NO|NR)$/;
const UNIT_SUFFIX = /^\d+(?:ST|ND|RD|TH|AM|PM|K|M|P|GB|MB|KB|TB|PX|MP|HZ)$/;

const BEFORE_REJECT = [
  /[$€£¥₹#+/\\@=]$/,
  /[$€£¥₹]\s$/,
  /\d[ \-./:,]$/,
  /\)\s?$/,
  /(?:^|[^\p{L}])(?:usd|eur|gbp|chf|jpy|inr|cad|aud|rs\.?|r\$)\s?$/iu,
];

const AFTER_REJECT = [
  /^[.,:/]\d/,
  /^[ -]\d/,
  /^-[A-Za-z0-9]/,
  /^[@%$€£¥₹]/,
  /^\.\p{L}/u,
  /^\s?(?:%|[$€£¥₹]|[ap]\.?m\.?(?!\p{L})|mins?(?!\p{L})|minutes|hours?|hrs?|secs?(?!\p{L})|seconds|days?(?!\p{L})|[kmgt]b(?!\p{L})|kg(?!\p{L})|km(?!\p{L})|px(?!\p{L}))/iu,
  /^\s?(?:usd|eur|gbp|chf|jpy|inr|cad|aud|dollars?|euros?)(?!\p{L})/iu,
];

interface KeywordSet {
  words: string[];
  stems: string[];
  bare: string[];
}

interface Span {
  start: number;
  end: number;
}

interface Candidate extends Span {
  value: string;
}

const CODE_KEYWORDS: KeywordSet = {
  words: [
    "codes?",
    "otp",
    "pin",
    "2fa",
    "mfa",
    "tfa",
    "passcodes?",
    "one[- ]?time",
    "two[- ]?factor",
    "log[- ]?in",
    "sign[- ]?in",
    "auth",
    "kod",
    "kodu",
    "kodunuz",
    "c[oó]digo",
    "codice",
    "connexion",
    "acceso",
    "accesso",
    "anmeldung",
  ],
  stems: [
    "v[eé]rif",
    "authenti",
    "best[äa]tigungs",
    "sicherheitscode",
    "anmeldecode",
    "einmal(?:code|passwort|kennwort)",
    "zugangscode",
    "weryfik",
    "doğrula",
    "код",
    "подтвержд",
  ],
  bare: [
    "验证码",
    "驗證碼",
    "校验码",
    "动态码",
    "認証コード",
    "確認コード",
    "ワンタイム",
    "コード",
    "인증",
    "코드",
  ],
};

const BLOCKING_KEYWORDS: KeywordSet = {
  words: [
    "orders?",
    "tracking",
    "track",
    "invoice",
    "receipt",
    "shipment",
    "parcel",
    "package",
    "ref",
    "reference",
    "case",
    "ticket",
    "booking",
    "reservation",
    "flight",
    "tel",
    "fax",
    "call",
    "id",
    "ip",
    "version",
    "build",
    "zip",
    "postal",
    "postcode",
    "error",
    "status",
    "pedido",
    "commande",
    "ordine",
    "bestellung",
    "sendung",
    "rechnung",
    "заказа?",
  ],
  stems: [],
  bare: ["订单", "注文", "快递"],
};

const PROMOTION_KEYWORDS: KeywordSet = {
  words: ["gift ?cards?"],
  stems: [
    "promo",
    "coupon",
    "discount",
    "voucher",
    "rabatt",
    "gutschein",
    "descuento",
    "cup[oó]n",
    "réduction",
    "sconto",
    "скидк",
  ],
  bare: ["\\d{1,3} ?% off", "优惠", "折扣", "割引"],
};

function build_patterns(set: KeywordSet): RegExp[] {
  const bounded: string[] = [];

  if (set.words.length > 0) {
    bounded.push(`(?:${set.words.join("|")})(?![\\p{L}\\p{N}])`);
  }
  if (set.stems.length > 0) {
    bounded.push(`(?:${set.stems.join("|")})`);
  }

  const patterns = [
    new RegExp(`(^|[^\\p{L}\\p{N}])(${bounded.join("|")})`, "giu"),
  ];

  if (set.bare.length > 0) {
    patterns.push(new RegExp(`()(${set.bare.join("|")})`, "giu"));
  }

  return patterns;
}

const CODE_PATTERNS = build_patterns(CODE_KEYWORDS);
const BLOCKING_PATTERNS = build_patterns(BLOCKING_KEYWORDS);
const PROMOTION_PATTERNS = build_patterns(PROMOTION_KEYWORDS);

function find_spans(text: string, patterns: RegExp[]): Span[] {
  const spans: Span[] = [];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);

    while (match) {
      const start = match.index + match[1].length;

      spans.push({ start, end: start + match[2].length });
      if (pattern.lastIndex === match.index) pattern.lastIndex += 1;
      match = pattern.exec(text);
    }
  }

  return spans;
}

function span_distance(a: Span, b: Span): number {
  if (b.end <= a.start) return a.start - b.end;
  if (b.start >= a.end) return b.start - a.end;

  return -1;
}

function nearest_distance(candidate: Span, spans: Span[]): number {
  let nearest = Infinity;

  for (const span of spans) {
    const distance = span_distance(candidate, span);

    if (distance < 0) return -1;
    if (distance < nearest) nearest = distance;
  }

  return nearest;
}

function is_bounded(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : "";
  const after = end < text.length ? text[end] : "";

  return !BOUNDARY_CHAR.test(before) && !BOUNDARY_CHAR.test(after);
}

function is_plausible_code(value: string): boolean {
  if (value.length < MIN_CODE_LENGTH || value.length > MAX_CODE_LENGTH) {
    return false;
  }
  if (!CODE_CHARS.test(value) || !HAS_DIGIT.test(value)) return false;
  if (UNIT_SUFFIX.test(value)) return false;
  if (ONLY_DIGITS.test(value) && value.length === 4) {
    const year = Number(value);

    if (year >= 1900 && year <= 2099) return false;
  }

  return true;
}

function has_clean_context(text: string, span: Span): boolean {
  const before = text.slice(Math.max(0, span.start - 8), span.start);
  const after = text.slice(span.end, span.end + 12);

  if (BEFORE_REJECT.some((pattern) => pattern.test(before))) return false;
  if (AFTER_REJECT.some((pattern) => pattern.test(after))) return false;

  return true;
}

function can_join(first: string, second: string, separator: string): boolean {
  if (first.length < 2 || second.length < 2) return false;
  if (!CODE_CHARS.test(first) || !CODE_CHARS.test(second)) return false;
  if (separator === " ") {
    return HAS_DIGIT.test(first) && HAS_DIGIT.test(second);
  }

  return !UNJOINABLE_WORDS.test(first) && !UNJOINABLE_WORDS.test(second);
}

function collect_tokens(text: string): Span[] {
  const tokens: Span[] = [];

  CODE_TOKEN.lastIndex = 0;
  let match = CODE_TOKEN.exec(text);

  while (match) {
    const start = match.index;
    const end = start + match[0].length;

    if (is_bounded(text, start, end)) tokens.push({ start, end });
    match = CODE_TOKEN.exec(text);
  }

  return tokens;
}

function collect_candidates(text: string): Candidate[] {
  const tokens = collect_tokens(text);
  const candidates: Candidate[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const value = text.slice(token.start, token.end);
    const next = tokens[index + 1];

    if (next && next.start === token.end + 1) {
      const separator = text[token.end];
      const next_value = text.slice(next.start, next.end);
      const joined: Candidate = {
        start: token.start,
        end: next.end,
        value: value + next_value,
      };

      if (
        (separator === " " || separator === "-") &&
        can_join(value, next_value, separator) &&
        is_plausible_code(joined.value) &&
        has_clean_context(text, joined)
      ) {
        candidates.push(joined);
        index += 1;
        continue;
      }
    }

    if (is_plausible_code(value) && has_clean_context(text, token)) {
      candidates.push({ ...token, value });
    }
  }

  return candidates;
}

export function detect_verification_code(
  ...sources: (string | null | undefined)[]
): string | null {
  const text = sources
    .filter((source): source is string => typeof source === "string")
    .map((source) => source.trim())
    .filter((source) => source.length > 0)
    .join("\n");

  if (!text) return null;
  if (find_spans(text, PROMOTION_PATTERNS).length > 0) return null;

  const code_spans = find_spans(text, CODE_PATTERNS);

  if (code_spans.length === 0) return null;

  const blocking_spans = find_spans(text, BLOCKING_PATTERNS);
  let best: { value: string; distance: number } | null = null;

  for (const candidate of collect_candidates(text)) {
    const distance = nearest_distance(candidate, code_spans);

    if (distance < 0 || distance > MAX_KEYWORD_DISTANCE) continue;

    const blocking = nearest_distance(candidate, blocking_spans);

    if (blocking < 0) continue;
    if (blocking < distance && blocking <= MAX_BLOCKING_DISTANCE) continue;
    if (!best || distance < best.distance) {
      best = { value: candidate.value, distance };
    }
  }

  return best ? best.value : null;
}
