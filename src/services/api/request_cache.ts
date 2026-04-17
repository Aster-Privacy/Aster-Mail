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

const DEFAULT_CACHE_TTL = 15_000;
const MAX_CACHE_ENTRIES = 200;

interface CacheEntry {
  response: unknown;
  timestamp: number;
  ttl: number;
}

export class RequestCache {
  private response_cache = new Map<string, CacheEntry>();
  private in_flight = new Map<string, Promise<unknown>>();

  async get_or_fetch<T>(
    cache_key: string,
    fetcher: () => Promise<T>,
    ttl: number = DEFAULT_CACHE_TTL,
    skip_cache: boolean = false,
  ): Promise<T> {
    if (!skip_cache && ttl > 0) {
      const cached = this.response_cache.get(cache_key);

      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        return cached.response as T;
      }
    }

    const pending = this.in_flight.get(cache_key);

    if (pending) {
      return pending as Promise<T>;
    }

    const promise = fetcher()
      .then((result) => {
        this.in_flight.delete(cache_key);

        if (ttl > 0 && this.is_cacheable_response(result)) {
          this.set_entry(cache_key, result, ttl);
        }

        return result;
      })
      .catch((error) => {
        this.in_flight.delete(cache_key);
        throw error;
      });

    this.in_flight.set(cache_key, promise);

    return promise;
  }

  invalidate(pattern?: string | RegExp): number {
    if (!pattern) {
      const count = this.response_cache.size;

      this.response_cache.clear();

      return count;
    }

    let count = 0;

    for (const key of [...this.response_cache.keys()]) {
      const matches =
        typeof pattern === "string" ? key.includes(pattern) : pattern.test(key);

      if (matches) {
        this.response_cache.delete(key);
        count++;
      }
    }

    return count;
  }

  invalidate_for_mutation(endpoint: string): void {
    const resource_base = this.extract_resource_base(endpoint);

    if (resource_base) {
      this.invalidate(resource_base);
    }
  }

  clear(): void {
    this.response_cache.clear();
    this.in_flight.clear();
  }

  get size(): number {
    return this.response_cache.size;
  }

  get pending_count(): number {
    return this.in_flight.size;
  }

  private is_cacheable_response(result: unknown): boolean {
    if (result && typeof result === "object" && "error" in result) {
      return !(result as { error?: unknown }).error;
    }

    return true;
  }

  private set_entry(key: string, response: unknown, ttl: number): void {
    if (this.response_cache.size >= MAX_CACHE_ENTRIES) {
      const oldest_key = this.response_cache.keys().next().value;

      if (oldest_key) {
        this.response_cache.delete(oldest_key);
      }
    }

    this.response_cache.set(key, {
      response,
      timestamp: Date.now(),
      ttl,
    });
  }

  private extract_resource_base(endpoint: string): string | null {
    const match = endpoint.match(/^(\/[^/?]+\/v\d+\/[^/?]+)/);

    return match ? match[1] : null;
  }
}

export const request_cache = new RequestCache();
