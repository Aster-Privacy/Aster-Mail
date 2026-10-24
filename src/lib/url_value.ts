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
const EDGE_C0_CONTROL_OR_SPACE = /^[\u0000- ]+|[\u0000- ]+$/g;
const ASCII_TAB_OR_NEWLINE = /[\t\n\r]/g;
const WEB_SCHEME = /^https?:/i;
const ABSOLUTE_WEB_URL = /^https?:\/\//i;
const SCHEME_RELATIVE = /^[\\/]{2}/;
const URL_SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const FALLBACK_BASE_URL = "https://local.invalid/";
const LOCAL_RESOURCE_SCHEMES = new Set(["data", "blob", "cid"]);
const SRCSET_WHITESPACE_CODES = new Set([32, 9, 10, 13, 12]);

export interface SrcsetCandidate {
  url: string;
  descriptor: string;
}

export function normalize_url_value(value: string): string {
  return value
    .replace(EDGE_C0_CONTROL_OR_SPACE, "")
    .replace(ASCII_TAB_OR_NEWLINE, "");
}

export function get_page_origin(): string | null {
  if (typeof window === "undefined") return null;

  const origin = window.location?.origin;

  return origin && origin !== "null" ? origin : null;
}

function get_page_base(): string {
  if (typeof document !== "undefined" && document.baseURI) {
    return document.baseURI;
  }

  return get_page_origin() ?? FALLBACK_BASE_URL;
}

export function get_url_scheme(value: string): string | null {
  const match = URL_SCHEME.exec(normalize_url_value(value));

  return match ? match[1].toLowerCase() : null;
}

export function is_local_resource_url(value: string): boolean {
  const scheme = get_url_scheme(value);

  return scheme !== null && LOCAL_RESOURCE_SCHEMES.has(scheme);
}

export function is_remote_url_value(value: string): boolean {
  const normalized = normalize_url_value(value);

  if (!normalized) return false;
  if (WEB_SCHEME.test(normalized) || SCHEME_RELATIVE.test(normalized)) {
    return true;
  }
  if (URL_SCHEME.test(normalized)) return false;

  const page_origin = get_page_origin();

  if (!page_origin) return false;

  try {
    const parsed = new URL(normalized, get_page_base());

    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.origin !== page_origin
    );
  } catch {
    return false;
  }
}

export function to_absolute_remote_url(value: string): string {
  const normalized = normalize_url_value(value);

  if (ABSOLUTE_WEB_URL.test(normalized)) return normalized;

  try {
    const parsed = new URL(normalized, FALLBACK_BASE_URL);

    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return normalized;
  }

  return normalized;
}

export function resolve_url_origin(value: string): string | null {
  try {
    const parsed = new URL(normalize_url_value(value), get_page_base());

    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

export function is_trusted_render_url(
  value: string,
  trusted_origins: ReadonlySet<string>,
): boolean {
  const normalized = normalize_url_value(value);

  if (!normalized) return true;
  if (is_local_resource_url(normalized)) return true;

  const scheme = get_url_scheme(normalized);

  if (scheme !== null && scheme !== "http" && scheme !== "https") {
    return false;
  }

  const origin = resolve_url_origin(normalized);

  return origin !== null && trusted_origins.has(origin);
}

function is_srcset_whitespace(character: string): boolean {
  return SRCSET_WHITESPACE_CODES.has(character.charCodeAt(0));
}

export function parse_srcset_candidates(value: string): SrcsetCandidate[] {
  const candidates: SrcsetCandidate[] = [];
  let position = 0;

  while (position < value.length) {
    while (
      position < value.length &&
      (is_srcset_whitespace(value[position]) || value[position] === ",")
    ) {
      position += 1;
    }

    if (position >= value.length) break;

    const url_start = position;

    while (position < value.length && !is_srcset_whitespace(value[position])) {
      position += 1;
    }

    let url = value.slice(url_start, position);
    let descriptor = "";

    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
    } else {
      const descriptor_start = position;

      while (position < value.length && value[position] !== ",") {
        position += 1;
      }

      descriptor = value.slice(descriptor_start, position).trim();

      if (position < value.length) position += 1;
    }

    if (url) candidates.push({ url, descriptor });
  }

  return candidates;
}
