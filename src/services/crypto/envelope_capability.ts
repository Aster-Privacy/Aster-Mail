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
import { api_client } from "../api/client";

export const ENVELOPE_CAPABILITY_MAX_MARKER = 4;
export const ENVELOPE_CAPABILITY_REPORT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const CLIENT_ID_KEY = "astermail_envelope_client_id";
const LAST_REPORTED_PREFIX = "astermail_envelope_capability_reported_";

export interface EnvelopeCapabilityResult {
  success: boolean;
  min_supported_marker: number | null;
  pq_hybrid_enabled: boolean;
}

export interface EnvelopeCapabilityDeps {
  now: () => number;
  new_client_id: () => string;
  read: (key: string) => string | null;
  write: (key: string, value: string) => void;
  post: (
    client_id: string,
    max_envelope_marker: number,
    platform: string,
  ) => Promise<EnvelopeCapabilityResult | null>;
  platform: () => string;
}

function browser_read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function browser_write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function random_client_id(): string {
  try {
    return crypto.randomUUID();
  } catch {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
}

function current_platform(): string {
  const tauri =
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

  return tauri ? "desktop" : "web";
}

async function post_capability(
  client_id: string,
  max_envelope_marker: number,
  platform: string,
): Promise<EnvelopeCapabilityResult | null> {
  const response = await api_client.post<EnvelopeCapabilityResult>(
    "/crypto/v1/ratchet/envelope-capability",
    { client_id, max_envelope_marker, platform },
  );

  if (response.error || !response.data) return null;

  return response.data;
}

const default_deps: EnvelopeCapabilityDeps = {
  now: () => Date.now(),
  new_client_id: random_client_id,
  read: browser_read,
  write: browser_write,
  post: post_capability,
  platform: current_platform,
};

export async function report_envelope_capability_if_due(
  user_id: string,
  force = false,
  deps: EnvelopeCapabilityDeps = default_deps,
): Promise<EnvelopeCapabilityResult | null> {
  if (!user_id.trim()) return null;

  const write = (key: string, value: string) => {
    try {
      deps.write(key, value);
    } catch {
      return;
    }
  };

  const now = deps.now();
  const last = Number(deps.read(LAST_REPORTED_PREFIX + user_id) ?? "0");
  const elapsed = now - last;

  if (
    !force &&
    Number.isFinite(last) &&
    last > 0 &&
    elapsed >= 0 &&
    elapsed < ENVELOPE_CAPABILITY_REPORT_INTERVAL_MS
  ) {
    return null;
  }

  let client_id = deps.read(CLIENT_ID_KEY);

  if (!client_id) {
    client_id = deps.new_client_id();
    write(CLIENT_ID_KEY, client_id);
  }

  const result = await deps
    .post(client_id, ENVELOPE_CAPABILITY_MAX_MARKER, deps.platform())
    .catch(() => null);

  if (result?.success) {
    write(LAST_REPORTED_PREFIX + user_id, String(now));
  }

  return result;
}
