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
import type { Badge } from "./user";

import { api_client } from "./client";

export interface PublicProfile {
  display_name?: string | null;
  profile_picture?: string | null;
  profile_color?: string | null;
  active_badge?: Badge | null;
  show_badge_ring?: boolean;
  show_badge_profile?: boolean;
}

interface BatchProfilesResponse {
  profiles: Record<string, PublicProfile>;
}

const ASTER_DOMAINS = new Set(["astermail.org", "aster.cx"]);
const CACHE_TTL_MS = 5 * 60 * 1000;
const BATCH_WINDOW_MS = 40;
const FAILED_LOOKUP_TTL_MS = 10 * 1000;
const MAX_BATCH = 50;
const HINT_STORAGE_KEY = "aster_peer_profile_hints_v1";
const HINT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_HINTS = 300;
const MAX_HINT_BYTES = 8 * 1024;

interface CacheEntry {
  profile: PublicProfile | null;
  expires_at: number;
}

const cache = new Map<string, CacheEntry>();
const subscribers = new Set<() => void>();

interface PendingResolver {
  resolve: (profile: PublicProfile | null) => void;
}

const pending: Map<string, PendingResolver[]> = new Map();
let flush_timer: ReturnType<typeof setTimeout> | null = null;

export function is_aster_email(email: string): boolean {
  const at = email.lastIndexOf("@");

  if (at < 0) return false;

  return ASTER_DOMAINS.has(email.slice(at + 1).toLowerCase());
}

export function get_cached_peer_profile(
  email: string,
): PublicProfile | null | undefined {
  const key = email.trim().toLowerCase();
  const entry = cache.get(key);

  if (!entry) return undefined;
  if (entry.expires_at < Date.now()) {
    cache.delete(key);

    return undefined;
  }

  return entry.profile;
}

interface StoredHint {
  profile: PublicProfile;
  stored_at: number;
}

let hints: Map<string, StoredHint> | null = null;

function load_hints(): Map<string, StoredHint> {
  if (hints) return hints;

  hints = new Map();

  try {
    const raw = window.localStorage.getItem(HINT_STORAGE_KEY);

    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, StoredHint>;
      const cutoff = Date.now() - HINT_TTL_MS;

      for (const [email, hint] of Object.entries(parsed)) {
        if (hint && hint.profile && hint.stored_at > cutoff) {
          hints.set(email, hint);
        }
      }
    }
  } catch {
    hints = new Map();
  }

  return hints;
}

let hint_save_timer: ReturnType<typeof setTimeout> | null = null;

function save_hints() {
  if (hint_save_timer) return;

  hint_save_timer = setTimeout(() => {
    hint_save_timer = null;

    const entries = Array.from(load_hints().entries())
      .sort((a, b) => b[1].stored_at - a[1].stored_at)
      .slice(0, MAX_HINTS);

    try {
      window.localStorage.setItem(
        HINT_STORAGE_KEY,
        JSON.stringify(Object.fromEntries(entries)),
      );
    } catch {
      return;
    }
  }, 500);
}

function remember_hint(email: string, profile: PublicProfile | null) {
  const store = load_hints();

  if (!profile) {
    if (store.delete(email)) save_hints();

    return;
  }

  if (JSON.stringify(profile).length > MAX_HINT_BYTES) return;

  store.set(email, { profile, stored_at: Date.now() });
  save_hints();
}

export function get_peer_profile_hint(email: string): PublicProfile | null {
  const key = email.trim().toLowerCase();

  return load_hints().get(key)?.profile ?? null;
}

function set_cache(
  email: string,
  profile: PublicProfile | null,
  ttl_ms: number = CACHE_TTL_MS,
) {
  cache.set(email, {
    profile,
    expires_at: Date.now() + ttl_ms,
  });

  if (ttl_ms !== FAILED_LOOKUP_TTL_MS) remember_hint(email, profile);
}

function notify_subscribers() {
  for (const cb of subscribers) cb();
}

async function flush_pending() {
  flush_timer = null;
  if (pending.size === 0) return;

  const emails = Array.from(pending.keys()).slice(0, MAX_BATCH);
  const resolvers_by_email: Map<string, PendingResolver[]> = new Map();

  for (const email of emails) {
    const list = pending.get(email);

    if (list) resolvers_by_email.set(email, list);
    pending.delete(email);
  }

  try {
    const response = await api_client.post<BatchProfilesResponse>(
      "/core/v1/auth/profiles",
      { emails },
    );
    const profiles = response.data?.profiles ?? {};
    const lookup_failed = !response.data;

    for (const email of emails) {
      const profile = profiles[email] ?? null;

      set_cache(
        email,
        profile,
        lookup_failed ? FAILED_LOOKUP_TTL_MS : CACHE_TTL_MS,
      );
      const resolvers = resolvers_by_email.get(email);

      if (resolvers) {
        for (const r of resolvers) r.resolve(profile);
      }
    }
    notify_subscribers();
  } catch {
    for (const email of emails) {
      set_cache(email, null, FAILED_LOOKUP_TTL_MS);
      const resolvers = resolvers_by_email.get(email);

      if (resolvers) {
        for (const r of resolvers) r.resolve(null);
      }
    }
    notify_subscribers();
  }

  if (pending.size > 0 && !flush_timer) {
    flush_timer = setTimeout(flush_pending, BATCH_WINDOW_MS);
  }
}

export function fetch_peer_profile(
  email: string,
): Promise<PublicProfile | null> {
  const key = email.trim().toLowerCase();

  if (!is_aster_email(key)) {
    return Promise.resolve(null);
  }

  const cached = get_cached_peer_profile(key);

  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  return new Promise((resolve) => {
    const list = pending.get(key) ?? [];

    list.push({ resolve });
    pending.set(key, list);
    if (!flush_timer) {
      flush_timer = setTimeout(flush_pending, BATCH_WINDOW_MS);
    }
  });
}

export function subscribe_profile_updates(cb: () => void): () => void {
  subscribers.add(cb);

  return () => {
    subscribers.delete(cb);
  };
}

export function clear_profiles_cache() {
  cache.clear();
  hints = new Map();

  try {
    window.localStorage.removeItem(HINT_STORAGE_KEY);
  } catch {
    hints = new Map();
  }
}
