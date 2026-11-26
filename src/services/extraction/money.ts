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
import type { ExtractedAmount } from "./types";

import { char_set_predicate, trim_end_while } from "@/lib/linear_trim";

export const ISO_CURRENCY_CODES = new Set([
  "AED",
  "AFN",
  "ALL",
  "AMD",
  "ANG",
  "AOA",
  "ARS",
  "AUD",
  "AWG",
  "AZN",
  "BAM",
  "BBD",
  "BDT",
  "BGN",
  "BHD",
  "BIF",
  "BMD",
  "BND",
  "BOB",
  "BRL",
  "BSD",
  "BTN",
  "BWP",
  "BYN",
  "BZD",
  "CAD",
  "CDF",
  "CHF",
  "CLP",
  "CNY",
  "COP",
  "CRC",
  "CUP",
  "CVE",
  "CZK",
  "DJF",
  "DKK",
  "DOP",
  "DZD",
  "EGP",
  "ERN",
  "ETB",
  "EUR",
  "FJD",
  "FKP",
  "GBP",
  "GEL",
  "GHS",
  "GIP",
  "GMD",
  "GNF",
  "GTQ",
  "GYD",
  "HKD",
  "HNL",
  "HTG",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "IQD",
  "IRR",
  "ISK",
  "JMD",
  "JOD",
  "JPY",
  "KES",
  "KGS",
  "KHR",
  "KMF",
  "KPW",
  "KRW",
  "KWD",
  "KYD",
  "KZT",
  "LAK",
  "LBP",
  "LKR",
  "LRD",
  "LSL",
  "LYD",
  "MAD",
  "MDL",
  "MGA",
  "MKD",
  "MMK",
  "MNT",
  "MOP",
  "MRU",
  "MUR",
  "MVR",
  "MWK",
  "MXN",
  "MYR",
  "MZN",
  "NAD",
  "NGN",
  "NIO",
  "NOK",
  "NPR",
  "NZD",
  "OMR",
  "PAB",
  "PEN",
  "PGK",
  "PHP",
  "PKR",
  "PLN",
  "PYG",
  "QAR",
  "RON",
  "RSD",
  "RUB",
  "RWF",
  "SAR",
  "SBD",
  "SCR",
  "SDG",
  "SEK",
  "SGD",
  "SHP",
  "SLE",
  "SOS",
  "SRD",
  "SSP",
  "STN",
  "SVC",
  "SYP",
  "SZL",
  "THB",
  "TJS",
  "TMT",
  "TND",
  "TOP",
  "TRY",
  "TTD",
  "TWD",
  "TZS",
  "UAH",
  "UGX",
  "USD",
  "UYU",
  "UZS",
  "VES",
  "VND",
  "VUV",
  "WST",
  "XAF",
  "XCD",
  "XOF",
  "XPF",
  "YER",
  "ZAR",
  "ZMW",
  "ZWG",
]);

const SYMBOL_CURRENCIES: Record<string, string> = {
  US$: "USD",
  CA$: "CAD",
  C$: "CAD",
  AU$: "AUD",
  A$: "AUD",
  NZ$: "NZD",
  HK$: "HKD",
  SG$: "SGD",
  S$: "SGD",
  MX$: "MXN",
  R$: "BRL",
  NT$: "TWD",
  "E£": "EGP",
  KSH: "KES",
  RM: "MYR",
  RP: "IDR",
  "RS.": "INR",
  RS: "INR",
  ZŁ: "PLN",
  KČ: "CZK",
  FT: "HUF",
  LEI: "RON",
  "ЛВ.": "BGN",
  ЛВ: "BGN",
  "FR.": "CHF",
  "KR.": "SEK",
  KR: "SEK",
  R: "ZAR",
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "￥": "JPY",
  "₹": "INR",
  "₩": "KRW",
  "₽": "RUB",
  "₺": "TRY",
  "₪": "ILS",
  "₫": "VND",
  "₱": "PHP",
  "฿": "THB",
  "₴": "UAH",
  "₦": "NGN",
  "₡": "CRC",
  "₲": "PYG",
  "₵": "GHS",
  "₸": "KZT",
  "₼": "AZN",
  "₾": "GEL",
  "₭": "LAK",
  "₮": "MNT",
  "৳": "BDT",
};

