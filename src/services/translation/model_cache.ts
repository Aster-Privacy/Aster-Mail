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

import type { LanguageCode } from "./engine_types";

import {
  join_url,
  load_registry,
  MODEL_CACHE_NAME,
  model_base,
  type ModelRegistry,
  pair_bytes,
  pair_files,
} from "./model_source";

import { ignore_error } from "@/lib/ignore_error";

export interface CachedPack {
  pair: string;
  from: LanguageCode;
  to: LanguageCode;
  bytes: number;
}

export function cache_storage_available(): boolean {
  return typeof caches !== "undefined";
}

export async function open_model_cache(): Promise<Cache | null> {
  if (!cache_storage_available()) return null;

  try {
    return await caches.open(MODEL_CACHE_NAME);
  } catch (caught) {
    ignore_error("services/translation/model_cache:open", caught);

    return null;
  }
}

function pack_urls(registry: ModelRegistry, pair: string): string[] {
  const base = model_base();

  return pair_files(registry, pair).map((file) => join_url(base, file.name));
}

async function all_present(
  cache: Cache,
  urls: readonly string[],
): Promise<boolean> {
  if (urls.length === 0) return false;

  for (const url of urls) {
    if (!(await cache.match(url))) return false;
  }

  return true;
}

export async function pack_cached(pair: string): Promise<boolean> {
  const cache = await open_model_cache();

  if (!cache) return false;

  try {
    return await all_present(cache, pack_urls(await load_registry(), pair));
  } catch (caught) {
    ignore_error("services/translation/model_cache:pack_cached", caught);

    return false;
  }
}

export async function cached_packs(): Promise<CachedPack[]> {
  const cache = await open_model_cache();

  if (!cache) return [];

  const registry = await load_registry();
  const packs: CachedPack[] = [];

  for (const pair of Object.keys(registry).sort()) {
    if (pair.length !== 4) continue;
    if (!(await all_present(cache, pack_urls(registry, pair)))) continue;

    packs.push({
      pair,
      from: pair.slice(0, 2) as LanguageCode,
      to: pair.slice(2, 4) as LanguageCode,
      bytes: pair_bytes(registry, pair),
    });
  }

  return packs;
}

export async function cached_bytes(): Promise<number> {
  return (await cached_packs()).reduce((total, pack) => total + pack.bytes, 0);
}

export async function remove_pack(pair: string): Promise<void> {
  const cache = await open_model_cache();

  if (!cache) return;

  try {
    for (const url of pack_urls(await load_registry(), pair)) {
      await cache.delete(url);
    }
  } catch (caught) {
    ignore_error("services/translation/model_cache:remove_pack", caught);
  }
}

export async function clear_model_cache(): Promise<void> {
  if (!cache_storage_available()) return;

  try {
    await caches.delete(MODEL_CACHE_NAME);
  } catch (caught) {
    ignore_error("services/translation/model_cache:clear", caught);
  }
}
