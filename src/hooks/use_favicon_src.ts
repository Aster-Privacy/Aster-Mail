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
  cache_favicon_blob,
} from "@/lib/favicon_cache_db";
import { is_any_lockdown_active } from "@/services/lockdown_store";

export function use_favicon_src(domain: string): string {
  const api_url = get_favicon_url(domain);
  const [src, set_src] = useState(api_url);

  useEffect(() => {
    set_src(get_favicon_url(domain));

    if (!domain || !is_valid_favicon_domain(domain)) return;

    if (is_any_lockdown_active()) return;

    const method = connection_store.get_method();
    if (method === "tor" || method === "tor_snowflake") return;

    let cancelled = false;

    get_favicon_object_url(domain).then((object_url) => {
      if (cancelled) return;
      if (object_url) set_src(object_url);
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

export function store_favicon_if_api_url(
  domain: string,
  loaded_src: string,
): void {
  if (!loaded_src.includes("/api/images/v1/favicon/")) return;

  if (is_any_lockdown_active()) return;

  const method = connection_store.get_method();
  if (method === "tor" || method === "tor_snowflake") return;

  routed_fetch(loaded_src, {})
    .then((r) => {
      if (!r.ok) return null;
      const ct = r.headers.get("content-type") ?? "";
      if (!ALLOWED_FAVICON_TYPES.some((t) => ct.startsWith(t))) return null;
      return r.blob();
    })
    .then((blob) => {
      if (!blob || blob.size > MAX_FAVICON_BYTES) return;
      cache_favicon_blob(domain, blob);
    })
    .catch(() => {});
}
