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
//
import { Capacitor } from "@capacitor/core";

import { api_client } from "@/services/api/client";
import { connection_store } from "@/services/routing/connection_store";

const GRANT_ENDPOINT = "/images/v1/grant";
const GRANT_SCHEME = "AsterImageGrant";
const REFRESH_MARGIN_MS = 30_000;
const UNSUPPORTED_COOLDOWN_MS = 10 * 60_000;
const FAILURE_COOLDOWN_MS = 30_000;

interface GrantResponse {
  grant: string;
  expires_in: number;
}

interface CachedGrant {
  value: string;
  refresh_at: number;
}

export type ProxiedImageResult =
  | { kind: "image"; bytes: Uint8Array; content_type: string }
  | { kind: "fallback" }
  | { kind: "failed"; retryable: boolean };

export type ProxiedImageFetcher = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

let cached_grant: CachedGrant | null = null;
let pending_grant: Promise<string | null> | null = null;
let unavailable_until = 0;

export function reset_image_proxy_grant_state(): void {
  cached_grant = null;
  pending_grant = null;
  unavailable_until = 0;
}

export function should_defer_proxied_images(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof fetch !== "function") return false;
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return false;
  }
  if (Capacitor.isNativePlatform() || "__TAURI_INTERNALS__" in window) {
    return false;
  }

  const method = connection_store.get_method();

  return method !== "tor" && method !== "tor_snowflake";
}

async function request_grant(): Promise<string | null> {
  try {
    const response = await api_client.post<GrantResponse>(GRANT_ENDPOINT, {});
    const grant = response.data?.grant;
    const expires_in = response.data?.expires_in;

    if (
      response.error ||
      typeof grant !== "string" ||
      grant.length === 0 ||
      typeof expires_in !== "number" ||
      !(expires_in > 0)
    ) {
      const unsupported = response.status === 404 || response.status === 405;

      unavailable_until =
        Date.now() +
        (unsupported ? UNSUPPORTED_COOLDOWN_MS : FAILURE_COOLDOWN_MS);

      return null;
    }

    const lifetime_ms = expires_in * 1000;

    cached_grant = {
      value: grant,
      refresh_at:
        Date.now() + Math.max(lifetime_ms - REFRESH_MARGIN_MS, lifetime_ms / 2),
    };

    return grant;
  } catch {
    unavailable_until = Date.now() + FAILURE_COOLDOWN_MS;

    return null;
  }
}

export async function get_image_proxy_grant(): Promise<string | null> {
  const now = Date.now();

  if (cached_grant && now < cached_grant.refresh_at) return cached_grant.value;
  if (now < unavailable_until) return null;

  if (!pending_grant) {
    pending_grant = request_grant().finally(() => {
      pending_grant = null;
    });
  }

  return pending_grant;
}

function discard_image_proxy_grant(grant: string): void {
  if (cached_grant?.value === grant) cached_grant = null;
}

export async function fetch_proxied_image(
  url: string,
  options: { signal?: AbortSignal; fetcher?: ProxiedImageFetcher } = {},
): Promise<ProxiedImageResult> {
  const fetcher: ProxiedImageFetcher =
    options.fetcher ?? ((target, init) => fetch(target, init));
  let grant = await get_image_proxy_grant();

  if (!grant) return { kind: "fallback" };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;

    try {
      response = await fetcher(url, {
        method: "GET",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { Authorization: `${GRANT_SCHEME} ${grant}` },
        signal: options.signal,
      });
    } catch {
      return { kind: "failed", retryable: !options.signal?.aborted };
    }

    if (response.status === 401 || response.status === 403) {
      return { kind: "fallback" };
    }

    if (response.status === 429 && attempt === 0) {
      discard_image_proxy_grant(grant);

      const next_grant = await get_image_proxy_grant();

      if (!next_grant || next_grant === grant) {
        return { kind: "failed", retryable: false };
      }

      grant = next_grant;
      continue;
    }

    if (!response.ok) {
      return { kind: "failed", retryable: response.status >= 500 };
    }

    try {
      const bytes = new Uint8Array(await response.arrayBuffer());
      const content_type = (response.headers.get("content-type") || "")
        .split(";")[0]
        .trim()
        .toLowerCase();

      return { kind: "image", bytes, content_type };
    } catch {
      return { kind: "failed", retryable: !options.signal?.aborted };
    }
  }

  return { kind: "failed", retryable: false };
}
