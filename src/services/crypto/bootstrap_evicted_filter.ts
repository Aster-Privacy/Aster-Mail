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
import { array_to_base64, canonical_base64_to_array } from "./base64";

export const EVICTED_FILTER_BYTES = 4096;
export const EVICTED_FILTER_HASHES = 7;

const FILTER_BITS = EVICTED_FILTER_BYTES * 8;
const FNV_PRIME = 0x01000193;
const FIRST_SEED = 0x811c9dc5;
const SECOND_SEED = 0x050c5d1f;

function fnv1a(value: string, seed: number): number {
  let hash = seed;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
}

function filter_positions(value: string): number[] {
  const first = fnv1a(value, FIRST_SEED);
  const step = (fnv1a(value, SECOND_SEED) | 1) >>> 0;
  const positions: number[] = [];

  for (let i = 0; i < EVICTED_FILTER_HASHES; i++) {
    positions.push((first + i * step) % FILTER_BITS);
  }

  return positions;
}

export function evicted_pair(key: string, message: string): string {
  return `${key}\n${message}`;
}

export function empty_evicted_filter(): Uint8Array {
  return new Uint8Array(EVICTED_FILTER_BYTES);
}

export function decode_evicted_filter(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length === 0) {
    return empty_evicted_filter();
  }

  const bytes = canonical_base64_to_array(value);

  return bytes && bytes.length === EVICTED_FILTER_BYTES
    ? bytes
    : empty_evicted_filter();
}

export function evicted_filter_is_empty(filter: Uint8Array): boolean {
  return filter.every((byte) => byte === 0);
}

export function encode_evicted_filter(filter: Uint8Array): string | undefined {
  return evicted_filter_is_empty(filter) ? undefined : array_to_base64(filter);
}

export function evicted_filter_add(filter: Uint8Array, value: string): void {
  for (const position of filter_positions(value)) {
    filter[position >>> 3] |= 1 << (position & 7);
  }
}

export function evicted_filter_has(filter: Uint8Array, value: string): boolean {
  return filter_positions(value).every(
    (position) => (filter[position >>> 3] & (1 << (position & 7))) !== 0,
  );
}

export function evicted_filter_union(
  left: Uint8Array,
  right: Uint8Array,
): Uint8Array {
  const merged = empty_evicted_filter();

  for (let i = 0; i < EVICTED_FILTER_BYTES; i++) {
    merged[i] = left[i] | right[i];
  }

  return merged;
}
