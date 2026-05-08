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
import { connection_store } from "./connection_store";
import {
  is_tor_connected,
  is_tor_platform,
  tor_fetch,
} from "./tor_transport";
import { cdn_relay_fetch } from "./cdn_relay_transport";
import { TorUnavailableError } from "./tor_unavailable_error";
import {
  CANONICAL_API_ONION,
  is_canonical_api_onion,
} from "./onion_constants";
import {
  type ConnectionMethod,
  TOR_TIMEOUT,
  TOR_RETRY_COUNT,
  TOR_RETRY_DELAY,
} from "./types";

function is_tauri_env(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface ProxyResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

async function tauri_proxy_fetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const { invoke } = await import("@tauri-apps/api/core");

  const headers_map: Record<string, string> = {};

  if (options.headers) {
    const h = options.headers as Record<string, string>;

    for (const [k, v] of Object.entries(h)) {
      headers_map[k] = v;
    }
  }

  const result = await invoke<ProxyResponse>("device_http_request", {
    url,
    method: options.method || "GET",
    body: options.body ? String(options.body) : null,
    headers: Object.keys(headers_map).length > 0 ? headers_map : null,
  });

  return new Response(result.body, {
    status: result.status,
    headers: result.headers,
  });
}

function is_tor_method(method: ConnectionMethod): boolean {
  return method === "tor" || method === "tor_snowflake";
}

function assert_tor_routable(): { onion_host: string } {
  if (!is_tor_platform()) {
    throw new TorUnavailableError(
      "tor_platform_unsupported",
      "Tor mode requires the desktop or mobile app",
    );
  }

  if (!is_tor_connected()) {
    const status = connection_store.get_state().status;

    if (status === "connecting") {
      throw new TorUnavailableError(
        "tor_connecting",
        "Tor is still connecting; refusing to send request over clearnet",
      );
    }

    throw new TorUnavailableError(
      "tor_not_running",
      "Tor is not running; refusing to send request over clearnet",
    );
  }

  const onion_url = connection_store.get_api_onion_url() || CANONICAL_API_ONION;
  const onion_host = onion_url
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

  if (!is_canonical_api_onion(onion_host)) {
    throw new TorUnavailableError(
      "tor_no_onion_url",
      "Aster onion address mismatch; refusing to send request",
    );
  }

  return { onion_host: CANONICAL_API_ONION };
}

export function get_effective_base_url(default_base_url: string): string {
  const method = connection_store.get_method();

  if (is_tor_method(method)) {
    const { onion_host } = assert_tor_routable();

    return `http://${onion_host}/api`;
  }

  if (method === "cdn_relay") {
    const relay_url = connection_store.get_cdn_relay_url();

    if (relay_url) {
      return `${relay_url}/api`;
    }
  }

  return default_base_url;
}

export function get_effective_timeout(default_timeout: number): number {
  const method = connection_store.get_method();

  if (is_tor_method(method)) {
    return TOR_TIMEOUT;
  }

  return default_timeout;
}

export function get_effective_retry_count(default_retry: number): number {
  const method = connection_store.get_method();

  if (is_tor_method(method)) {
    return Math.max(default_retry, TOR_RETRY_COUNT);
  }

  return default_retry;
}

export function get_effective_retry_delay(default_delay: number): number {
  const method = connection_store.get_method();

  if (is_tor_method(method)) {
    return TOR_RETRY_DELAY;
  }

  return default_delay;
}

export async function routed_fetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const method = connection_store.get_method();

  if (is_tor_method(method)) {
    assert_tor_routable();

    return tor_fetch(url, options);
  }

  switch (method) {
    case "cdn_relay":
      return cdn_relay_fetch(url, options);

    case "direct":
    default:
      if (is_tauri_env()) {
        return tauri_proxy_fetch(url, options);
      }

      return fetch(url, options);
  }
}
