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
import type { EncryptedVault } from "./key_manager_core";
import { select_private_key_matching_public } from "./key_manager_pgp";

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  public_key: string;
  fetched_at: number;
}

let cache: CacheEntry | null = null;

export function reset_published_signing_key_cache(): void {
  cache = null;
}

async function fetch_published_public_key(): Promise<string | null> {
  const now = Date.now();

  if (cache && now - cache.fetched_at < CACHE_TTL_MS) {
    return cache.public_key;
  }

  const { get_current_account } = await import("@/services/account_manager");
  const account = await get_current_account();
  const email = account?.user?.email;

  if (!email) return null;

  const { get_recipient_public_key } = await import("@/services/api/keys");
  const response = await get_recipient_public_key(email.split("@")[0], email);
  const public_key = response.data?.public_key;

  if (!public_key) return null;

  cache = { public_key, fetched_at: now };

  return public_key;
}

export function signing_key_candidates(vault: EncryptedVault): string[] {
  return [vault.identity_key, ...(vault.previous_keys ?? [])].filter(
    (key): key is string => typeof key === "string" && key.length > 0,
  );
}

export async function select_published_signing_key(
  vault: EncryptedVault,
): Promise<string> {
  const candidates = signing_key_candidates(vault);

  if (candidates.length <= 1) return vault.identity_key;

  try {
    const published = await fetch_published_public_key();

    if (!published) return vault.identity_key;

    const matching = await select_private_key_matching_public(
      candidates,
      published,
    );

    return matching ?? vault.identity_key;
  } catch {
    return vault.identity_key;
  }
}
