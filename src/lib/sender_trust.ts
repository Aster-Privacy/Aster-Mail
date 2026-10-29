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
import trust_data from "@/lib/sender_trust_data.json";
import { UTS39_CONFUSABLES } from "@/lib/sender_trust_confusables";

export type SenderAuthState =
  "internal" | "authenticated" | "unknown" | "unverified" | "failed";

export type SenderWarningKind =
  | "address_in_name"
  | "lookalike_domain"
  | "lookalike_name"
  | "brand_name"
  | "home_brand_name";

export interface SenderWarning {
  kind: SenderWarningKind;
  claimed: string;
}

export interface SenderTrustContact {
  name: string;
  emails: string[];
}

export interface SenderTrustInput {
  name?: string | null;
  email?: string | null;
  reply_to?: string | null;
  spf_result?: string | null;
  dkim_result?: string | null;
  dmarc_result?: string | null;
  sender_aligned?: boolean | null;
  sender_verified?: boolean | null;
  sender_verified_domain?: string | null;
  is_internal?: boolean;
  own_addresses?: string[];
  contacts?: SenderTrustContact[];
}

export interface SenderTrust {
  name: string;
  address: string;
  domain: string;
  auth_state: SenderAuthState;
  warning: SenderWarning | null;
  contact_notice: string | null;
  reply_to: string | null;
  show_identity_marks: boolean;
  show_verified_badge: boolean;
}

interface BrandEntry {
  id: string;
  names: string[];
  solo_names?: string[];
  ambiguous: boolean;
  company_claim?: boolean;
  any_suffix: boolean;
  suffix_labels?: string[];
  domains: string[];
}

interface ParsedAddress {
  local: string;
  domain: string;
  ascii_domain: string;
  registrable: string;
  address: string;
}

const CONFUSABLES = new Map<string, string>([
  ...Object.entries(UTS39_CONFUSABLES),
  ...Object.entries(trust_data.confusables as Record<string, string>).filter(
    ([from, to]) =>
      !(
        from !== from.toLowerCase() &&
        UTS39_CONFUSABLES[from] !== undefined &&
        UTS39_CONFUSABLES[from] !== to
      ),
  ),
]);
const DIGRAPHS = trust_data.digraphs as string[][];
const SECOND_LEVEL = new Set<string>(trust_data.second_level_suffixes);
const GENERIC_WORDS = new Set<string>(trust_data.generic_words);
const COMPANY_WORDS = new Set<string>(trust_data.company_words);
const RELAY_DOMAINS = trust_data.relay_domains as string[];
const PUBLIC_MAILBOX_DOMAINS = new Set<string>(
  trust_data.public_mailbox_domains,
);
const DOTLESS_MAILBOX_DOMAINS = new Set<string>(
  trust_data.dotless_mailbox_domains,
);
const SHARED_TENANT_DOMAINS = trust_data.shared_tenant_domains as string[];
const RESERVED_LOCAL_PARTS = new Set<string>(trust_data.reserved_local_parts);
const COUNTRY_SUFFIXES = new Set<string>(trust_data.country_suffixes);
const BRANDS = trust_data.brands as BrandEntry[];
const HOME_BRAND = trust_data.home_brand;
const HOME_NEUTRAL_WORDS = new Set<string>(HOME_BRAND.neutral_words);
const MAX_NAME_LENGTH = trust_data.max_name_length;
const MAX_RAW_NAME_LENGTH = 2048;
const MAX_ADDRESS_LENGTH = 320;
const MAX_DOMAIN_LENGTH = 253;
const MIN_CONTACT_NAME_LENGTH = 5;

const INVISIBLE_RANGES: [number, number][] = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x034f, 0x034f],
  [0x061c, 0x061c],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180b, 0x180f],
  [0x200b, 0x200b],
  [0x200e, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0x2800, 0x2800],
  [0x3164, 0x3164],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xfff0, 0xfffb],
  [0x1bca0, 0x1bca3],
  [0x1d173, 0x1d17a],
  [0xe0000, 0xe0fff],
];

const IGNORABLE_PATTERN = /^[\p{Default_Ignorable_Code_Point}\p{Cf}]$/u;

const COMBINING_PATTERN = /^[\p{Mn}\p{Me}]$/u;

const JOINER_RANGES: [number, number][] = [
  [0x200c, 0x200d],
  [0xfe00, 0xfe0f],
];

const SPACE_RANGES: [number, number][] = [
  [0x0009, 0x000d],
  [0x0020, 0x0020],
  [0x0085, 0x0085],
  [0x00a0, 0x00a0],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
];

const MARK_RANGES: [number, number][] = [
  [0x0300, 0x036f],
  [0x0483, 0x0489],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x20d0, 0x20ff],
  [0xfe20, 0xfe2f],
  [0x0591, 0x05bd],
  [0x05bf, 0x05bf],
  [0x05c1, 0x05c2],
  [0x05c4, 0x05c5],
  [0x05c7, 0x05c7],
  [0x0610, 0x061a],
  [0x064b, 0x065f],
  [0x0670, 0x0670],
  [0x06d6, 0x06dc],
  [0x06df, 0x06e4],
  [0x06e7, 0x06e8],
  [0x06ea, 0x06ed],
  [0x0e31, 0x0e31],
  [0x0e34, 0x0e3a],
  [0x0e47, 0x0e4e],
  [0x3099, 0x309a],
];

const SEPARATOR_RANGES: [number, number][] = [
  [0x0021, 0x002f],
  [0x003a, 0x0040],
  [0x005b, 0x0060],
  [0x007b, 0x007e],
  [0x00a1, 0x00bf],
  [0x2010, 0x2027],
  [0x2030, 0x205e],
  [0x2190, 0x2bff],
  [0x3001, 0x303f],
  [0x1f000, 0x1faff],
];

const NAME_SEPARATOR_RANGES: [number, number][] = [
  [0x02b0, 0x02ff],
  [0x2e00, 0x2e7f],
  [0x30a0, 0x30a0],
  [0x30fb, 0x30fb],
  [0xa700, 0xa71f],
];

const DISPLAY_SCRIPTS = new Set<string>([
  "latin",
  "greek",
  "cyrillic",
  "armenian",
  "hebrew",
  "arabic",
  "devanagari",
  "thai",
  "georgian",
  "east_asian",
]);

const DISTINCT_LATIN_LETTERS = new Set<string>([
  "ß",
  "æ",
  "ð",
  "ø",
  "þ",
  "đ",
  "ħ",
  "ł",
  "œ",
]);

const ENCLOSED_LETTER_STARTS = [0x1f150, 0x1f170];

const MARK_SYMBOLS = /[\u2120\u2122]/g;

