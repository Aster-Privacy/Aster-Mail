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

export const MAX_CACHE_ENTRIES = 2000;
export const MAX_CACHE_BYTES = 50 * 1024 * 1024;

export interface CacheKeyParts {
  account_id: string;
  message_id: string;
  source: LanguageCode;
  target: LanguageCode;
  model_version: string;
}

interface CacheEntry {
  segments: string[];
  bytes: number;
}

const entries = new Map<string, CacheEntry>();
let total_bytes = 0;

export function cache_key(parts: CacheKeyParts): string {
  return `${parts.account_id}|${parts.message_id}|${parts.source}|${parts.target}|${parts.model_version}`;
}

function measure(segments: readonly string[]): number {
  let bytes = 0;

  for (const segment of segments) bytes += segment.length * 2;

  return bytes;
}

function evict_oldest(): boolean {
  const oldest = entries.keys().next();

  if (oldest.done) return false;

  const entry = entries.get(oldest.value);

  if (entry) total_bytes -= entry.bytes;

  entries.delete(oldest.value);

  return true;
}

export function read_translation(parts: CacheKeyParts): string[] | null {
  const key = cache_key(parts);
  const entry = entries.get(key);

  if (!entry) return null;

  entries.delete(key);
  entries.set(key, entry);

  return entry.segments.slice();
}

export function write_translation(
  parts: CacheKeyParts,
  segments: readonly string[],
): void {
  const key = cache_key(parts);
  const existing = entries.get(key);

  if (existing) {
    total_bytes -= existing.bytes;
    entries.delete(key);
  }

  const bytes = measure(segments);

  if (bytes > MAX_CACHE_BYTES) return;

  entries.set(key, { segments: segments.slice(), bytes });
  total_bytes += bytes;

  while (
    (entries.size > MAX_CACHE_ENTRIES || total_bytes > MAX_CACHE_BYTES) &&
    entries.size > 1
  ) {
    if (!evict_oldest()) break;
  }
}

export function clear_translation_cache(): void {
  entries.clear();
  total_bytes = 0;
}

export function translation_cache_stats(): {
  entries: number;
  bytes: number;
} {
  return { entries: entries.size, bytes: total_bytes };
}
