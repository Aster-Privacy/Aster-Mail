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
import { get_default_api_base } from "@/services/api/client";
import { is_tauri_env, tauri_proxy_fetch } from "./tauri_proxy_transport";

const RELAY_TOKEN_PATH = "/core/v1/auth/relay-token";
const REFRESH_SKEW_MS = 30000;

interface RelayTokenResponse {
  token: string;
  expires_in_seconds: number;
}

let relay_access_token: string | null = null;
let relay_token_expiry_ms = 0;
let in_flight: Promise<string | null> | null = null;

function is_token_fresh(): boolean {
  return (
    relay_access_token !== null && Date.now() < relay_token_expiry_ms - REFRESH_SKEW_MS
  );
}

async function fetch_relay_token(): Promise<string | null> {
  const url = `${get_default_api_base()}${RELAY_TOKEN_PATH}`;
  const options: RequestInit = {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "include",
  };

  const response = is_tauri_env()
    ? await tauri_proxy_fetch(url, options)
    : await fetch(url, options);

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as RelayTokenResponse;

  if (!data || typeof data.token !== "string" || data.token.length === 0) {
    return null;
  }

  const ttl_ms = Math.max(0, Number(data.expires_in_seconds) || 0) * 1000;

  relay_access_token = data.token;
  relay_token_expiry_ms = Date.now() + ttl_ms;

  return relay_access_token;
}

export async function ensure_relay_token(): Promise<string | null> {
  if (is_token_fresh()) {
    return relay_access_token;
  }

  if (in_flight) {
    return in_flight;
  }

  in_flight = fetch_relay_token().finally(() => {
    in_flight = null;
  });

  return in_flight;
}

export async function refresh_relay_token(): Promise<string | null> {
  relay_access_token = null;
  relay_token_expiry_ms = 0;

  return ensure_relay_token();
}

export function get_relay_token(): string | null {
  return relay_access_token;
}

export function clear_relay_token(): void {
  relay_access_token = null;
  relay_token_expiry_ms = 0;
}