const SCRIPT_RANGES: [number, number, string][] = [
  [0x0370, 0x03ff, "greek"],
  [0x1f00, 0x1fff, "greek"],
  [0x0400, 0x052f, "cyrillic"],
  [0x1c80, 0x1c8f, "cyrillic"],
  [0x2de0, 0x2dff, "cyrillic"],
  [0xa640, 0xa69f, "cyrillic"],
  [0x0530, 0x058f, "armenian"],
  [0x0590, 0x05ff, "hebrew"],
  [0x0600, 0x06ff, "arabic"],
  [0x0750, 0x077f, "arabic"],
  [0x0900, 0x097f, "devanagari"],
  [0x0e00, 0x0e7f, "thai"],
  [0x10a0, 0x10ff, "georgian"],
  [0x3040, 0x30ff, "east_asian"],
  [0x3400, 0x4dbf, "east_asian"],
  [0x4e00, 0x9fff, "east_asian"],
  [0xac00, 0xd7af, "east_asian"],
  [0x13a0, 0x13ff, "cherokee"],
];

function in_ranges(code: number, ranges: [number, number][]): boolean {
  for (const [start, end] of ranges) {
    if (code >= start && code <= end) return true;
  }

  return false;
}

function code_points(text: string): number[] {
  const points: number[] = [];

  for (const char of text) {
    const code = char.codePointAt(0);

    if (code !== undefined) points.push(code);
  }

  return points;
}

function is_lone_surrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdfff;
}

function is_ignorable(code: number): boolean {
  return code >= 0xad && IGNORABLE_PATTERN.test(String.fromCodePoint(code));
}

function is_combining(code: number): boolean {
  return (
    in_ranges(code, MARK_RANGES) ||
    (code >= 0x300 && COMBINING_PATTERN.test(String.fromCodePoint(code)))
  );
}

function joins_previous(code: number, previous: number): boolean {
  if (previous >= 0x80) return true;

  return (
    (code === 0xfe0e || code === 0xfe0f) &&
    /[0-9#*]/.test(String.fromCodePoint(previous))
  );
}

function clean_text(text: string, keep_joiners: boolean): string {
  let result = "";
  let after_joiner = false;
  let pending_space = false;
  let previous = 0;

  for (const code of code_points(text)) {
    if (is_lone_surrogate(code)) continue;
    if (in_ranges(code, SPACE_RANGES)) {
      pending_space = result.length > 0;
      continue;
    }
    if (in_ranges(code, INVISIBLE_RANGES)) continue;
    if (in_ranges(code, JOINER_RANGES)) {
      if (!keep_joiners || pending_space || after_joiner || !result) continue;
      if (!joins_previous(code, previous)) continue;
      result += String.fromCodePoint(code);
      after_joiner = true;
      continue;
    }
    if (is_ignorable(code)) continue;
    if (pending_space) {
      result += " ";
      pending_space = false;
    }
    result += String.fromCodePoint(code);
    after_joiner = false;
    previous = code;
  }

  return result;
}

function strip_outer_quotes(text: string): string {
  let result = text;

  while (result.length >= 2) {
    const first = result[0];
    const last = result[result.length - 1];
    const quoted =
      (first === '"' && last === '"') || (first === "'" && last === "'");

    if (!quoted) break;
    result = result.slice(1, -1).trim();
  }

  return result;
}

function cap_code_points(text: string, max: number): string {
  const points = code_points(text);

  if (points.length <= max) return text;

  return String.fromCodePoint(...points.slice(0, max)).trim();
}

function capped_display_name(
  raw: string | null | undefined,
  max: number,
): string {
  if (typeof raw !== "string") return "";

  const cleaned = strip_outer_quotes(
    cap_code_points(clean_text(raw, true).trim(), MAX_RAW_NAME_LENGTH),
  );

  if (!clean_text(cleaned, false)) return "";

  return cap_code_points(cleaned, max);
}

export function sanitize_display_name(raw: string | null | undefined): string {
  return capped_display_name(raw, MAX_NAME_LENGTH);
}

function enclosed_plain(text: string): string {
  let result = "";

  for (const code of code_points(text)) {
    let plain = code;

    for (const start of ENCLOSED_LETTER_STARTS) {
      if (code >= start && code < start + 26) plain = 0x41 + code - start;
    }
    result += String.fromCodePoint(plain);
  }

  return result;
}

function fold(text: string): string {
  return clean_text(text.normalize("NFKC"), false).toLowerCase();
}

function is_cherokee_small(code: number): boolean {
  return code >= 0xab70 && code <= 0xabbf;
}

function map_confusables(text: string): string {
  let mapped = "";

  for (const code of code_points(text)) {
    if (is_combining(code)) continue;

    const char = String.fromCodePoint(code);
    const mapped_char =
      CONFUSABLES.get(char) ??
      (is_cherokee_small(code)
        ? CONFUSABLES.get(char.toUpperCase())
        : undefined);

    mapped += mapped_char ?? char;
  }

  return mapped;
}

const SKELETON_CACHE_LIMIT = 4096;
const SKELETON_CACHE_MAX_INPUT = 256;
const skeleton_cache = new Map<string, string>();

export function skeleton_cache_size(): number {
  return skeleton_cache.size;
}

export function clear_sender_trust_caches(): void {
  skeleton_cache.clear();
  cached_own = null;
  cached_contacts = null;
  cached_context = null;
}

export function skeleton(text: string): string {
  if (text.length > SKELETON_CACHE_MAX_INPUT) return compute_skeleton(text);

  const hit = skeleton_cache.get(text);

  if (hit !== undefined) return hit;

  const result = compute_skeleton(text);

  if (skeleton_cache.size >= SKELETON_CACHE_LIMIT) skeleton_cache.clear();
  skeleton_cache.set(text, result);

  return result;
}

function compute_skeleton(text: string): string {
  const mapped = map_confusables(
    map_confusables(clean_text(text, false)).normalize("NFKD"),
  );
  let result = "";

  for (const code of code_points(
    clean_text(mapped, false).toLowerCase().normalize("NFKD"),
  )) {
    if (is_combining(code)) continue;
    result += String.fromCodePoint(code);
  }
  for (const [from, to] of DIGRAPHS) {
    result = result.split(from).join(to);
  }

  return result;
}

const PUNY_BASE = 36;
const PUNY_T_MIN = 1;
const PUNY_T_MAX = 26;
const PUNY_SKEW = 38;
const PUNY_DAMP = 700;
const PUNY_INITIAL_BIAS = 72;
const PUNY_INITIAL_N = 128;

function puny_adapt(delta: number, count: number, first: boolean): number {
  let k = 0;
  let value = first ? Math.floor(delta / PUNY_DAMP) : Math.floor(delta / 2);

  value += Math.floor(value / count);
  while (value > Math.floor(((PUNY_BASE - PUNY_T_MIN) * PUNY_T_MAX) / 2)) {
    value = Math.floor(value / (PUNY_BASE - PUNY_T_MIN));
    k += PUNY_BASE;
  }

  return (
    k + Math.floor(((PUNY_BASE - PUNY_T_MIN + 1) * value) / (value + PUNY_SKEW))
  );
}

function puny_threshold(k: number, bias: number): number {
  if (k <= bias) return PUNY_T_MIN;
  if (k >= bias + PUNY_T_MAX) return PUNY_T_MAX;

  return k - bias;
}

function puny_digit_char(digit: number): string {
  return String.fromCharCode(digit < 26 ? 0x61 + digit : 0x30 + digit - 26);
}

function puny_digit_value(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 26;
  if (code >= 0x41 && code <= 0x5a) return code - 0x41;
  if (code >= 0x61 && code <= 0x7a) return code - 0x61;

  return PUNY_BASE;
}

function puny_encode(points: number[]): string | null {
  let output = "";

  for (const code of points) {
    if (code < 0x80) output += String.fromCharCode(code);
  }

  const basic_count = output.length;
  let handled = basic_count;

  if (basic_count > 0) output += "-";

  let n = PUNY_INITIAL_N;
  let delta = 0;
  let bias = PUNY_INITIAL_BIAS;

  while (handled < points.length) {
    let next = 0x110000;

    for (const code of points) {
      if (code >= n && code < next) next = code;
    }
    if (next === 0x110000) return null;
    delta += (next - n) * (handled + 1);
    if (delta > 0x7fffffff) return null;
    n = next;
    for (const code of points) {
      if (code < n) delta += 1;
      if (code !== n) continue;

      let q = delta;

      for (let k = PUNY_BASE; ; k += PUNY_BASE) {
        const t = puny_threshold(k, bias);

        if (q < t) break;
        output += puny_digit_char(t + ((q - t) % (PUNY_BASE - t)));
        q = Math.floor((q - t) / (PUNY_BASE - t));
      }
      output += puny_digit_char(q);
      bias = puny_adapt(delta, handled + 1, handled === basic_count);
      delta = 0;
      handled += 1;
    }
    delta += 1;
    n += 1;
  }

  return output;
}

function puny_decode(input: string): number[] | null {
  const output: number[] = [];
  const basic_end = input.lastIndexOf("-");

  for (let index = 0; index < Math.max(basic_end, 0); index++) {
    const code = input.charCodeAt(index);

    if (code >= 0x80) return null;
    output.push(code);
  }

  let n = PUNY_INITIAL_N;
  let bias = PUNY_INITIAL_BIAS;
  let i = 0;
  let index = basic_end > 0 ? basic_end + 1 : 0;

  while (index < input.length) {
    const old_i = i;
    let w = 1;

    for (let k = PUNY_BASE; ; k += PUNY_BASE) {
      if (index >= input.length) return null;

      const digit = puny_digit_value(input.charCodeAt(index));

      index += 1;
      if (digit >= PUNY_BASE) return null;
      i += digit * w;
      if (i > 0x7fffffff) return null;

      const t = puny_threshold(k, bias);

      if (digit < t) break;
      w *= PUNY_BASE - t;
      if (w > 0x7fffffff) return null;
    }

    const length = output.length + 1;

    bias = puny_adapt(i - old_i, length, old_i === 0);
    n += Math.floor(i / length);
    i %= length;
    if (n > 0x10ffff || is_lone_surrogate(n)) return null;
    output.splice(i, 0, n);
    i += 1;
  }

  return output;
}

function is_ascii(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) > 0x7f) return false;
  }

  return true;
}

