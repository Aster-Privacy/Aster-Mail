//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
export function trim_map_to_size<K, V>(map: Map<K, V>, max_size: number): void {
  while (map.size > max_size) {
    const oldest = map.keys().next();

    if (oldest.done) return;

    map.delete(oldest.value);
  }
}

export function trim_set_to_size<T>(set: Set<T>, max_size: number): void {
  while (set.size > max_size) {
    const oldest = set.values().next();

    if (oldest.done) return;

    set.delete(oldest.value);
  }
}

export function drop_expired_entries<K>(
  map: Map<K, { timestamp: number }>,
  ttl_ms: number,
  now: number = Date.now(),
): void {
  for (const [key, entry] of map) {
    if (now - entry.timestamp > ttl_ms) map.delete(key);
  }
}
