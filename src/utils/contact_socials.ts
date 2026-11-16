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
import type { SocialNetworkEntry, SocialNetworkType } from "@/types/contacts";

import { clean_relation_text } from "@/utils/contact_relations";

export const SOCIAL_NETWORK_TYPES: readonly SocialNetworkType[] = [
  "twitter",
  "linkedin",
  "github",
  "instagram",
  "facebook",
  "mastodon",
  "bluesky",
  "other",
];
export const MAX_SOCIAL_VALUE_LENGTH = 500;
export const MAX_SOCIAL_LABEL_LENGTH = 50;
export const MAX_SOCIAL_NETWORKS = 50;

const SOCIAL_TYPE_ALIASES: Record<string, SocialNetworkType> = {
  twitter: "twitter",
  x: "twitter",
  linkedin: "linkedin",
  github: "github",
  instagram: "instagram",
  facebook: "facebook",
  mastodon: "mastodon",
  bluesky: "bluesky",
  bsky: "bluesky",
};

const VCARD_IGNORED_TOKENS: ReadonlySet<string> = new Set([
  "pref",
  "other",
  "custom",
  "internet",
  "home",
  "work",
  "text",
  "uri",
  "url",
  "x-user",
]);

const HANDLE_HOSTS: Partial<Record<SocialNetworkType, string[]>> = {
  twitter: ["twitter.com", "x.com"],
  linkedin: ["linkedin.com"],
  github: ["github.com"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com"],
  bluesky: ["bsky.app"],
};

const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:/i;

function as_record(entry: unknown): Record<string, unknown> | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;

  return entry as Record<string, unknown>;
}

export function is_social_network_type(
  value: string,
): value is SocialNetworkType {
  return (SOCIAL_NETWORK_TYPES as readonly string[]).includes(value);
}

export function social_type_from_token(raw: string): SocialNetworkType | null {
  return SOCIAL_TYPE_ALIASES[raw.trim().toLowerCase()] ?? null;
}

export function parse_http_url(candidate: string): URL | null {
  const value = candidate.trim();

  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const parsed = new URL(value);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (!parsed.hostname) return null;

    return parsed;
  } catch {
    return null;
  }
}

function handle_url(type: SocialNetworkType, raw: string): string | null {
  const value = raw.trim();

  if (!value || SCHEME_PREFIX.test(value) || /\s/.test(value)) return null;
  if (type === "mastodon") {
    const match = /^@?([A-Za-z0-9_.-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})$/.exec(
      value,
    );

    if (!match) return null;
    const parsed = parse_http_url(`https://${match[2]}/@${match[1]}`);

    return parsed?.href ?? null;
  }
  const handle = value.replace(/^@/, "");

  if (!/^[\p{L}\p{N}_.-]+$/u.test(handle)) return null;
  const encoded = encodeURIComponent(handle);

  switch (type) {
    case "twitter":
      return `https://x.com/${encoded}`;
    case "linkedin":
      return `https://www.linkedin.com/in/${encoded}`;
    case "github":
      return `https://github.com/${encoded}`;
    case "instagram":
      return `https://www.instagram.com/${encoded}`;
    case "facebook":
      return `https://www.facebook.com/${encoded}`;
    case "bluesky":
      return `https://bsky.app/profile/${encoded}`;
    default:
      return null;
  }
}

export function social_href(entry: {
  value?: unknown;
  type?: unknown;
}): string | null {
  if (typeof entry.value !== "string") return null;
  const value = entry.value.trim();

  if (!value) return null;
  const type =
    typeof entry.type === "string" && is_social_network_type(entry.type)
      ? entry.type
      : "other";
  const parsed = parse_http_url(value);

  if (parsed) {
    const hosts = HANDLE_HOSTS[type];

    if (!hosts) return parsed.href;
    const allowed = hosts.some(
      (host) =>
        parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    );

    return allowed ? parsed.href : null;
  }

  return handle_url(type, value);
}