function is_ascii_label(label: string): boolean {
  if (label.length === 0 || label.length > 63) return false;
  if (label.startsWith("-") || label.endsWith("-")) return false;

  for (let index = 0; index < label.length; index++) {
    const code = label.charCodeAt(index);
    const allowed =
      (code >= 0x61 && code <= 0x7a) ||
      (code >= 0x30 && code <= 0x39) ||
      code === 0x2d;

    if (!allowed) return false;
  }

  return true;
}

function label_to_ascii(label: string): string | null {
  if (is_ascii(label)) return is_ascii_label(label) ? label : null;

  for (const code of code_points(label)) {
    const ascii_allowed =
      (code >= 0x61 && code <= 0x7a) ||
      (code >= 0x30 && code <= 0x39) ||
      code === 0x2d;

    if (code < 0x80 && !ascii_allowed) return null;
    if (code >= 0x80 && in_ranges(code, SEPARATOR_RANGES)) return null;
    if (in_ranges(code, SPACE_RANGES)) return null;
  }

  const encoded = puny_encode(code_points(label));

  if (encoded === null) return null;

  const ascii = `xn--${encoded}`;

  return is_ascii_label(ascii) ? ascii : null;
}

export function domain_to_ascii(raw: string): string {
  const folded = clean_text(raw.normalize("NFKC"), false)
    .toLowerCase()
    .replace(/[\u3002\uff0e\uff61]/g, ".");
  const trimmed = folded.endsWith(".") ? folded.slice(0, -1) : folded;

  if (!trimmed || trimmed.includes(" ")) return "";

  const labels: string[] = [];

  for (const label of trimmed.split(".")) {
    const ascii = label_to_ascii(label);

    if (ascii === null) return "";
    labels.push(ascii);
  }
  if (labels.length < 2) return "";

  const joined = labels.join(".");

  if (joined.length > MAX_DOMAIN_LENGTH) return "";
  if (/^[0-9]+$/.test(labels[labels.length - 1])) return "";

  return joined;
}

function label_to_unicode(label: string): string {
  if (!label.startsWith("xn--")) return label;

  const decoded = puny_decode(label.slice(4));

  if (decoded === null || decoded.length === 0) return label;

  const text = String.fromCodePoint(...decoded);

  if (text !== text.normalize("NFKC") || text !== text.toLowerCase()) {
    return label;
  }
  if (clean_text(text, false) !== text || is_ascii(text)) return label;
  if (label_to_ascii(text) !== label) return label;

  return text;
}

function script_of(code: number): string {
  if (code < 0x80) {
    const letter =
      (code >= 0x61 && code <= 0x7a) || (code >= 0x41 && code <= 0x5a);

    return letter ? "latin" : "common";
  }
  if (code >= 0x00c0 && code <= 0x024f) return "latin";
  if (code >= 0x1e00 && code <= 0x1eff) return "latin";
  for (const [start, end, script] of SCRIPT_RANGES) {
    if (code >= start && code <= end) return script;
  }

  return "other";
}

function is_accented_latin(char: string): boolean {
  if (DISTINCT_LATIN_LETTERS.has(char)) return true;

  const base = code_points(char.normalize("NFD"))
    .filter((code) => !is_combining(code))
    .map((code) => String.fromCodePoint(code))
    .join("");

  return base !== char && /^[a-z]$/.test(base);
}

function is_ascii_lookalike(char: string): boolean {
  return domain_skeletons(char).some((key) => /^[a-z0-9]+$/.test(key));
}

