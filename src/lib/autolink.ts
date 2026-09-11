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

const CANDIDATE_PATTERN =
  /(?:(https?:\/\/|www\.)[^\s<>"'`]+|([A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}))/g;

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

function count_char(text: string, needle: string): number {
  let count = 0;

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === needle) count += 1;
  }

  return count;
}

export function trim_url_tail(candidate: string): string {
  let url = candidate;

  while (url.length > 0) {
    const last = url[url.length - 1];

    if (last === ";") {
      const entity = /&#?[A-Za-z0-9]+;$/.exec(url);

      url = entity ? url.slice(0, entity.index) : url.slice(0, -1);
      continue;
    }
    if (TRAILING_PUNCTUATION.has(last)) {
      url = url.slice(0, -1);
      continue;
    }
    const opener = BRACKET_PAIRS[last];

    if (opener && count_char(url, last) > count_char(url, opener)) {
      url = url.slice(0, -1);
      continue;
    }
    break;
  }

  return url;
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

  if (!text || (!/:\/\/|www\.|@/i.test(text))) return matches;

  CANDIDATE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CANDIDATE_PATTERN.exec(text)) !== null) {
    if (is_blocked_start(text, match.index)) {
      CANDIDATE_PATTERN.lastIndex = match.index + 1;
      continue;
    }
    const raw = match[0];
    const prefix = match[1];

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
      CANDIDATE_PATTERN.lastIndex = match.index + Math.max(url.length, 1);
      continue;
    }

    const address = trim_email_tail(match[2] || raw);

    matches.push({
      start: match.index,
      end: match.index + address.length,
      text: address,
      href: `mailto:${address}`,
    });
    CANDIDATE_PATTERN.lastIndex = match.index + address.length;
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
