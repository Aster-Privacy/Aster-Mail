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
import { get_breach_list, type BreachListEntry } from "@/services/api/vanguard";

export type { BreachListEntry };

export interface AliasWatchTarget {
  id: string;
  local_part: string;
  display_name?: string;
  note?: string;
  websites?: string[];
}

export type AliasBreachMatchType = "tagged" | "automatic";

export interface AliasBreachMatch {
  alias_id: string;
  breach: BreachListEntry;
  match_type: AliasBreachMatchType;
}

const BREACH_LIST_CACHE_KEY = "aster:alias_watch:breach_list_cache";
const BREACH_LIST_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DOMAIN_CANDIDATE_REGEX =
  /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})\b/gi;

interface BreachListCache {
  fetched_at: number;
  entries: BreachListEntry[];
}

function read_breach_list_cache(): BreachListCache | null {
  try {
    const raw = localStorage.getItem(BREACH_LIST_CACHE_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (
      parsed &&
      typeof parsed.fetched_at === "number" &&
      Array.isArray(parsed.entries)
    ) {
      return parsed as BreachListCache;
    }

    return null;
  } catch {
    return null;
  }
}

function write_breach_list_cache(cache: BreachListCache): void {
  try {
    localStorage.setItem(BREACH_LIST_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

function breach_entry_key(entry: BreachListEntry): string {
  return `${entry.domain}:${entry.breach_date}`;
}

function merge_breach_entries(
  existing: BreachListEntry[],
  incoming: BreachListEntry[],
): BreachListEntry[] {
  const by_key = new Map<string, BreachListEntry>();

  for (const entry of existing) {
    by_key.set(breach_entry_key(entry), entry);
  }
  for (const entry of incoming) {
    by_key.set(breach_entry_key(entry), entry);
  }

  return Array.from(by_key.values());
}

export async function get_cached_breach_list(
  force_refresh = false,
): Promise<BreachListEntry[]> {
  const cache = read_breach_list_cache();
  const now = Date.now();

  if (
    !force_refresh &&
    cache &&
    now - cache.fetched_at < BREACH_LIST_CACHE_TTL_MS
  ) {
    return cache.entries;
  }

  const updated_since = cache ? new Date(cache.fetched_at).toISOString() : undefined;

  let response;

  try {
    response = await get_breach_list(updated_since);
  } catch {
    return cache?.entries ?? [];
  }

  if (response.error || !Array.isArray(response.data)) {
    return cache?.entries ?? [];
  }

  const merged = merge_breach_entries(cache?.entries ?? [], response.data);

  write_breach_list_cache({ fetched_at: now, entries: merged });

  return merged;
}

function normalize_domain(raw: string): string | null {
  let value = raw.trim().toLowerCase();

  if (!value) return null;

  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split("/")[0];
  value = value.split("?")[0];
  value = value.split(":")[0];

  if (value.startsWith("www.")) {
    value = value.slice(4);
  }

  if (!value.includes(".")) return null;
  if (!/^[a-z0-9.-]+$/.test(value)) return null;

  return value;
}

function registrable_domain(domain: string): string {
  const parts = domain.split(".").filter(Boolean);

  if (parts.length <= 2) return domain;

  return parts.slice(-2).join(".");
}

function extract_candidate_domains(target: AliasWatchTarget): string[] {
  const candidates: string[] = [];

  for (const site of target.websites ?? []) {
    const normalized = normalize_domain(site);

    if (normalized) candidates.push(normalized);
  }

  const note_matches = (target.note ?? "").match(DOMAIN_CANDIDATE_REGEX) ?? [];

  for (const raw_match of note_matches) {
    const normalized = normalize_domain(raw_match);

    if (normalized) candidates.push(normalized);
  }

  return candidates;
}

const COMPANY_TOKEN_MIN_LENGTH = 4;
const GENERIC_COMPANY_WORDS = new Set([
  "inc",
  "llc",
  "ltd",
  "corp",
  "corporation",
  "company",
  "co",
  "group",
  "holdings",
  "labs",
  "app",
  "apps",
  "the",
  "and",
]);

function normalize_company_token(raw: string): string | null {
  const value = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (value.length < COMPANY_TOKEN_MIN_LENGTH) return null;
  if (GENERIC_COMPANY_WORDS.has(value)) return null;

  return value;
}

function extract_company_tokens_from_text(raw: string): string[] {
  const words = raw.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const tokens: string[] = [];

  for (const word of words) {
    const token = normalize_company_token(word);

    if (token) tokens.push(token);
  }

  return tokens;
}

function extract_breach_company_tokens(entry: BreachListEntry): string[] {
  const tokens = new Set<string>();
  const name_token = normalize_company_token(entry.name.replace(/\s+/g, ""));

  if (name_token) tokens.add(name_token);

  for (const token of extract_company_tokens_from_text(entry.name)) {
    tokens.add(token);
  }

  const normalized_domain = normalize_domain(entry.domain);

  if (normalized_domain) {
    const root_label = registrable_domain(normalized_domain).split(".")[0];
    const domain_token = normalize_company_token(root_label);

    if (domain_token) tokens.add(domain_token);
  }

  return Array.from(tokens);
}

function extract_target_name_tokens(target: AliasWatchTarget): string[] {
  const tokens = new Set<string>();

  for (const token of extract_company_tokens_from_text(target.local_part)) {
    tokens.add(token);
  }
  for (const token of extract_company_tokens_from_text(
    target.display_name ?? "",
  )) {
    tokens.add(token);
  }

  return Array.from(tokens);
}

export async function match_aliases_to_breaches(
  targets: AliasWatchTarget[],
): Promise<AliasBreachMatch[]> {
  const breach_entries = await get_cached_breach_list();

  if (breach_entries.length === 0) return [];

  const breach_by_registrable_domain = new Map<string, BreachListEntry[]>();
  const breach_by_company_token = new Map<string, BreachListEntry[]>();

  for (const entry of breach_entries) {
    const normalized = normalize_domain(entry.domain);

    if (normalized) {
      const key = registrable_domain(normalized);
      const bucket = breach_by_registrable_domain.get(key) ?? [];

      bucket.push(entry);
      breach_by_registrable_domain.set(key, bucket);
    }

    for (const token of extract_breach_company_tokens(entry)) {
      const bucket = breach_by_company_token.get(token) ?? [];

      bucket.push(entry);
      breach_by_company_token.set(token, bucket);
    }
  }

  const matches: AliasBreachMatch[] = [];

  for (const target of targets) {
    const seen_entry_keys = new Set<string>();

    const candidate_domains = extract_candidate_domains(target);

    for (const candidate of candidate_domains) {
      const key = registrable_domain(candidate);
      const entries = breach_by_registrable_domain.get(key);

      if (!entries) continue;

      for (const entry of entries) {
        const entry_key = breach_entry_key(entry);

        if (seen_entry_keys.has(entry_key)) continue;
        seen_entry_keys.add(entry_key);
        matches.push({ alias_id: target.id, breach: entry, match_type: "tagged" });
      }
    }

    const name_tokens = extract_target_name_tokens(target);

    for (const token of name_tokens) {
      const entries = breach_by_company_token.get(token);

      if (!entries) continue;

      for (const entry of entries) {
        const entry_key = breach_entry_key(entry);

        if (seen_entry_keys.has(entry_key)) continue;
        seen_entry_keys.add(entry_key);
        matches.push({
          alias_id: target.id,
          breach: entry,
          match_type: "automatic",
        });
      }
    }
  }

  return matches;
}
