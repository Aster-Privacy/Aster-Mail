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
import { useState, useEffect } from "react";

import { routed_fetch } from "@/services/routing/routing_provider";
import { connection_store } from "@/services/routing/connection_store";
import { get_favicon_url, is_valid_favicon_domain } from "@/lib/favicon_url";
import {
  get_favicon_object_url,
  peek_favicon_object_url,
  cache_favicon_blob,
} from "@/lib/favicon_cache_db";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import { ignore_error } from "@/lib/ignore_error";

function resolve_initial_src(domain: string): string {
  return peek_favicon_object_url(domain) || get_favicon_url(domain);
}

export function use_favicon_src(domain: string): string {
  const [src, set_src] = useState(() => resolve_initial_src(domain));
  const [prev_domain, set_prev_domain] = useState(domain);

  if (domain !== prev_domain) {
    set_prev_domain(domain);
    set_src(resolve_initial_src(domain));
  }

  useEffect(() => {
    if (!domain || !is_valid_favicon_domain(domain)) return;

    if (is_any_lockdown_active()) return;

    const method = connection_store.get_method();

    if (method === "tor" || method === "tor_snowflake") return;

    let cancelled = false;

    get_favicon_object_url(domain).then((object_url) => {
      if (cancelled || !object_url) return;
      set_src((prev) => (prev === object_url ? prev : object_url));
    });

    return () => {
      cancelled = true;
    };
  }, [domain]);

  return src;
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
  return routed_fetch(loaded_src, {})
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
