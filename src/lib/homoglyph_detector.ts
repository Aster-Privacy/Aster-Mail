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
const CONFUSABLES: Record<string, string> = {
  "\u0430": "a",
  "\u0435": "e",
  "\u043E": "o",
  "\u0440": "p",
  "\u0441": "c",
  "\u0443": "y",
  "\u0445": "x",
  "\u0456": "i",
  "\u0458": "j",
  "\u04BB": "h",
  "\u0501": "d",
  "\u051B": "q",
  "\u0261": "g",
  "\u1E05": "b",
  "\u1E0D": "d",
  "\u1E25": "h",
  "\u1E37": "l",
  "\u1E43": "m",
  "\u1E47": "n",
  "\u1E5B": "r",
  "\u1E63": "s",
  "\u1E6D": "t",
  "\u0131": "i",
  "\u0251": "a",
  "\u025B": "e",
  "\u0254": "o",
  "\u0073\u0323": "s",
  "\u0237": "j",
  "\u03B1": "a",
  "\u03B5": "e",
  "\u03BF": "o",
  "\u03C1": "p",
  "\u03BA": "k",
  "\u03BD": "v",
  "\u03C4": "t",
  "\u0391": "A",
  "\u0392": "B",
  "\u0395": "E",
  "\u0397": "H",
  "\u0399": "I",
  "\u039A": "K",
  "\u039C": "M",
  "\u039D": "N",
  "\u039F": "O",
  "\u03A1": "P",
  "\u03A4": "T",
  "\u03A5": "Y",
  "\u03A7": "X",
  "\u0396": "Z",
  "\uFF41": "a",
  "\uFF42": "b",
  "\uFF43": "c",
  "\uFF44": "d",
  "\uFF45": "e",
  "\uFF46": "f",
  "\uFF47": "g",
  "\uFF48": "h",
  "\uFF49": "i",
  "\uFF4A": "j",
  "\uFF4B": "k",
  "\uFF4C": "l",
  "\uFF4D": "m",
  "\uFF4E": "n",
  "\uFF4F": "o",
  "\uFF50": "p",
  "\uFF51": "q",
  "\uFF52": "r",
  "\uFF53": "s",
  "\uFF54": "t",
  "\uFF55": "u",
  "\uFF56": "v",
  "\uFF57": "w",
  "\uFF58": "x",
  "\uFF59": "y",
  "\uFF5A": "z",
  "\u01C3": "!",
  "\uFF10": "0",
  "\uFF11": "1",
  "\uFF12": "2",
  "\uFF13": "3",
  "\uFF14": "4",
  "\uFF15": "5",
  "\uFF16": "6",
  "\uFF17": "7",
  "\uFF18": "8",
  "\uFF19": "9",
};

const BRAND_DOMAINS: Record<string, string[]> = {
  google: ["google.com", "gmail.com", "youtube.com", "googleapis.com"],
  apple: ["apple.com", "icloud.com"],
  microsoft: [
    "microsoft.com",
    "outlook.com",
    "live.com",
    "hotmail.com",
    "office.com",
    "office365.com",
  ],
  amazon: ["amazon.com", "amazon.co.uk", "aws.amazon.com"],
  facebook: ["facebook.com", "fb.com", "meta.com"],
  netflix: ["netflix.com"],
  paypal: ["paypal.com"],
  instagram: ["instagram.com"],
  twitter: ["twitter.com", "x.com"],
  linkedin: ["linkedin.com"],
  dropbox: ["dropbox.com"],
  github: ["github.com"],
  spotify: ["spotify.com"],
  slack: ["slack.com"],
  zoom: ["zoom.us"],
  adobe: ["adobe.com"],
  chase: ["chase.com"],
  wellsfargo: ["wellsfargo.com"],
  bankofamerica: ["bankofamerica.com"],
  stripe: ["stripe.com"],
  coinbase: ["coinbase.com"],
  binance: ["binance.com"],
  proton: ["proton.me", "protonmail.com"],
  yahoo: ["yahoo.com"],
  dhl: ["dhl.com"],
  fedex: ["fedex.com"],
  ups: ["ups.com"],
  usps: ["usps.com"],
  discord: ["discord.com", "discord.gg"],
  whatsapp: ["whatsapp.com"],
  telegram: ["telegram.org", "t.me"],
  signal: ["signal.org"],
};

const PUNYCODE_BASE = 36;
const PUNYCODE_T_MIN = 1;
const PUNYCODE_T_MAX = 26;
const PUNYCODE_SKEW = 38;
const PUNYCODE_DAMP = 700;
const PUNYCODE_INITIAL_BIAS = 72;
const PUNYCODE_INITIAL_N = 128;