function is_safe_unicode_label(text: string): boolean {
  const scripts = new Set<string>();
  let has_distinct = false;

  for (const code of code_points(text)) {
    const script = script_of(code);

    if (script === "common") continue;
    if (!DISPLAY_SCRIPTS.has(script)) return false;
    scripts.add(script);
    if (code < 0x80) continue;

    const char = String.fromCodePoint(code);

    if (script === "latin") {
      if (!is_accented_latin(char)) return false;
      has_distinct = true;
    } else if (!is_ascii_lookalike(char)) {
      has_distinct = true;
    }
  }
  if (scripts.size !== 1 || !has_distinct) return false;

  return !domain_skeletons(text).some((key) => BRAND_LABEL_SKELETONS.has(key));
}

export function domain_for_display(ascii_domain: string): string {
  return ascii_domain
    .split(".")
    .map((label) => {
      const text = label_to_unicode(label);

      return text !== label && is_safe_unicode_label(text) ? text : label;
    })
    .join(".");
}

function domain_unicode(ascii_domain: string): string {
  return ascii_domain.split(".").map(label_to_unicode).join(".");
}

export function registrable_domain(ascii_domain: string): string {
  const labels = ascii_domain.split(".");

  if (labels.length <= 2) return ascii_domain;

  for (const tenant of SHARED_TENANT_DOMAINS) {
    if (ascii_domain.endsWith(`.${tenant}`)) {
      return labels.slice(-(tenant.split(".").length + 1)).join(".");
    }
  }

  const tld = labels[labels.length - 1];
  const second = labels[labels.length - 2];
  const take = tld.length === 2 && SECOND_LEVEL.has(second) ? 3 : 2;

  return labels.slice(-take).join(".");
}

function is_tenant_host(registrable: string): boolean {
  return SHARED_TENANT_DOMAINS.some((tenant) =>
    registrable.endsWith(`.${tenant}`),
  );
}

function registrable_label(registrable: string): string {
  return registrable.split(".")[0];
}

function within_domain(ascii_domain: string, parent: string): boolean {
  return ascii_domain === parent || ascii_domain.endsWith(`.${parent}`);
}