const DOLLAR_FAMILY = new Set([
  "USD",
  "CAD",
  "AUD",
  "NZD",
  "SGD",
  "HKD",
  "MXN",
  "TWD",
  "ARS",
  "CLP",
  "COP",
  "UYU",
  "BSD",
  "BBD",
  "BZD",
  "BMD",
  "FJD",
  "JMD",
  "KYD",
  "LRD",
  "NAD",
  "SBD",
  "SRD",
  "TTD",
  "XCD",
  "GYD",
  "BND",
  "DOP",
  "CUP",
]);
const KRONA_FAMILY = new Set(["SEK", "NOK", "DKK", "ISK"]);
const YEN_FAMILY = new Set(["JPY", "CNY"]);
const RUPEE_FAMILY = new Set(["INR", "PKR", "LKR", "NPR", "MUR", "SCR"]);

const AMBIGUOUS_FAMILIES: Record<string, Set<string>> = {
  $: DOLLAR_FAMILY,
  KR: KRONA_FAMILY,
  "KR.": KRONA_FAMILY,
  "¥": YEN_FAMILY,
  "￥": YEN_FAMILY,
  RS: RUPEE_FAMILY,
  "RS.": RUPEE_FAMILY,
};

const REGION_CURRENCIES: Record<string, string> = {
  se: "SEK",
  no: "NOK",
  dk: "DKK",
  is: "ISK",
  fo: "DKK",
  gl: "DKK",
  ca: "CAD",
  au: "AUD",
  nz: "NZD",
  sg: "SGD",
  hk: "HKD",
  mx: "MXN",
  tw: "TWD",
  cn: "CNY",
  jp: "JPY",
  ar: "ARS",
  cl: "CLP",
  co: "COP",
  uy: "UYU",
  pk: "PKR",
  lk: "LKR",
  np: "NPR",
  in: "INR",
  us: "USD",
  pl: "PLN",
  cz: "CZK",
  hu: "HUF",
  ro: "RON",
  bg: "BGN",
  ch: "CHF",
  li: "CHF",
  za: "ZAR",
  br: "BRL",
  kr: "KRW",
  ru: "RUB",
  tr: "TRY",
  il: "ILS",
  vn: "VND",
  ph: "PHP",
  th: "THB",
  ua: "UAH",
  ng: "NGN",
  my: "MYR",
  id: "IDR",
  ke: "KES",
  eg: "EGP",
  kw: "KWD",
  bh: "BHD",
  om: "OMR",
  jo: "JOD",
  tn: "TND",
  ae: "AED",
  sa: "SAR",
  qa: "QAR",
  uk: "GBP",
  gb: "GBP",
  de: "EUR",
  fr: "EUR",
  es: "EUR",
  it: "EUR",
  nl: "EUR",
  be: "EUR",
  at: "EUR",
  fi: "EUR",
  ie: "EUR",
  pt: "EUR",
  gr: "EUR",
  sk: "EUR",
  si: "EUR",
  ee: "EUR",
  lv: "EUR",
  lt: "EUR",
  lu: "EUR",
  mt: "EUR",
  cy: "EUR",
  hr: "EUR",
};

const WORD_LIKE_CODES = new Set([
  "ALL",
  "AMD",
  "ANG",
  "BAM",
  "BOB",
  "CUP",
  "DOP",
  "ERN",
  "GEL",
  "LAK",
  "MAD",
  "MOP",
  "NAD",
  "PEN",
  "SOS",
  "TOP",
  "TRY",
  "WST",
  "YER",
  "CVE",
  "SAR",
  "MRU",
  "STN",
]);

const KRONA_DASH = ":-";
const LETTER = "A-Za-zÀ-ÖØ-öø-ÿĀ-žА-яЁё";

function supports_regex(source: string): boolean {
  try {
    new RegExp(source);

    return true;
  } catch {
    return false;
  }
}

const NOT_AFTER_LETTER = supports_regex(`(?<![${LETTER}])x`)
  ? `(?<![${LETTER}])`
  : "";
const NOT_BEFORE_LETTER = `(?![${LETTER}])`;

function escape_char(c: string): string {
  return /[.*+?^${}()|[\]\\/-]/.test(c) ? `\\${c}` : c;
}

