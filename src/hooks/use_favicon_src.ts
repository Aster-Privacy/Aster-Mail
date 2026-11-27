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
import type { LogoLook } from "@/lib/logo_tone";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";

import { routed_fetch } from "@/services/routing/routing_provider";
import { connection_store } from "@/services/routing/connection_store";
import {
  FAILED_FAVICON_SRC,
  PENDING_FAVICON_SRC,
  get_favicon_url,
  is_valid_favicon_domain,
  api_favicon_domain,
} from "@/lib/favicon_url";
import {
  adopt_favicon_blob,
  get_favicon_object_url,
  peek_favicon_object_url,
  cache_favicon_blob,
  peek_favicon_look,
  subscribe_favicon_looks,
} from "@/lib/favicon_cache_db";
import { is_icon_failed, mark_icon_failed } from "@/lib/icon_cache";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import {
  are_sender_logos_enabled,
  subscribe_sender_logos,
} from "@/services/sender_logos_state";
import { ignore_error } from "@/lib/ignore_error";

function retry_after_ms(headers: Headers): number | undefined {
  const match = /max-age=(\d+)/.exec(headers.get("cache-control") ?? "");

  return match ? Number(match[1]) * 1000 : undefined;
}

export const MAX_CONCURRENT_FAVICON_LOADS = 6;
export const DEFAULT_FAVICON_RATE_LIMIT_MS = 30_000;
const MAX_FAVICON_RATE_LIMIT_MS = 5 * 60 * 1000;

const cookieless_loads = new Map<string, Promise<string | null>>();
const rate_limited_until = new Map<string, number>();
const waiting_for_slot: Array<() => void> = [];
let active_favicon_loads = 0;

function acquire_favicon_slot(): Promise<void> {
  if (active_favicon_loads < MAX_CONCURRENT_FAVICON_LOADS) {
    active_favicon_loads++;

    return Promise.resolve();
  }

  return new Promise((resolve) => {
    waiting_for_slot.push(() => {
      active_favicon_loads++;
      resolve();
    });
  });
}

function release_favicon_slot(): void {
  active_favicon_loads = Math.max(0, active_favicon_loads - 1);
  waiting_for_slot.shift()?.();
}

function limited_fetch(url: string): Promise<Response> {
  return acquire_favicon_slot()
    .then(() => routed_fetch(url, { credentials: "omit" }))
    .finally(release_favicon_slot);
}

function rate_limit_ms(headers: Headers): number {
  const seconds = Number(headers.get("retry-after"));

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_FAVICON_RATE_LIMIT_MS;
  }

  return Math.min(seconds * 1000, MAX_FAVICON_RATE_LIMIT_MS);
}

function is_rate_limited(domain: string): boolean {
  const until = rate_limited_until.get(domain);

  if (until === undefined) return false;
  if (Date.now() < until) return true;
  rate_limited_until.delete(domain);

  return false;
}

function load_cookieless_favicon(
  domain: string,
  url: string,
): Promise<string | null> {
  const loaded = peek_favicon_object_url(domain);

  if (loaded) return Promise.resolve(loaded);
  if (is_icon_failed(domain)) return Promise.resolve(null);
  if (is_rate_limited(domain)) return Promise.resolve(null);

  const existing = cookieless_loads.get(domain);

  if (existing) return existing;

  const promise = limited_fetch(url)
    .then((r) => {
      if (!r.ok) {
        if (r.status === 404 || r.status === 410) {
          mark_icon_failed(domain, retry_after_ms(r.headers));
        } else if (r.status === 429) {
          rate_limited_until.set(domain, Date.now() + rate_limit_ms(r.headers));
        }

        return null;
      }
      const ct = r.headers.get("content-type") ?? "";

      if (!ALLOWED_FAVICON_TYPES.some((t) => ct.startsWith(t))) return null;

      return r.blob();
    })
    .then((blob) => {
      if (!blob || blob.size > MAX_FAVICON_BYTES) return null;
      const object_url = adopt_favicon_blob(domain, blob);

      cache_favicon_blob(domain, blob).catch((caught) =>
        ignore_error("hooks/use_favicon_src:cache_favicon_blob", caught),
      );

      return object_url;
    })
    .catch((caught) => {
      ignore_error("hooks/use_favicon_src:load_cookieless_favicon", caught);

      return null;
    })
    .finally(() => {
      cookieless_loads.delete(domain);
    });

  cookieless_loads.set(domain, promise);

  return promise;
}

