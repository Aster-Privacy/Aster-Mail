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
import type { sender_verification_status } from "./key_manager_pgp";

import {
  get_recipient_public_key,
  extract_username_from_email,
  is_internal_email,
} from "@/services/api/keys";

export type verification_policy =
  | "informational"
  | "warn_invalid"
  | "block_invalid";

export const current_verification_policy: verification_policy = "informational";

export function should_render_message(status: sender_verification_status): boolean {
  if (current_verification_policy === "block_invalid" && status === "invalid") {
    return false;
  }

  return true;
}

const RESOLVER_CACHE_TTL_MS = 5 * 60 * 1000;
const resolver_cache = new Map<string, { keys: string[]; timestamp: number }>();

function read_cache(email: string): string[] | null {
  const entry = resolver_cache.get(email.toLowerCase());

  if (!entry) return null;

  if (Date.now() - entry.timestamp > RESOLVER_CACHE_TTL_MS) {
    resolver_cache.delete(email.toLowerCase());

    return null;
  }

  return entry.keys;
}

function write_cache(email: string, keys: string[]): void {
  resolver_cache.set(email.toLowerCase(), {
    keys,
    timestamp: Date.now(),
  });
}

export async function resolve_sender_verification_keys(
  sender_email: string,
): Promise<string[]> {
  if (!sender_email) return [];

  const cached = read_cache(sender_email);

  if (cached) return cached;

  if (!is_internal_email(sender_email)) {
    write_cache(sender_email, []);

    return [];
  }

  const username = extract_username_from_email(sender_email);

  if (!username) return [];

  try {
    const response = await get_recipient_public_key(username, sender_email);

    if (response.error || !response.data?.public_key) {
      return [];
    }

    const keys = [response.data.public_key];

    write_cache(sender_email, keys);

    return keys;
  } catch {
    return [];
  }
}

export function clear_sender_verification_cache(): void {
  resolver_cache.clear();
}
