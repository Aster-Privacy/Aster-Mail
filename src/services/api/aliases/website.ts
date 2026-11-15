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
import type {} from "@/lib/i18n/types";

import { IANA_TLDS } from "./iana_tlds";

export const MAX_ALIAS_WEBSITES = 10;
export const MAX_WEBSITE_URL_LENGTH = 200;

function has_userinfo(url: string): boolean {
  const authority = url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:[\\/]*([^\\/?#]*)/)?.[1];

  return authority?.includes("@") ?? false;
}

export function normalize_website_url(raw: string): string | null {
  const cleaned = raw.replace(/[\u0000-\u001f\u007f\s]/g, "");

  if (!cleaned) return null;

  const with_scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(cleaned)
    ? cleaned
    : `https://${cleaned}`;

  if (with_scheme.length > MAX_WEBSITE_URL_LENGTH) return null;

  try {
    const parsed = new URL(with_scheme);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    if (parsed.username || parsed.password || has_userinfo(with_scheme)) {
      return null;
    }
    if (!parsed.hostname || !parsed.hostname.includes(".")) return null;

    return with_scheme;
  } catch {
    return null;
  }
}

export const MAX_WEBSITE_HOSTNAME_LENGTH = 253;
export const MAX_WEBSITE_LABEL_LENGTH = 63;
export const HOST_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function canonical_hostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

export function is_plausible_website_host(hostname: string): boolean {
  const host = canonical_hostname(hostname);

  if (!host || host.length > MAX_WEBSITE_HOSTNAME_LENGTH) return false;

  const labels = host.split(".");

  if (labels.length < 2) return false;
  if (
    labels.some(
      (label) =>
        label.length > MAX_WEBSITE_LABEL_LENGTH ||
        !HOST_LABEL_PATTERN.test(label),
    )
  ) {
    return false;
  }

  return IANA_TLDS.has(labels[labels.length - 1]);
}

export function validate_website_input(raw: string): string | null {
  const normalized = normalize_website_url(raw);

  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const hostname = canonical_hostname(parsed.hostname);

    if (!is_plausible_website_host(hostname)) return null;

    const port = parsed.port ? `:${parsed.port}` : "";
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    const canonical = `${parsed.protocol}//${hostname}${port}${path}${parsed.search}${parsed.hash}`;

    return canonical.length > MAX_WEBSITE_URL_LENGTH ? null : canonical;
  } catch {
    return null;
  }
}

function read_website_entries(payload: string): unknown[] {
  const trimmed = payload.trim();

  if (!trimmed) return [];

  if (trimmed.startsWith("[") || trimmed.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);

      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === "string") return read_website_entries(parsed);

      return [];
    } catch {
      return trimmed.split(/[,;\r\n]/);
    }
  }

  return trimmed.split(/[,;\r\n]/);
}

export function parse_websites_payload(payload: string): string[] {
  const seen = new Set<string>();
  const websites: string[] = [];

  for (const entry of read_website_entries(payload)) {
    if (typeof entry !== "string") continue;

    const normalized = normalize_website_url(entry.trim());

    if (!normalized) continue;

    const key = normalized.toLowerCase();

    if (seen.has(key)) continue;

    seen.add(key);
    websites.push(normalized);

    if (websites.length >= MAX_ALIAS_WEBSITES) break;
  }

  return websites;
}
