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
import {
  is_handoff_grant_id,
  is_handoff_user_id,
} from "./session_handoff_protocol";

export const HANDOFF_GRANT_KEY_PREFIX = "aster:session_handoff_grant:";
export const HANDOFF_GRANT_MAX_TTL_MS = 2 * 60 * 1000;
export const HANDOFF_GRANT_WAIT_MS = HANDOFF_GRANT_MAX_TTL_MS;

export interface GrantStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

export type HandoffGrantState = "approved" | "denied";

export interface HandoffGrant {
  user_id: string | null;
  audience: string;
  expires_at: number;
  state: HandoffGrantState;
}

export type HandoffGrantStatus =
  | { state: "pending" }
  | { state: "denied" }
  | { state: "approved"; user_id: string };

function encode_base64url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const local_grant_storage: GrantStorage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    window.localStorage.setItem(key, value);
  },
  remove(key) {
    window.localStorage.removeItem(key);
  },
  keys() {
    try {
      return Object.keys(window.localStorage);
    } catch {
      return [];
    }
  },
};

export function generate_grant_id(): string {
  return encode_base64url(crypto.getRandomValues(new Uint8Array(32)));
}

function parse_grant(raw: string | null): HandoffGrant | null {
  if (raw === null) return null;

  try {
    const value = JSON.parse(raw) as Partial<HandoffGrant> | null;

    if (typeof value !== "object" || value === null) return null;
    if (typeof value.audience !== "string") return null;
    if (typeof value.expires_at !== "number") return null;
    if (value.state !== "approved" && value.state !== "denied") return null;

    const user_id = is_handoff_user_id(value.user_id) ? value.user_id : null;

    if (value.state === "approved" && user_id === null) return null;

    return {
      user_id,
      audience: value.audience,
      expires_at: value.expires_at,
      state: value.state,
    };
  } catch {
    return null;
  }
}

function is_live(grant: HandoffGrant, now: number): boolean {
  return (
    now < grant.expires_at &&
    grant.expires_at - now <= HANDOFF_GRANT_MAX_TTL_MS
  );
}

export function prune_grants(storage: GrantStorage, now: number): void {
  for (const key of storage.keys()) {
    if (!key.startsWith(HANDOFF_GRANT_KEY_PREFIX)) continue;

    const grant = parse_grant(storage.get(key));

    if (!grant || !is_live(grant, now)) storage.remove(key);
  }
}

export function write_grant(
  storage: GrantStorage,
  grant_id: string,
  grant: HandoffGrant,
  now: number,
): boolean {
  if (!is_handoff_grant_id(grant_id)) return false;
  if (grant.state === "approved" && !is_handoff_user_id(grant.user_id)) {
    return false;
  }
  if (!is_live(grant, now)) return false;

  try {
    prune_grants(storage, now);
    storage.set(HANDOFF_GRANT_KEY_PREFIX + grant_id, JSON.stringify(grant));

    return true;
  } catch {
    return false;
  }
}

export function check_grant(
  storage: GrantStorage,
  grant_id: string,
  audience: string,
  now: number,
): HandoffGrantStatus {
  if (!is_handoff_grant_id(grant_id)) return { state: "denied" };

  const raw = storage.get(HANDOFF_GRANT_KEY_PREFIX + grant_id);

  if (raw === null) return { state: "pending" };

  const grant = parse_grant(raw);

  if (!grant || !is_live(grant, now) || grant.audience !== audience) {
    return { state: "denied" };
  }
  if (grant.state === "denied" || grant.user_id === null) {
    return { state: "denied" };
  }

  return { state: "approved", user_id: grant.user_id };
}

export function consume_grant(
  storage: GrantStorage,
  grant_id: string,
  audience: string,
  user_id: string,
  now: number,
): boolean {
  const status = check_grant(storage, grant_id, audience, now);

  if (is_handoff_grant_id(grant_id)) {
    try {
      storage.remove(HANDOFF_GRANT_KEY_PREFIX + grant_id);
    } catch {
      return false;
    }
  }

  return status.state === "approved" && status.user_id === user_id;
}
