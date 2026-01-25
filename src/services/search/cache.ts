import {
  create_search_cache,
  type EncryptedSearchCache,
} from "../crypto/search_crypto";

const CACHE_SIZE = 200;

let result_cache: EncryptedSearchCache | null = null;

function get_cache(): EncryptedSearchCache {
  if (!result_cache) {
    result_cache = create_search_cache(CACHE_SIZE);
  }

  return result_cache;
}

export function get_cached_results(cache_key: string): string[] | null {
  return get_cache().get(cache_key) ?? null;
}

export function set_cached_results(cache_key: string, results: string[]): void {
  get_cache().set(cache_key, results);
}

export function clear_search_cache(): void {
  if (result_cache) {
    result_cache.clear();
  }
}