function is_letter(c: string): boolean {
  return c.toLowerCase() !== c.toUpperCase();
}

function symbol_source(key: string): string {
  const chars = Array.from(key);
  const body = chars
    .map((c) =>
      is_letter(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : escape_char(c),
    )
    .join("");

  if (is_letter(chars[0])) {
    return `${NOT_AFTER_LETTER}${body}${NOT_BEFORE_LETTER}`;
  }

  if (is_letter(chars[chars.length - 1])) return `${body}${NOT_BEFORE_LETTER}`;

  return body;
}

const SYMBOL_ALTERNATION = Object.keys(SYMBOL_CURRENCIES)
  .sort((a, b) => Array.from(b).length - Array.from(a).length)
  .map(symbol_source)
  .join("|");

const CODE_ALTERNATION = `${NOT_AFTER_LETTER}(?:${Array.from(ISO_CURRENCY_CODES).sort().join("|")})${NOT_BEFORE_LETTER}`;

export const NUMBER_BODY =
  "(?:[0-9]{1,2}(?:,[0-9]{2})+,[0-9]{3}(?:\\.[0-9]{1,2})?" +
  "|[0-9]{1,3}(?:[,.'’\\u00a0\\u202f ][0-9]{3})+(?:[.,][0-9]{1,3})?" +
  "|[0-9]+(?:[.,][0-9]{1,3})?)(?![0-9])(?![0-9.,]{0,12}[\\s\\u00a0\\u202f]{0,2}%)";

export const MONEY_GAP = "[\\s\\u00a0\\u202f]?";

export const CURRENCY_TOKEN = `(?:${CODE_ALTERNATION}|${SYMBOL_ALTERNATION})`;

export const MONEY_TOKEN = `(?:${CURRENCY_TOKEN}${MONEY_GAP})?${NUMBER_BODY}(?:${MONEY_GAP}(?:${CURRENCY_TOKEN}|${KRONA_DASH}))?`;

export const REQUIRED_MONEY_TOKEN =
  `(?:${CURRENCY_TOKEN})${MONEY_GAP}${NUMBER_BODY}(?:${MONEY_GAP}(?:${CURRENCY_TOKEN}))?` +
  `|${NUMBER_BODY}${MONEY_GAP}(?:${CURRENCY_TOKEN})`;

const MONEY_SOURCE = `(${CURRENCY_TOKEN})?${MONEY_GAP}(${NUMBER_BODY})(?:${MONEY_GAP}(${CURRENCY_TOKEN}|${KRONA_DASH}))?`;

const MONEY_PATTERN = new RegExp(MONEY_SOURCE);

function symbol_key(raw: string): string {
  const trimmed = raw.trim();

  return trimmed === KRONA_DASH ? "KR" : trimmed.toUpperCase();
}

export interface CurrencyContext {
  dominant: string | null;
  resolve: (raw_symbol: string) => string;
}

function make_context(
  dominant: string | null,
  hinted: string[],
  locale_hint: string | null,
): CurrencyContext {
  return {
    dominant,
    resolve(raw_symbol: string): string {
      if (!raw_symbol.trim()) return dominant ?? "";

      const key = symbol_key(raw_symbol);

      if (ISO_CURRENCY_CODES.has(key)) return key;

      const base = SYMBOL_CURRENCIES[key];

      if (!base) return dominant ?? "";

      const family = AMBIGUOUS_FAMILIES[key];

      if (!family) return base;
      if (dominant && family.has(dominant)) return dominant;

      const hint = hinted.find((c) => family.has(c));

      if (hint) return hint;

      if (family !== DOLLAR_FAMILY && locale_hint && family.has(locale_hint)) {
        return locale_hint;
      }

      return base;
    },
  };
}

function counts_as_evidence(raw: string, number: string): boolean {
  const key = symbol_key(raw);

  if (!key) return false;

  const has_separator = /[.,'’   ]/.test(number);

  if (ISO_CURRENCY_CODES.has(key)) {
    return !WORD_LIKE_CODES.has(key) || has_separator;
  }

  if (Array.from(key).some(is_letter)) return has_separator;

  return true;
}

const SENDER_HOST_TRAILING_CHARACTERS = char_set_predicate(">.");

export function sender_region_currency(from_email: string): string | null {
  const at = from_email.lastIndexOf("@");

  if (at < 0) return null;

  const host = trim_end_while(
    from_email.slice(at + 1).trim(),
    SENDER_HOST_TRAILING_CHARACTERS,
  ).toLowerCase();
  const tld = host.slice(host.lastIndexOf(".") + 1);

  return REGION_CURRENCIES[tld] ?? null;
}

function locale_currency(locale: string | undefined): string | null {
  if (!locale) return null;

  try {
    const region = new Intl.Locale(locale).maximize().region;

    return region ? (REGION_CURRENCIES[region.toLowerCase()] ?? null) : null;
  } catch {
    return null;
  }
}

export function build_currency_context(
  text: string,
  from_email: string,
  locale?: string,
): CurrencyContext {
  const region_hint = sender_region_currency(from_email);
  const locale_hint = locale_currency(locale);
  const explicit_codes = new Map<string, number>();
  const symbols = new Map<string, number>();
  const scan = new RegExp(MONEY_SOURCE, "g");
  let match: RegExpExecArray | null;

  while ((match = scan.exec(text)) !== null) {
    if (match[0].length === 0) {
      scan.lastIndex++;
      continue;
    }

    const number = match[2];

    for (const raw of [match[1], match[3]]) {
      if (!raw || !counts_as_evidence(raw, number)) continue;

      const key = symbol_key(raw);
      const bucket = ISO_CURRENCY_CODES.has(key) ? explicit_codes : symbols;

      bucket.set(key, (bucket.get(key) ?? 0) + 1);
    }
  }

  const code_hint = Array.from(explicit_codes.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => code);
  const hinted = region_hint ? [...code_hint, region_hint] : code_hint;
  const preliminary = make_context(null, hinted, locale_hint);
  const counts = new Map<string, number>(explicit_codes);

  for (const [symbol, n] of symbols) {
    const code = preliminary.resolve(symbol);

    if (code) counts.set(code, (counts.get(code) ?? 0) + n);
  }

  let dominant: string | null = null;
  let best = 0;

  for (const [code, n] of counts) {
    const better =
      n > best ||
      (n === best &&
        explicit_codes.has(code) &&
        !explicit_codes.has(dominant ?? ""));

    if (better) {
      dominant = code;
      best = n;
    }
  }

  return make_context(dominant, hinted, locale_hint);
}

export function fraction_digits(currency: string): number {
  if (!currency) return 2;

  try {
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

export function parse_number(raw: string, currency: string): number | null {
  const digits = raw.replace(/[   '’]/g, "");

  if (!/^[0-9]/.test(digits) || /[.,]{2}|[.,]$/.test(digits)) return null;

  const last_dot = digits.lastIndexOf(".");
  const last_comma = digits.lastIndexOf(",");
  let normalized = digits;

  if (last_dot >= 0 && last_comma >= 0) {
    normalized =
      last_dot > last_comma
        ? digits.replace(/,/g, "")
        : digits.replace(/\./g, "").replace(",", ".");
  } else if (last_dot >= 0 || last_comma >= 0) {
    const sep = last_dot >= 0 ? "." : ",";
    const occurrences = digits.split(sep).length - 1;
    const after = digits.length - digits.lastIndexOf(sep) - 1;
    const is_decimal =
      occurrences > 1
        ? false
        : after !== 3
          ? true
          : sep === "." && fraction_digits(currency) === 3;

    normalized = is_decimal
      ? digits.replace(sep, ".")
      : digits.split(sep).join("");
  }

  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(normalized)) return null;

  const value = parseFloat(normalized);

  return Number.isFinite(value) ? value : null;
}

export function format_amount(
  value: number,
  currency: string,
  locale?: string,
): string {
  if (!currency) {
    return value.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    const digits = fraction_digits(currency);

    return `${currency} ${value.toLocaleString(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })}`;
  }
}

export function parse_amount(
  text: string,
  context: CurrencyContext,
  locale?: string,
): ExtractedAmount | null {
  const match = text.match(MONEY_PATTERN);

  if (!match) return null;

  const currency = context.resolve(match[1] || match[3] || "");
  const value = parse_number(match[2], currency);

  if (value === null) return null;

  return {
    value,
    currency,
    formatted: format_amount(value, currency, locale),
  };
}