function punycode_adapt(delta: number, num_points: number, first: boolean): number {
  let k = 0;

  delta = first ? Math.floor(delta / PUNYCODE_DAMP) : delta >> 1;
  delta += Math.floor(delta / num_points);

  while (delta > ((PUNYCODE_BASE - PUNYCODE_T_MIN) * PUNYCODE_T_MAX) >> 1) {
    delta = Math.floor(delta / (PUNYCODE_BASE - PUNYCODE_T_MIN));
    k += PUNYCODE_BASE;
  }

  return k + Math.floor(((PUNYCODE_BASE - PUNYCODE_T_MIN + 1) * delta) / (delta + PUNYCODE_SKEW));
}

function punycode_digit(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 26;
  if (code >= 0x41 && code <= 0x5a) return code - 0x41;
  if (code >= 0x61 && code <= 0x7a) return code - 0x61;

  return PUNYCODE_BASE;
}

function decode_punycode_label(label: string): string {
  if (!/^xn--/i.test(label)) return label;

  const input = label.slice(4);
  const output: number[] = [];
  const basic_end = input.lastIndexOf("-");

  for (let i = 0; i < Math.max(basic_end, 0); i++) {
    const code = input.charCodeAt(i);

    if (code >= 0x80) return label;

    output.push(code);
  }

  let n = PUNYCODE_INITIAL_N;
  let bias = PUNYCODE_INITIAL_BIAS;
  let i = 0;
  let index = basic_end > 0 ? basic_end + 1 : 0;

  while (index < input.length) {
    const old_i = i;
    let w = 1;

    for (let k = PUNYCODE_BASE; ; k += PUNYCODE_BASE) {
      if (index >= input.length) return label;

      const digit = punycode_digit(input.charCodeAt(index++));

      if (digit >= PUNYCODE_BASE) return label;

      i += digit * w;

      const t =
        k <= bias
          ? PUNYCODE_T_MIN
          : k >= bias + PUNYCODE_T_MAX
            ? PUNYCODE_T_MAX
            : k - bias;

      if (digit < t) break;

      w *= PUNYCODE_BASE - t;
    }

    const length = output.length + 1;

    bias = punycode_adapt(i - old_i, length, old_i === 0);
    n += Math.floor(i / length);
    i %= length;

    if (n > 0x10ffff) return label;

    output.splice(i++, 0, n);
  }

  return String.fromCodePoint(...output);
}

export function decode_punycode_domain(domain: string): string {
  return domain.split(".").map(decode_punycode_label).join(".");
}

function normalize_domain(domain: string): string {
  let result = "";

  for (const char of domain) {
    result += CONFUSABLES[char] || char;
  }

  return result.toLowerCase();
}

function is_plain_ascii(label: string): boolean {
  for (const char of label) {
    const code = char.codePointAt(0) ?? 0;

    if (code > 0x7f) return false;
  }

  return true;
}

function has_mixed_scripts(domain: string): boolean {
  for (const label of domain.split(".")) {
    let has_latin = false;
    let has_non_latin = false;

    for (const char of label) {
      const code = char.codePointAt(0);

      if (!code) continue;
      if (char === "-") continue;

      if (
        (code >= 0x41 && code <= 0x5a) ||
        (code >= 0x61 && code <= 0x7a) ||
        (code >= 0x30 && code <= 0x39)
      ) {
        has_latin = true;
      } else if (code > 0x7f) {
        has_non_latin = true;
      }
    }

    if (has_latin && has_non_latin) return true;
  }

  return false;
}

export interface HomoglyphResult {
  is_suspicious: boolean;
  matched_brand?: string;
  matched_domain?: string;
  original_domain: string;
  has_mixed_scripts: boolean;
}

export function detect_homoglyph(domain: string): HomoglyphResult {
  const decoded = decode_punycode_domain(domain).toLowerCase();
  const normalized = normalize_domain(decoded);
  const mixed = has_mixed_scripts(decoded);
  const raw_base = decoded.split(".")[0];
  const domain_base = normalized.split(".")[0];
  const base_is_confusable = raw_base !== domain_base || !is_plain_ascii(raw_base);

  for (const [brand, domains] of Object.entries(BRAND_DOMAINS)) {
    for (const legit_domain of domains) {
      if (decoded === legit_domain) {
        return {
          is_suspicious: false,
          original_domain: domain,
          has_mixed_scripts: false,
        };
      }

      const legit_base = legit_domain.split(".")[0];

      if (base_is_confusable && domain_base === legit_base) {
        return {
          is_suspicious: true,
          matched_brand: brand,
          matched_domain: legit_domain,
          original_domain: domain,
          has_mixed_scripts: mixed,
        };
      }

      if (
        (mixed || base_is_confusable) &&
        domain_base !== legit_base &&
        levenshtein_distance(domain_base, legit_base) <= 1
      ) {
        return {
          is_suspicious: true,
          matched_brand: brand,
          matched_domain: legit_domain,
          original_domain: domain,
          has_mixed_scripts: mixed,
        };
      }
    }
  }

  if (mixed) {
    return {
      is_suspicious: true,
      original_domain: domain,
      has_mixed_scripts: true,
    };
  }

  return {
    is_suspicious: false,
    original_domain: domain,
    has_mixed_scripts: false,
  };
}

function levenshtein_distance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;

      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[b.length][a.length];
}