function resolve_initial_src(domain: string): string {
  if (!are_sender_logos_enabled()) return PENDING_FAVICON_SRC;
  const cached = peek_favicon_object_url(domain);

  if (cached) return cached;
  const url = get_favicon_url(domain);

  return api_favicon_domain(url) ? PENDING_FAVICON_SRC : url;
}

export function use_favicon_src(domain: string, enabled = true): string {
  const logos_enabled = useSyncExternalStore(
    subscribe_sender_logos,
    are_sender_logos_enabled,
    are_sender_logos_enabled,
  );
  const [src, set_src] = useState(() => resolve_initial_src(domain));
  const [prev_key, set_prev_key] = useState({ domain, logos_enabled });

  if (domain !== prev_key.domain || logos_enabled !== prev_key.logos_enabled) {
    set_prev_key({ domain, logos_enabled });
    set_src(resolve_initial_src(domain));
  }

  useEffect(() => {
    if (!logos_enabled) return;
    if (!domain || !is_valid_favicon_domain(domain)) return;

    if (is_any_lockdown_active()) return;

    const method = connection_store.get_method();

    if (method === "tor" || method === "tor_snowflake") return;

    let cancelled = false;
    const url = get_favicon_url(domain);
    const fetch_cookieless = enabled && api_favicon_domain(url) !== null;

    get_favicon_object_url(domain)
      .then((object_url) => {
        if (cancelled) return;
        if (object_url) {
          set_src((prev) => (prev === object_url ? prev : object_url));

          return;
        }
        if (!fetch_cookieless) return;

        return load_cookieless_favicon(domain, url).then((loaded) => {
          if (cancelled) return;
          set_src(loaded ?? FAILED_FAVICON_SRC);
        });
      })
      .catch((caught) => ignore_error("hooks/use_favicon_src:effect", caught));

    return () => {
      cancelled = true;
    };
  }, [domain, enabled, logos_enabled]);

  return logos_enabled ? src : PENDING_FAVICON_SRC;
}

export function use_favicon_look(domain: string): LogoLook | null {
  const get_snapshot = useCallback(
    () => (domain ? peek_favicon_look(domain) : null),
    [domain],
  );

  return useSyncExternalStore(
    subscribe_favicon_looks,
    get_snapshot,
    get_snapshot,
  );
}

const ALLOWED_FAVICON_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
];

const MAX_FAVICON_BYTES = 200 * 1024;

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
};

const store_queue: Array<() => Promise<void>> = [];
const requested_domains = new Set<string>();
let store_queue_running = false;

function run_when_idle(task: () => void) {
  const idle = (window as IdleWindow).requestIdleCallback;

  if (idle) {
    idle(task, { timeout: 3000 });

    return;
  }

  window.setTimeout(task, 300);
}

function drain_store_queue() {
  if (store_queue_running) return;

  const next = store_queue.shift();

  if (!next) return;

  store_queue_running = true;
  run_when_idle(() => {
    next()
      .catch((caught) =>
        ignore_error("hooks/use_favicon_src:drain_store_queue", caught),
      )
      .finally(() => {
        store_queue_running = false;
        drain_store_queue();
      });
  });
}

export function store_favicon_if_api_url(
  domain: string,
  loaded_src: string,
): void {
  if (!loaded_src.includes("/api/images/v1/favicon/")) return;

  if (!are_sender_logos_enabled()) return;

  if (is_any_lockdown_active()) return;

  const method = connection_store.get_method();

  if (method === "tor" || method === "tor_snowflake") return;

  if (peek_favicon_object_url(domain)) return;
  if (requested_domains.has(domain)) return;

  requested_domains.add(domain);
  store_queue.push(() => fetch_and_cache_favicon(domain, loaded_src));
  drain_store_queue();
}

function fetch_and_cache_favicon(
  domain: string,
  loaded_src: string,
): Promise<void> {
  return routed_fetch(loaded_src, {
    credentials: "omit",
    cache: "force-cache",
  })
    .then((r) => {
      if (!r.ok) return null;
      const ct = r.headers.get("content-type") ?? "";

      if (!ALLOWED_FAVICON_TYPES.some((t) => ct.startsWith(t))) return null;

      return r.blob();
    })
    .then((blob) => {
      if (!blob || blob.size > MAX_FAVICON_BYTES) return;

      return cache_favicon_blob(domain, blob);
    })
    .catch((caught) =>
      ignore_error("hooks/use_favicon_src:store_favicon_if_api_url", caught),
    );
}
