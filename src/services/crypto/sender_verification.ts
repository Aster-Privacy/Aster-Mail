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
import { drop_expired_entries, trim_map_to_size } from "@/lib/bounded_map";
import {
  discover_external_key,
  get_recipient_public_key,
  extract_username_from_email,
  is_internal_email,
} from "@/services/api/keys";
import { is_recipient_controlled_key } from "@/services/opportunistic_key_trust";
import { check_owner_key_pin } from "@/services/crypto/ratchet_identity_pin";
import { record_peer_identity_event } from "@/services/crypto/ratchet_verification_status";
import { claim_rotation_notice } from "@/services/crypto/rotation_notice";

const RESOLVER_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_RESOLVER_CACHE = 1000;
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

  if (resolver_cache.size > MAX_RESOLVER_CACHE) {
    drop_expired_entries(resolver_cache, RESOLVER_CACHE_TTL_MS);
    trim_map_to_size(resolver_cache, MAX_RESOLVER_CACHE);
  }
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

export async function resolve_inline_pgp_sender_keys(
  sender_email: string,
): Promise<string[]> {
  if (!sender_email) return [];

  if (is_internal_email(sender_email)) {
    return resolve_sender_verification_keys(sender_email);
  }

  try {
    const response = await discover_external_key(sender_email);

    return is_recipient_controlled_key(response.data)
      ? [response.data.public_key]
      : [];
  } catch {
    return [];
  }
}

export function drop_sender_verification<Envelope>(
  envelope: Envelope,
): Envelope {
  if (envelope && typeof envelope === "object") {
    delete (envelope as Record<string, unknown>).sender_verification;
  }

  return envelope;
}

export type SenderKeyTrust = "trusted" | "changed" | "unavailable";

export async function check_sender_key_trust(
  sender_email: string,
  keys: string[],
): Promise<SenderKeyTrust> {
  const sender = sender_email.trim().toLowerCase();

  if (!sender || keys.length === 0) return "unavailable";

  try {
    for (const key of keys) {
      const status = await check_owner_key_pin(sender, key);

      if (status === "changed") return "changed";
      if (status === "unknown") return "unavailable";
    }
  } catch {
    return "unavailable";
  }

  return "trusted";
}

export async function settle_sender_verification<Status extends string>(
  sender_email: string,
  keys: string[],
  verification: Status,
  is_own_signature: () => Promise<boolean>,
): Promise<Status | "no_keys"> {
  if (verification !== "verified") return verification;

  const trust = await check_sender_key_trust(sender_email, keys);

  if (trust === "trusted") return verification;
  if (await is_own_signature()) return verification;
  if (
    trust === "changed" &&
    claim_rotation_notice(sender_email, keys.join("\n"))
  ) {
    record_peer_identity_event(sender_email, "rotated");
  }

  return "no_keys";
}