function parse_address(raw: string | null | undefined): ParsedAddress | null {
  if (typeof raw !== "string") return null;

  let text = clean_text(raw, false).trim();
  const open = text.lastIndexOf("<");
  const close = text.lastIndexOf(">");

  if (open >= 0 && close > open) text = text.slice(open + 1, close).trim();
  if (!text || text.length > MAX_ADDRESS_LENGTH || text.includes(" ")) {
    return null;
  }

  const at = text.lastIndexOf("@");

  if (at <= 0 || at === text.length - 1) return null;

  const local = text.slice(0, at);
  const ascii_domain = domain_to_ascii(text.slice(at + 1));

  if (!ascii_domain || /[<>()\[\],;:"\\]/.test(local)) return null;

  const domain = domain_for_display(ascii_domain);

  return {
    local,
    domain,
    ascii_domain,
    registrable: registrable_domain(ascii_domain),
    address: `${local}@${domain}`,
  };
}

function address_key(parsed: ParsedAddress): string {
  return `${fold(parsed.local)}@${parsed.ascii_domain}`;
}

function mailbox_key(parsed: ParsedAddress): string {
  const tagless = fold(parsed.local).split("+")[0];
  const local = DOTLESS_MAILBOX_DOMAINS.has(parsed.ascii_domain)
    ? tagless.split(".").join("")
    : tagless;

  return `${local}@${parsed.ascii_domain}`;
}

function is_shared_domain(parsed: ParsedAddress): boolean {
  return (
    PUBLIC_MAILBOX_DOMAINS.has(parsed.ascii_domain) ||
    HOME_BRAND.domains.some((domain) =>
      within_domain(parsed.ascii_domain, domain),
    )
  );
}

function is_letter_lookalike(code: number): boolean {
  if (code < 0x80) return false;

  const mapped = CONFUSABLES.get(String.fromCodePoint(code));

  return mapped !== undefined && /^[a-z0-9]+$/.test(mapped);
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let current = "";

  const spaced = text.replace(MARK_SYMBOLS, " ");

  for (const code of code_points(clean_text(spaced.normalize("NFKC"), false))) {
    if (
      (in_ranges(code, SEPARATOR_RANGES) && !is_letter_lookalike(code)) ||
      in_ranges(code, NAME_SEPARATOR_RANGES) ||
      in_ranges(code, SPACE_RANGES)
    ) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += String.fromCodePoint(code);
  }
  if (current) tokens.push(current);

  return tokens;
}

interface NameClaim {
  compact_skeleton: string;
  compact_fold: string;
  bare_skeleton: string;
  bare_fold: string;
  has_generic: boolean;
  has_home_generic: boolean;
  has_company: boolean;
  foreign_script: boolean;
}

function plain_capitals(text: string): string {
  return /[a-z]/.test(text) ? text : text.split("I").join("i");
}

function is_foreign_script(text: string): boolean {
  let found = "";

  for (const code of code_points(text)) {
    const script = script_of(code);

    if (script === "common") continue;
    if (script === "latin" || script === "other") return false;
    if (found && found !== script) return false;
    found = script;
  }

  return found !== "";
}

function name_claim(text: string, capitals_aware: boolean): NameClaim {
  const kept: string[] = [];
  const bare: string[] = [];
  let has_generic = false;
  let has_home_generic = false;
  let has_company = false;

  for (const token of tokenize(text)) {
    const lowered = token.toLowerCase();
    const word =
      COMPANY_WORDS.has(lowered) || GENERIC_WORDS.has(lowered)
        ? lowered
        : skeleton(token);

    if (COMPANY_WORDS.has(word)) {
      has_company = true;
      continue;
    }
    if (GENERIC_WORDS.has(word)) {
      has_generic = true;
      if (!HOME_NEUTRAL_WORDS.has(word)) has_home_generic = true;
      continue;
    }
    kept.push(token);
    if (!/^[0-9]+$/.test(token)) bare.push(token);
  }

  const joined = kept.join("");
  const bare_joined = bare.join("");
  const shape = (value: string) =>
    capitals_aware ? plain_capitals(value) : value;

  return {
    compact_skeleton: skeleton(shape(joined)),
    compact_fold: fold(joined),
    bare_skeleton: skeleton(shape(bare_joined)),
    bare_fold: fold(bare_joined),
    has_generic,
    has_home_generic,
    has_company,
    foreign_script: is_foreign_script(joined),
  };
}

function reads_as_lookalike(match: BrandNameMatch, claim: NameClaim): boolean {
  return match.lookalike && (match.solo || !claim.foreign_script);
}

interface BrandNameMatch {
  claimed: string;
  lookalike: boolean;
  solo: boolean;
}

interface PreparedName {
  candidate: string;
  solo: boolean;
  variants: NameClaim[];
}

function prepare_names(
  names: string[],
  solo_names: string[] | undefined,
  ambiguous: boolean,
): PreparedName[] {
  return names.map((candidate) => ({
    candidate,
    solo: !ambiguous || (solo_names ?? []).includes(candidate),
    variants: [candidate, candidate.toLowerCase(), candidate.toUpperCase()]
      .map((variant) => name_claim(variant, false))
      .filter((variant) => variant.compact_skeleton !== ""),
  }));
}

function match_brand_name(
  claim: NameClaim,
  names: PreparedName[],
): BrandNameMatch | null {
  if (!claim.compact_skeleton) return null;

  for (const name of names) {
    for (const variant of name.variants) {
      if (
        variant.compact_fold === claim.compact_fold ||
        variant.compact_fold === claim.bare_fold
      ) {
        return { claimed: name.candidate, lookalike: false, solo: name.solo };
      }
      if (variant.compact_skeleton === claim.compact_skeleton) {
        return {
          claimed: name.candidate,
          lookalike: variant.compact_fold !== claim.compact_fold,
          solo: name.solo,
        };
      }
      if (variant.compact_skeleton === claim.bare_skeleton) {
        return {
          claimed: name.candidate,
          lookalike: variant.compact_fold !== claim.bare_fold,
          solo: name.solo,
        };
      }
    }
  }

  return null;
}

function is_brand_domain(
  parsed: ParsedAddress,
  brand: BrandEntry,
  authenticated: boolean,
): boolean {
  if (PUBLIC_MAILBOX_DOMAINS.has(parsed.ascii_domain)) {
    return (
      authenticated &&
      brand.domains.includes(parsed.ascii_domain) &&
      RESERVED_LOCAL_PARTS.has(parsed.local.toLowerCase())
    );
  }
  if (
    brand.domains.some((domain) => within_domain(parsed.ascii_domain, domain))
  ) {
    return true;
  }
  if (!brand.any_suffix) return false;

  const label = registrable_label(parsed.registrable);

  if (!(brand.suffix_labels ?? []).includes(label)) return false;

  return COUNTRY_SUFFIXES.has(parsed.registrable.slice(label.length + 1));
}

function is_official_home_address(parsed: ParsedAddress): boolean {
  return (
    HOME_BRAND.domains.includes(parsed.ascii_domain) &&
    HOME_BRAND.official_local_parts.includes(parsed.local.toLowerCase())
  );
}

function is_letter_or_number(code: number): boolean {
  return /[\p{L}\p{N}]/u.test(String.fromCodePoint(code));
}

function is_local_part_char(code: number): boolean {
  return (
    is_letter_or_number(code) ||
    code === 0x2e ||
    code === 0x2d ||
    code === 0x5f ||
    code === 0x2b
  );
}

function tighten_address(candidate: string): string {
  const points = code_points(candidate);
  const at = points.lastIndexOf(0x40);

  if (at < 0) return candidate;

  let start = at;

  while (start > 0 && is_local_part_char(points[start - 1])) start -= 1;

  let end = at + 1;

  while (
    end < points.length &&
    (is_letter_or_number(points[end]) ||
      points[end] === 0x2d ||
      points[end] === 0x2e)
  ) {
    end += 1;
  }
  while (end > at + 1 && !is_letter_or_number(points[end - 1])) end -= 1;

  return String.fromCodePoint(...points.slice(start, end));
}

function find_addresses_in_name(name: string): ParsedAddress[] {
  const folded = clean_text(name.normalize("NFKC"), false).replace(
    / *@ */g,
    "@",
  );
  const pattern = /[^\s<>()\[\]"',;:]+@[^\s<>()\[\]"',;:@]+/g;
  const found: ParsedAddress[] = [];
  let match = pattern.exec(folded);

  while (match !== null) {
    const parsed = parse_address(tighten_address(match[0]));

    if (parsed) found.push(parsed);
    match = pattern.exec(folded);
  }

  return found;
}

function is_domain_label_char(code: number): boolean {
  return (
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0x30 && code <= 0x39) ||
    code === 0x2d ||
    code === 0x2e
  );
}

function domain_shaped(run: string): string | null {
  const trimmed = run.replace(/^[.-]+|[.-]+$/g, "");
  const labels = trimmed.split(".");

  if (labels.length < 2 || labels.some((label) => label === "")) return null;
  if (!/^[a-z]{2,}$/.test(labels[labels.length - 1])) return null;

  return trimmed;
}

function is_gap(code: number | undefined): boolean {
  return code === 0x20 || code === 0x09 || code === 0xa0;
}

function ascii_lower(code: number | undefined): number {
  if (code === undefined) return -1;

  return code >= 0x41 && code <= 0x5a ? code + 0x20 : code;
}

function bracketed_dot_end(points: number[], open: number): number {
  let position = open + 1;

  while (is_gap(points[position])) position += 1;
  if (points[position] === 0x2e) {
    position += 1;
  } else if (
    ascii_lower(points[position]) === 0x64 &&
    ascii_lower(points[position + 1]) === 0x6f &&
    ascii_lower(points[position + 2]) === 0x74
  ) {
    position += 3;
  } else {
    return -1;
  }
  while (is_gap(points[position])) position += 1;

  const close = points[position];

  return close === 0x29 || close === 0x5d || close === 0x7d ? position + 1 : -1;
}

function starts_framework_suffix(points: number[], position: number): boolean {
  const after = points[position + 3];

  return (
    ascii_lower(points[position]) === 0x6e &&
    ascii_lower(points[position + 1]) === 0x65 &&
    ascii_lower(points[position + 2]) === 0x74 &&
    (after === undefined || !is_letter_or_number(after))
  );
}

function plain_dots(name: string): string {
  const points = code_points(name);
  const out: number[] = [];
  let position = 0;

  while (position < points.length) {
    const code = points[position];
    const end =
      code === 0x28 || code === 0x5b || code === 0x7b
        ? bracketed_dot_end(points, position)
        : -1;

    if (end >= 0) {
      while (out.length > 0 && is_gap(out[out.length - 1])) out.pop();
      out.push(0x2e);
      position = end;
      while (is_gap(points[position])) position += 1;
      continue;
    }
    if (
      code === 0x2e &&
      out.length > 0 &&
      is_gap(out[out.length - 1]) &&
      position + 1 < points.length &&
      is_letter_or_number(points[position + 1]) &&
      !starts_framework_suffix(points, position + 1)
    ) {
      while (out.length > 0 && is_gap(out[out.length - 1])) out.pop();
      out.push(0x2e);
      position += 1;
      continue;
    }
    out.push(code);
    position += 1;
  }

  return String.fromCodePoint(...out);
}

function loose_dots(name: string): string {
  const points = code_points(name);
  const out: number[] = [];
  let position = 0;

  while (position < points.length) {
    const code = points[position];

    if (code === 0x2e) {
      let before = out.length;
      let after = position + 1;

      while (before > 0 && is_gap(out[before - 1])) before -= 1;
      while (is_gap(points[after])) after += 1;
      if (
        before > 0 &&
        after < points.length &&
        is_letter_or_number(out[before - 1]) &&
        is_letter_or_number(points[after])
      ) {
        out.length = before;
        out.push(0x2e);
        position = after;
        continue;
      }
    }
    out.push(code);
    position += 1;
  }

  return String.fromCodePoint(...out);
}

function label_runs(text: string): string[] {
  const runs: string[] = [];
  let run = "";

  for (const code of code_points(text)) {
    if (is_domain_label_char(code)) {
      run += String.fromCodePoint(code);
      continue;
    }
    if (run) runs.push(run);
    run = "";
  }
  if (run) runs.push(run);

  return runs;
}

function shaped_targets(text: string): string[] {
  const targets: string[] = [];

  for (const candidate of label_runs(text)) {
    const shaped = domain_shaped(candidate);

    if (shaped) targets.push(registrable_domain(shaped));
  }

  return targets;
}

function inner_targets(text: string): string[] {
  const targets: string[] = [];

  for (const candidate of label_runs(text)) {
    const shaped = domain_shaped(candidate);

    if (!shaped) continue;

    const labels = shaped.split(".");

    for (let start = 0; start < labels.length - 2; start += 1) {
      for (let size = 2; size <= 3; size += 1) {
        const end = start + size;

        if (end >= labels.length) break;
        if (
          end === labels.length - 1 &&
          labels[end].length === 2 &&
          SECOND_LEVEL.has(labels[end - 1])
        ) {
          continue;
        }

        const inner = labels.slice(start, end).join(".");

        if (BRAND_DOMAIN_INDEX.by_skeleton.has(inner)) targets.push(inner);
      }
    }
  }

  return targets;
}

function domains_in_name(name: string): string[] {
  const targets: string[] = [];
  const keep = (target: string) => {
    if (target && !targets.includes(target)) targets.push(target);
  };
  const plain = plain_dots(name);
  const bases = plain === name ? [name] : [name, plain];

  for (const base of bases) {
    shaped_targets(skeleton(base)).forEach(keep);
    shaped_targets(skeleton(fold(base))).forEach(keep);
  }

  const loose = loose_dots(plain);

  if (loose !== plain) {
    for (const text of [skeleton(loose), skeleton(fold(loose))]) {
      for (const target of shaped_targets(text)) {
        if (BRAND_DOMAIN_INDEX.by_skeleton.has(target)) keep(target);
      }
    }
  }
  for (const target of shaped_targets(fold(plain))) {
    if (!target.includes("xn--")) continue;

    const unicode = domain_unicode(target);

    if (unicode !== target) keep(skeleton(unicode));
  }
  for (const base of bases) {
    inner_targets(skeleton(fold(base))).forEach(keep);
  }

  return targets;
}

interface DomainIndex {
  registrables: Set<string>;
  by_skeleton: Map<string, string>;
  by_label_skeleton: Map<string, string[]>;
}

function build_domain_index(
  domains: string[],
  label_level: boolean,
): DomainIndex {
  const index: DomainIndex = {
    registrables: new Set(),
    by_skeleton: new Map(),
    by_label_skeleton: new Map(),
  };

  for (const candidate of domains) {
    const target = registrable_domain(candidate);

    if (!target || index.registrables.has(target)) continue;
    index.registrables.add(target);

    const full = skeleton(target);

    if (!index.by_skeleton.has(full)) index.by_skeleton.set(full, target);
    if (!label_level) continue;

    const label = registrable_label(target);

    if (label.length < 4) continue;

    const label_skeleton = skeleton(label);
    const bucket = index.by_label_skeleton.get(label_skeleton);

    if (bucket) bucket.push(target);
    else index.by_label_skeleton.set(label_skeleton, [target]);
  }

  return index;
}

function upper_non_ascii(text: string): string {
  let result = "";

  for (const code of code_points(text)) {
    const char = String.fromCodePoint(code);
    const upper = code > 0x7f ? char.toUpperCase() : char;

    result += Array.from(upper).length === 1 ? upper : char;
  }

  return result;
}

function domain_skeletons(text: string): string[] {
  const plain = skeleton(text);
  const cased = skeleton(upper_non_ascii(text));

  return cased === plain ? [plain] : [plain, cased];
}

function lookalike_of(
  parsed: ParsedAddress,
  index: DomainIndex,
): string | null {
  if (index.registrables.has(parsed.registrable)) return null;

  const unicode = domain_unicode(parsed.registrable);

  for (const key of domain_skeletons(unicode)) {
    const full = index.by_skeleton.get(key);

    if (full) return full;
  }

  const label = registrable_label(parsed.registrable);

  for (const key of domain_skeletons(registrable_label(unicode))) {
    for (const target of index.by_label_skeleton.get(key) ?? []) {
      if (registrable_label(target) !== label) return target;
    }
  }

  const labels = parsed.ascii_domain.split(".");
  const depth =
    labels.length -
    parsed.registrable.split(".").length +
    (is_tenant_host(parsed.registrable) ? 1 : 0);

  for (let start = 0; start < depth; start += 1) {
    for (let size = 2; size <= 3; size += 1) {
      if (start + size > depth) break;

      const inner = labels.slice(start, start + size).join(".");

      for (const key of domain_skeletons(domain_unicode(inner))) {
        const known = index.by_skeleton.get(key);

        if (known) return known;
      }
    }
  }

  return null;
}

const HOME_NAMES = prepare_names(HOME_BRAND.names, HOME_BRAND.solo_names, true);
const BRAND_NAMES = BRANDS.map((brand) =>
  prepare_names(brand.names, brand.solo_names, brand.ambiguous === true),
);
const BRAND_DOMAIN_INDEX = build_domain_index(
  [
    ...HOME_BRAND.domains,
    ...BRANDS.flatMap((brand) => brand.domains),
    ...trust_data.lookalike_only_domains,
  ],
  true,
);
const BRAND_LABEL_SKELETONS = new Set<string>(
  [...BRAND_DOMAIN_INDEX.registrables].map((domain) =>
    skeleton(domain_unicode(registrable_label(domain))),
  ),
);

interface PersonalContext {
  own_keys: Set<string>;
  contact_keys: Set<string>;
  contact_names: Map<string, string>;
  domains: DomainIndex;
}

function contact_name_key(name: string): string {
  return skeleton(tokenize(name).join(" "));
}

function build_personal_context(
  own_addresses: string[],
  contacts: SenderTrustContact[],
): PersonalContext {
  const own_keys = new Set<string>();
  const contact_keys = new Set<string>();
  const contact_names = new Map<string, string>();
  const domains: string[] = [];

  for (const own of own_addresses) {
    const parsed = parse_address(own);

    if (!parsed) continue;
    own_keys.add(address_key(parsed));
    domains.push(parsed.ascii_domain);
  }
  for (const contact of contacts) {
    let has_address = false;

    for (const email of Array.isArray(contact?.emails) ? contact.emails : []) {
      const parsed = parse_address(email);

      if (!parsed) continue;
      has_address = true;
      contact_keys.add(address_key(parsed));
      domains.push(parsed.ascii_domain);
    }
    if (!has_address) continue;

    const contact_name = sanitize_display_name(contact.name);
    const key = contact_name_key(contact_name);

    if (key && !contact_names.has(key)) contact_names.set(key, contact_name);
  }

  return {
    own_keys,
    contact_keys,
    contact_names,
    domains: build_domain_index(domains, false),
  };
}

const NO_ADDRESSES: string[] = [];
const NO_CONTACTS: SenderTrustContact[] = [];
let cached_own: string[] | null = null;
let cached_contacts: SenderTrustContact[] | null = null;
let cached_context: PersonalContext | null = null;

function personal_context_of(input: SenderTrustInput): PersonalContext {
  const own = Array.isArray(input.own_addresses)
    ? input.own_addresses
    : NO_ADDRESSES;
  const contacts = Array.isArray(input.contacts) ? input.contacts : NO_CONTACTS;

  if (cached_context && cached_own === own && cached_contacts === contacts) {
    return cached_context;
  }

  cached_context = build_personal_context(own, contacts);
  cached_own = own;
  cached_contacts = contacts;

  return cached_context;
}

function status_of(raw: string | null | undefined): string {
  const value =
    typeof raw === "string"
      ? raw.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "").toLowerCase()
      : "";

  if (!value || value === "missing") return "missing";
  if (value === "pass" || value === "none") return value;
  if (value === "fail" || value === "hardfail") return "fail";

  return "other";
}

function auth_state_of(input: SenderTrustInput): SenderAuthState {
  if (input.is_internal === true) return "internal";

  const statuses = [
    status_of(input.spf_result),
    status_of(input.dkim_result),
    status_of(input.dmarc_result),
  ];
  const has = (status: string) => statuses.includes(status);

  if (input.sender_aligned === true) return "authenticated";
  if (input.sender_aligned === false)
    return has("fail") ? "failed" : "unverified";
  if (statuses.every((status) => status === "missing")) return "unknown";
  if (statuses[2] === "fail") return "failed";
  if (statuses[2] === "pass") return "authenticated";
  if (has("pass") || has("other")) return "unknown";
  if (has("fail")) return "failed";

  return "unverified";
}

function claims_identity(name: string): boolean {
  if (!name) return false;
  if (find_addresses_in_name(name).length > 0) return true;

  const claim = name_claim(name, true);

  if (match_brand_name(claim, HOME_NAMES)) return true;

  return BRAND_NAMES.some((names) => match_brand_name(claim, names) !== null);
}

function is_protected_claim(
  candidate: ParsedAddress,
  personal: PersonalContext,
): boolean {
  const key = address_key(candidate);

  if (personal.own_keys.has(key) || personal.contact_keys.has(key)) {
    return true;
  }
  if (is_shared_domain(candidate)) {
    return (
      RESERVED_LOCAL_PARTS.has(fold(candidate.local)) ||
      is_official_home_address(candidate)
    );
  }
  if (
    BRAND_DOMAIN_INDEX.registrables.has(candidate.registrable) ||
    personal.domains.registrables.has(candidate.registrable)
  ) {
    return true;
  }

  return (
    lookalike_of(candidate, BRAND_DOMAIN_INDEX) !== null ||
    lookalike_of(candidate, personal.domains) !== null
  );
}

function find_warning(
  name: string,
  parsed: ParsedAddress,
  auth_state: SenderAuthState,
  personal: PersonalContext,
): SenderWarning | null {
  const trusted_auth =
    auth_state === "internal" || auth_state === "authenticated";

  if (trusted_auth && personal.own_keys.has(address_key(parsed))) return null;

  const lookalike =
    lookalike_of(parsed, BRAND_DOMAIN_INDEX) ??
    lookalike_of(parsed, personal.domains);

  if (lookalike) return { kind: "lookalike_domain", claimed: lookalike };

  const in_local = parsed.local.includes("@")
    ? parse_address(parsed.local)
    : null;

  if (in_local && in_local.registrable !== parsed.registrable) {
    return { kind: "lookalike_domain", claimed: in_local.registrable };
  }
  if (!name) return null;

  const relayed = RELAY_DOMAINS.some((domain) =>
    within_domain(parsed.ascii_domain, domain),
  );
  const from_home = HOME_BRAND.domains.some((domain) =>
    within_domain(parsed.ascii_domain, domain),
  );
  const shared_domain = is_shared_domain(parsed);
  const in_name = find_addresses_in_name(name).find(
    (candidate) =>
      (candidate.registrable !== parsed.registrable ||
        (shared_domain && mailbox_key(candidate) !== mailbox_key(parsed))) &&
      (!relayed || is_protected_claim(candidate, personal)),
  );

  if (in_name) {
    return { kind: "address_in_name", claimed: in_name.address };
  }

  const named_targets = domains_in_name(name);

  for (const target of named_targets) {
    const named_domain = BRAND_DOMAIN_INDEX.by_skeleton.get(target);

    if (!named_domain || named_domain === parsed.registrable) continue;
    if (PUBLIC_MAILBOX_DOMAINS.has(named_domain)) continue;

    const home_named = HOME_BRAND.domains.some(
      (domain) => registrable_domain(domain) === named_domain,
    );
    const owners = BRANDS.filter((entry) =>
      entry.domains.some(
        (domain) => registrable_domain(domain) === named_domain,
      ),
    );

    if (home_named) {
      if (!from_home) {
        return { kind: "home_brand_name", claimed: HOME_BRAND.names[0] };
      }
    } else if (
      owners.length > 0 &&
      !owners.some((entry) => is_brand_domain(parsed, entry, trusted_auth))
    ) {
      return { kind: "brand_name", claimed: named_domain };
    }
  }

  for (const target of named_targets) {
    if (target === parsed.registrable) continue;
    if (BRAND_DOMAIN_INDEX.by_skeleton.has(target)) continue;

    const label = registrable_label(target);
    const label_claim = name_claim(label, true);
    const home_label = match_brand_name(label_claim, HOME_NAMES);

    if (
      home_label &&
      (reads_as_lookalike(home_label, label_claim) || home_label.solo)
    ) {
      if (!from_home) {
        return { kind: "home_brand_name", claimed: HOME_BRAND.names[0] };
      }
      continue;
    }

    const country = COUNTRY_SUFFIXES.has(target.slice(label.length + 1));

    for (let position = 0; position < BRANDS.length; position += 1) {
      const match = match_brand_name(label_claim, BRAND_NAMES[position]);

      if (!match) continue;
      if (is_brand_domain(parsed, BRANDS[position], trusted_auth)) break;
      if (reads_as_lookalike(match, label_claim)) {
        return { kind: "lookalike_name", claimed: match.claimed };
      }
      if (match.solo || country) {
        return { kind: "brand_name", claimed: match.claimed };
      }
      break;
    }
  }

  const claim = name_claim(name, true);
  const home = match_brand_name(claim, HOME_NAMES);

  if (
    home &&
    (reads_as_lookalike(home, claim) || home.solo || claim.has_home_generic)
  ) {
    const trusted = is_official_home_address(parsed) && trusted_auth;

    return trusted
      ? null
      : { kind: "home_brand_name", claimed: HOME_BRAND.names[0] };
  }

  for (let position = 0; position < BRANDS.length; position += 1) {
    const brand = BRANDS[position];
    const match = match_brand_name(claim, BRAND_NAMES[position]);

    if (!match) continue;
    if (is_brand_domain(parsed, brand, trusted_auth)) return null;
    if (reads_as_lookalike(match, claim)) {
      return { kind: "lookalike_name", claimed: match.claimed };
    }
    if (
      match.solo ||
      claim.has_generic ||
      (claim.has_company && brand.company_claim === true)
    ) {
      return { kind: "brand_name", claimed: match.claimed };
    }

    return null;
  }

  return null;
}

function find_contact_notice(
  name: string,
  parsed: ParsedAddress,
  personal: PersonalContext,
): string | null {
  if (!name || personal.contact_names.size === 0) return null;

  const key = address_key(parsed);

  if (personal.contact_keys.has(key) || personal.own_keys.has(key)) return null;

  const name_key = contact_name_key(name);

  if (code_points(name_key).length < MIN_CONTACT_NAME_LENGTH) return null;
  if (!name_key.includes(" ")) return null;

  return personal.contact_names.get(name_key) ?? null;
}

function split_address_list(text: string): string[] {
  const entries: string[] = [];
  let current = "";
  let quoted = false;
  let escaped = false;
  let angle = false;

  for (const char of text) {
    if (escaped) {
      escaped = false;
      current += char;
      continue;
    }
    if (quoted && char === "\\") {
      escaped = true;
      current += char;
      continue;
    }
    if (char === '"' && !angle) quoted = !quoted;
    else if (!quoted && char === "<") angle = true;
    else if (!quoted && char === ">") angle = false;
    if (!quoted && !angle && (char === "," || char === ";")) {
      if (current.trim()) entries.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) entries.push(current);

  return entries;
}

const REPLY_TO_DELIMITERS = /[ \t\n\r<>()\[\],;:"\\]/;

function embedded_reply_to(
  parsed: ParsedAddress,
  entry: string,
  is_parsed: boolean,
): string | null {
  const cleaned = clean_text(entry, false).replace(/[\uff20\ufe6b]/g, "@");
  const first = cleaned.indexOf("@");

  if (first < 0) return null;
  if (is_parsed && cleaned.indexOf("@", first + 1) < 0) return null;

  for (const token of cleaned.split(REPLY_TO_DELIMITERS)) {
    const piece = token.replace(/^['.]+|['.]+$/g, "");

    if (!piece.includes("@")) continue;

    const parts = piece.split("@");

    for (let index = 1; index < parts.length; index++) {
      const local = parts[index - 1];
      const reply = parse_address(`${local || "a"}@${parts[index]}`);

      if (!reply) {
        const host = parts[index].toLowerCase();

        if (!host && !local) continue;
        if (host && !host.includes(".")) continue;
        if (
          host === parsed.registrable ||
          host.endsWith(`.${parsed.registrable}`)
        ) {
          continue;
        }

        return cap_code_points(piece, MAX_ADDRESS_LENGTH);
      }
      if (reply.registrable !== parsed.registrable) {
        return local ? reply.address : reply.domain;
      }
    }
  }

  return null;
}

function reply_to_notice(
  parsed: ParsedAddress,
  reply_to: string | null | undefined,
  personal: PersonalContext,
): string | null {
  if (typeof reply_to !== "string" || !reply_to.trim()) return null;

  const entries = split_address_list(reply_to);
  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry)) continue;
    seen.add(entry);

    const reply = parse_address(entry);

    if (reply && personal.own_keys.has(address_key(reply))) continue;
    if (reply && reply.registrable !== parsed.registrable) return reply.address;

    const embedded = embedded_reply_to(parsed, entry, reply !== null);

    if (embedded) return embedded;
  }

  return null;
}

