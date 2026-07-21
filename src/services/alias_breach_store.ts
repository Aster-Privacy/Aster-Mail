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
import type {
  AliasBreachMatch,
  AliasBreachMatchType,
} from "@/services/alias_breach_matcher";

const ENABLED_KEY = (account_id: string) => `aster:alias_watch:${account_id}`;
const MATCHES_KEY = (account_id: string) =>
  `aster:alias_watch:matches:${account_id}`;
const LAST_SCAN_KEY = (account_id: string) =>
  `aster:alias_watch:last_scan:${account_id}`;
const NOTIFIED_KEY = (account_id: string) =>
  `aster:alias_watch:notified:${account_id}`;

export const ALIAS_WATCH_MATCHES_CHANGED_EVENT =
  "astermail:alias-watch-matches-changed";

export interface CachedAliasBreachMatch {
  alias_id: string;
  domain: string;
  name: string;
  breach_date: string;
  disclosed_at: string;
  data_classes: string[];
  pwn_count: number;
  match_type: AliasBreachMatchType;
}

export function is_alias_watch_enabled(account_id: string): boolean {
  if (!account_id) return false;

  return localStorage.getItem(ENABLED_KEY(account_id)) === "1";
}

export function set_alias_watch_enabled(
  account_id: string,
  enabled: boolean,
): void {
  if (!account_id) return;

  if (enabled) {
    localStorage.setItem(ENABLED_KEY(account_id), "1");
  } else {
    localStorage.removeItem(ENABLED_KEY(account_id));
    localStorage.removeItem(MATCHES_KEY(account_id));
    localStorage.removeItem(LAST_SCAN_KEY(account_id));
    window.dispatchEvent(
      new CustomEvent(ALIAS_WATCH_MATCHES_CHANGED_EVENT, {
        detail: { account_id },
      }),
    );
  }
}

export function get_cached_breach_matches(
  account_id: string,
): CachedAliasBreachMatch[] {
  if (!account_id) return [];

  try {
    const raw = localStorage.getItem(MATCHES_KEY(account_id));

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? (parsed as CachedAliasBreachMatch[]) : [];
  } catch {
    return [];
  }
}

export function set_cached_breach_matches(
  account_id: string,
  matches: AliasBreachMatch[],
): void {
  if (!account_id) return;

  const serializable: CachedAliasBreachMatch[] = matches.map((match) => ({
    alias_id: match.alias_id,
    domain: match.breach.domain,
    name: match.breach.name,
    breach_date: match.breach.breach_date,
    disclosed_at: match.breach.disclosed_at,
    data_classes: match.breach.data_classes,
    pwn_count: match.breach.pwn_count,
    match_type: match.match_type,
  }));

  try {
    localStorage.setItem(MATCHES_KEY(account_id), JSON.stringify(serializable));
  } catch {}

  window.dispatchEvent(
    new CustomEvent(ALIAS_WATCH_MATCHES_CHANGED_EVENT, {
      detail: { account_id },
    }),
  );
}

export function set_last_scan_at(account_id: string, timestamp: number): void {
  if (!account_id) return;

  try {
    localStorage.setItem(LAST_SCAN_KEY(account_id), String(timestamp));
  } catch {}
}

export function get_last_scan_at(account_id: string): number | null {
  if (!account_id) return null;

  const raw = localStorage.getItem(LAST_SCAN_KEY(account_id));

  if (!raw) return null;

  const parsed = Number(raw);

  return Number.isFinite(parsed) ? parsed : null;
}

export function get_breach_match_for_alias(
  account_id: string,
  alias_id: string,
): CachedAliasBreachMatch | null {
  return (
    get_cached_breach_matches(account_id).find(
      (match) => match.alias_id === alias_id,
    ) ?? null
  );
}

function match_key(match: CachedAliasBreachMatch): string {
  return `${match.alias_id}:${match.domain}:${match.breach_date}`;
}

function get_notified_keys(account_id: string): Set<string> {
  if (!account_id) return new Set();

  try {
    const raw = localStorage.getItem(NOTIFIED_KEY(account_id));

    if (!raw) return new Set();

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? new Set(parsed as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export function get_unnotified_matches(
  account_id: string,
  matches: CachedAliasBreachMatch[],
): CachedAliasBreachMatch[] {
  if (!account_id) return [];

  const notified = get_notified_keys(account_id);

  return matches.filter((match) => !notified.has(match_key(match)));
}

export function mark_matches_notified(
  account_id: string,
  matches: CachedAliasBreachMatch[],
): void {
  if (!account_id || matches.length === 0) return;

  const notified = get_notified_keys(account_id);

  matches.forEach((match) => notified.add(match_key(match)));

  try {
    localStorage.setItem(
      NOTIFIED_KEY(account_id),
      JSON.stringify(Array.from(notified)),
    );
  } catch {}
}
