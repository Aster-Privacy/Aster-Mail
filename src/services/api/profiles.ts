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
import { api_client } from "./client";

import type { Badge } from "./user";

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
const MAX_BATCH = 50;

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

export function get_cached_peer_profile(email: string): PublicProfile | null | undefined {
  const key = email.trim().toLowerCase();
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expires_at < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.profile;
}

function set_cache(email: string, profile: PublicProfile | null) {
  cache.set(email, {
    profile,
    expires_at: Date.now() + CACHE_TTL_MS,
  });
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
    for (const email of emails) {
      const profile = profiles[email] ?? null;
      set_cache(email, profile);
      const resolvers = resolvers_by_email.get(email);
      if (resolvers) {
        for (const r of resolvers) r.resolve(profile);
      }
    }
    notify_subscribers();
  } catch {
    for (const email of emails) {
      set_cache(email, null);
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

export function fetch_peer_profile(email: string): Promise<PublicProfile | null> {
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
}