export function evaluate_sender_trust(input: SenderTrustInput): SenderTrust {
  const parsed = parse_address(input.email);
  const sanitized = sanitize_display_name(input.name);
  const auth_state = auth_state_of(input);

  if (!parsed) {
    const cleaned = cap_code_points(
      clean_text(typeof input.email === "string" ? input.email : "", false),
      MAX_ADDRESS_LENGTH,
    );
    const has_address = cleaned !== "";
    const fallback =
      /^[!-~]+$/.test(cleaned) && cleaned.includes("@") ? cleaned : "";

    return {
      name: has_address || claims_identity(sanitized) ? "" : sanitized,
      address: fallback,
      domain: "",
      auth_state:
        has_address && auth_state !== "internal" ? "unverified" : auth_state,
      warning: null,
      contact_notice: null,
      reply_to: null,
      show_identity_marks: false,
      show_verified_badge: false,
    };
  }

  const name_is_address =
    sanitized !== "" &&
    fold(sanitized) === fold(`${parsed.local}@${parsed.ascii_domain}`);
  const base_name = name_is_address ? "" : sanitized;
  const internal = auth_state === "internal";
  const personal = personal_context_of(input);
  const whole_name = name_is_address
    ? ""
    : capped_display_name(input.name, MAX_NAME_LENGTH + MAX_ADDRESS_LENGTH);
  let warning = find_warning(base_name, parsed, auth_state, personal);
  const checked = [base_name];

  for (const other of [whole_name, enclosed_plain(whole_name)]) {
    if (warning !== null || checked.includes(other)) continue;
    checked.push(other);
    warning = find_warning(other, parsed, auth_state, personal);
  }
  const hide_name =
    warning !== null &&
    (warning.kind !== "lookalike_domain" || claims_identity(base_name));
  const distrusted = auth_state === "failed" || auth_state === "unverified";
  const verified_domain =
    typeof input.sender_verified_domain === "string"
      ? domain_to_ascii(input.sender_verified_domain)
      : "";
  const verified_matches =
    verified_domain !== "" &&
    within_domain(parsed.ascii_domain, verified_domain);

  return {
    name: hide_name ? "" : base_name,
    address: parsed.address,
    domain: parsed.domain,
    auth_state,
    warning,
    contact_notice:
      warning === null && !internal
        ? find_contact_notice(base_name, parsed, personal)
        : null,
    reply_to: reply_to_notice(parsed, input.reply_to, personal),
    show_identity_marks: warning === null && !distrusted,
    show_verified_badge:
      input.sender_verified === true &&
      verified_matches &&
      warning === null &&
      (auth_state === "authenticated" || auth_state === "internal"),
  };
}
