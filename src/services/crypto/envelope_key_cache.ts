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
const ENVELOPE_KEY_CACHE_MAX_ENTRIES = 512;

const ENVELOPE_KEY_CACHE = new Map<string, Promise<CryptoKey>>();

export async function with_cached_envelope_key(
  cache_id: string,
  derive: () => Promise<CryptoKey>,
): Promise<CryptoKey> {
  const cached = ENVELOPE_KEY_CACHE.get(cache_id);

  if (cached) return cached;

  const pending = derive();

  ENVELOPE_KEY_CACHE.set(cache_id, pending);

  if (ENVELOPE_KEY_CACHE.size > ENVELOPE_KEY_CACHE_MAX_ENTRIES) {
    const oldest = ENVELOPE_KEY_CACHE.keys().next();

    if (!oldest.done && oldest.value !== cache_id) {
      ENVELOPE_KEY_CACHE.delete(oldest.value);
    }
  }

  try {
    return await pending;
  } catch (error) {
    ENVELOPE_KEY_CACHE.delete(cache_id);

    throw error;
  }
}

export function clear_envelope_key_cache(): void {
  ENVELOPE_KEY_CACHE.clear();
}
