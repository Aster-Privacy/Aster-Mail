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
import { is_tauri_env, tauri_proxy_fetch } from "./tauri_proxy_transport";

const RELAY_ALLOWED_SUFFIXES = [".astermail.org", ".astermail.com"];
const RELAY_ALLOWED_EXACT = ["astermail.org", "astermail.com"];
const CONNECTION_INFO_PATH = "/core/v1/connection-info";
const RELAY_TOKEN_PATH = "/core/v1/auth/relay-token";

function is_bootstrap_path(url: string): boolean {
  return url.includes(CONNECTION_INFO_PATH) || url.includes(RELAY_TOKEN_PATH);
}

function is_relay_host_allowed(relay_url: string): boolean {
  try {
    const parsed = new URL(relay_url);
    if (parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return (
      RELAY_ALLOWED_EXACT.includes(host) ||
      RELAY_ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix))
    );
  } catch {
    return false;
  }
}

export async function cdn_relay_fetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const relay_url = connection_store.get_cdn_relay_url();

  // The connection-info and relay-token requests bootstrap relay mode and
  // authenticate with the first-party cookie, so they must reach the origin
  // directly with credentials. Every other request fails closed: a missing or
  // untrusted relay URL must never silently downgrade the user's traffic to
  // clearnet behind their back.
  if (is_bootstrap_path(url)) {
    const bootstrap_options: RequestInit = {
      ...options,
      credentials: "include",
    };

    return is_tauri_env()
      ? tauri_proxy_fetch(url, bootstrap_options)
      : fetch(url, bootstrap_options);
  }

  if (!relay_url || !is_relay_host_allowed(relay_url)) {
    throw new Error(
      "CDN relay URL is not available yet; refusing to send request over clearnet",
    );
  }

  const original = new URL(url);
  const relayed = `${relay_url}${original.pathname}${original.search}`;
  const relayed_options: RequestInit = {
    ...options,
    credentials: "omit",
  };

  return is_tauri_env()
    ? tauri_proxy_fetch(relayed, relayed_options)
    : fetch(relayed, relayed_options);
}
