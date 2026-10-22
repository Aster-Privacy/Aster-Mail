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

export interface AutolinkMatch {
  start: number;
  end: number;
  text: string;
  href: string;
}

const URL_PREFIXES = ["https://", "http://", "www."];

const URL_STOP_PATTERN = /[\s<>"'`]/g;

const LOCAL_PART_STOP_PATTERN = /[^A-Za-z0-9._%+-]/g;

const EMAIL_DOMAIN_PATTERN =
  /[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}/y;

interface AutolinkCandidate {
  index: number;
  end: number;
  prefix: string | null;
}

function create_stop_finder(
  text: string,
  pattern: RegExp,
): (position: number) => number {
  const stop = new RegExp(pattern.source, "g");
  let cached_from = -1;
  let cached_at = -1;

  return (position) => {
    if (cached_from >= 0 && position >= cached_from && position <= cached_at) {
      return cached_at;
    }

    stop.lastIndex = position;
    const match = stop.exec(text);

    cached_from = position;
    cached_at = match ? match.index : text.length;

    return cached_at;
  };
}

function url_prefix_at(text: string, index: number): string | null {
  for (const prefix of URL_PREFIXES) {
    if (text.startsWith(prefix, index)) return prefix;
  }

  return null;
}

function create_candidate_finder(
  text: string,
): (from: number) => AutolinkCandidate | null {
  const url_end = create_stop_finder(text, URL_STOP_PATTERN);
  const local_part_end = create_stop_finder(text, LOCAL_PART_STOP_PATTERN);
  const domain = new RegExp(EMAIL_DOMAIN_PATTERN.source, "y");
  let cached_domain_start = -1;
  let cached_domain_end = -1;

  const domain_end = (start: number): number => {
    if (start !== cached_domain_start) {
      domain.lastIndex = start;
      cached_domain_start = start;
      cached_domain_end = domain.exec(text) ? domain.lastIndex : -1;
    }

    return cached_domain_end;
  };

  return (from) => {
    for (let index = from; index < text.length; index += 1) {
      const prefix = url_prefix_at(text, index);

      if (prefix) {
        const start = index + prefix.length;
        const end = url_end(start);

        if (end > start) return { index, end, prefix };
      }

      const at = local_part_end(index);

      if (at > index && text[at] === "@") {
        const end = domain_end(at + 1);

        if (end >= 0) return { index, end, prefix: null };
      }
    }

    return null;
  };
}

const BLOCKED_LEADING_CHAR = /[\w@/.-]/;

function is_blocked_start(text: string, index: number): boolean {
  return index > 0 && BLOCKED_LEADING_CHAR.test(text[index - 1]);
}

const TRAILING_PUNCTUATION = new Set([
  ".",
  ",",
  ":",
  ";",
  "!",
  "?",
  "'",
  '"',
  "*",
  "_",
  "~",
]);

const BRACKET_PAIRS: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
};

const MAX_TLD_LENGTH = 24;

const ENTITY_NAME_CHAR = /[A-Za-z0-9]/;

function count_brackets(text: string): Map<string, number> {
  const counts = new Map<string, number>();

  for (const [closer, opener] of Object.entries(BRACKET_PAIRS)) {
    counts.set(closer, 0);
    counts.set(opener, 0);
  }

  for (let i = 0; i < text.length; i += 1) {
    const count = counts.get(text[i]);

    if (count !== undefined) counts.set(text[i], count + 1);
  }

  return counts;
}

function entity_start_before(text: string, end: number): number {
  let name_start = end - 1;

  while (name_start > 0 && ENTITY_NAME_CHAR.test(text[name_start - 1])) {
    name_start -= 1;
  }

  if (name_start === end - 1) return -1;
  if (text[name_start - 1] === "&") return name_start - 1;
  if (text[name_start - 1] === "#" && text[name_start - 2] === "&") {
    return name_start - 2;
  }

  return -1;
}

export function trim_url_tail(candidate: string): string {
  const counts = count_brackets(candidate);
  let end = candidate.length;

  while (end > 0) {
    const last = candidate[end - 1];

    if (last === ";") {
      const entity = entity_start_before(candidate, end);

      end = entity >= 0 ? entity : end - 1;
      continue;
    }
    if (TRAILING_PUNCTUATION.has(last)) {
      end -= 1;
      continue;
    }
    const opener = BRACKET_PAIRS[last];

    if (opener && counts.get(last)! > counts.get(opener)!) {
      counts.set(last, counts.get(last)! - 1);
      end -= 1;
      continue;
    }
    break;
  }

  return candidate.slice(0, end);
}

function has_host(url: string, scheme_length: number): boolean {
  const rest = url.slice(scheme_length);
  const host = rest.split(/[/?#]/, 1)[0];

  return /^[^\s.]+(\.[^\s.]+)*$/.test(host) && /[A-Za-z0-9]/.test(host);
}

export function trim_email_tail(address: string): string {
  const at = address.lastIndexOf("@");

  if (at < 0) return address;
  const domain = address.slice(at + 1);
  const dot = domain.lastIndexOf(".");

  if (dot < 0) return address;
  let tld = domain.slice(dot + 1);
  const seam = tld.search(/[a-z][A-Z]/);

  if (seam >= 0) tld = tld.slice(0, seam + 1);
  if (tld.length > MAX_TLD_LENGTH) tld = tld.slice(0, MAX_TLD_LENGTH);

  return address.slice(0, at + 1) + domain.slice(0, dot + 1) + tld;
}

export function find_autolinks(text: string): AutolinkMatch[] {
  const matches: AutolinkMatch[] = [];

  if (!text || !/:\/\/|www\.|@/i.test(text)) return matches;

  const next_candidate = create_candidate_finder(text);
  let cursor = 0;
  let match: AutolinkCandidate | null;

  while ((match = next_candidate(cursor)) !== null) {
    if (is_blocked_start(text, match.index)) {
      cursor = match.index + 1;
      continue;
    }
    const raw = text.slice(match.index, match.end);
    const prefix = match.prefix;

    if (prefix) {
      const url = trim_url_tail(raw);
      const is_www = prefix.toLowerCase() === "www.";

      if (
        url.length > prefix.length &&
        has_host(url, prefix.length) &&
        (!is_www || url.slice(prefix.length).includes("."))
      ) {
        matches.push({
          start: match.index,
          end: match.index + url.length,
          text: url,
          href: is_www ? `http://${url}` : url,
        });
      }
      cursor = match.index + Math.max(url.length, 1);
      continue;
    }

    const address = trim_email_tail(raw);

    matches.push({
      start: match.index,
      end: match.index + address.length,
      text: address,
      href: `mailto:${address}`,
    });
    cursor = match.index + address.length;
  }

  return matches;
}

export function split_autolinks(
  text: string,
): Array<{ text: string; href?: string }> {
  const segments: Array<{ text: string; href?: string }> = [];
  let cursor = 0;

  for (const link of find_autolinks(text)) {
    if (link.start > cursor) {
      segments.push({ text: text.slice(cursor, link.start) });
    }
    segments.push({ text: link.text, href: link.href });
    cursor = link.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });

  return segments;
}