export function social_vcard_type_param(label: string): string {
  return label
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_SOCIAL_LABEL_LENGTH);
}

export function social_from_vcard_tokens(
  tokens: string[],
  group_label: string | undefined,
): { type: SocialNetworkType; label?: string } {
  for (const token of tokens) {
    const mapped = social_type_from_token(token);

    if (mapped) return { type: mapped };
  }
  const grouped = clean_relation_text(group_label ?? "", MAX_SOCIAL_LABEL_LENGTH)
    .replace(/^_\$!<(.*)>!\$_$/, "$1")
    .trim();

  if (grouped) {
    const mapped = social_type_from_token(grouped);

    if (mapped) return { type: mapped };

    return { type: "other", label: grouped };
  }
  for (const token of tokens) {
    const trimmed = token.trim();

    if (
      !trimmed ||
      VCARD_IGNORED_TOKENS.has(trimmed.toLowerCase()) ||
      trimmed.toLowerCase().startsWith("x-")
    ) {
      continue;
    }

    return {
      type: "other",
      label: clean_relation_text(trimmed, MAX_SOCIAL_LABEL_LENGTH),
    };
  }

  return { type: "other" };
}

function dedupe_key(entry: SocialNetworkEntry): string {
  const label = entry.type === "other" ? (entry.label ?? "").toLowerCase() : "";

  return `${entry.type}\u0000${label}\u0000${entry.value
    .normalize("NFC")
    .toLowerCase()}`;
}

function normalize_social_entry(raw: unknown): SocialNetworkEntry | null {
  const record = as_record(raw);

  if (!record || typeof record.value !== "string") return null;
  const value = clean_relation_text(record.value, MAX_SOCIAL_VALUE_LENGTH);

  if (!value) return null;
  const raw_label = typeof record.label === "string" ? record.label : undefined;
  const label =
    raw_label === undefined
      ? undefined
      : clean_relation_text(raw_label, MAX_SOCIAL_LABEL_LENGTH);
  const type_ok = typeof record.type === "string" && record.type.trim() !== "";
  const unchanged =
    type_ok &&
    value === record.value &&
    (raw_label === undefined || (label !== "" && label === raw_label));

  if (unchanged) return record as unknown as SocialNetworkEntry;
  const next: Record<string, unknown> = {
    ...record,
    value,
    type: type_ok ? record.type : "other",
  };

  if (label) next.label = label;
  else delete next.label;

  return next as unknown as SocialNetworkEntry;
}

export function normalize_social_networks(
  entries: unknown,
): SocialNetworkEntry[] | undefined {
  if (!Array.isArray(entries)) return undefined;
  const seen = new Set<string>();
  const result: SocialNetworkEntry[] = [];

  for (const raw of entries) {
    if (result.length >= MAX_SOCIAL_NETWORKS) break;
    const entry = normalize_social_entry(raw);

    if (!entry) continue;
    const key = dedupe_key(entry);

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }

  return result;
}

export const LEGACY_SOCIAL_LINK_TYPES: readonly SocialNetworkType[] = [
  "linkedin",
  "twitter",
  "github",
];

export function is_legacy_social_link_type(type: unknown): boolean {
  return (
    typeof type === "string" &&
    (LEGACY_SOCIAL_LINK_TYPES as readonly string[]).includes(type)
  );
}

export function extra_social_networks(entries: unknown): SocialNetworkEntry[] {
  if (!Array.isArray(entries)) return [];

  return entries.filter((entry): entry is SocialNetworkEntry => {
    const record = as_record(entry);

    return (
      record !== null &&
      typeof record.value === "string" &&
      record.value.trim() !== "" &&
      !is_legacy_social_link_type(record.type)
    );
  });
}

export function merge_social_networks(
  lists: (SocialNetworkEntry[] | undefined)[],
): SocialNetworkEntry[] | undefined {
  const present = lists.filter((list): list is SocialNetworkEntry[] =>
    Array.isArray(list),
  );

  if (present.length === 0) return undefined;

  return normalize_social_networks(present.flat());
}
