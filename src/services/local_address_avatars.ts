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
import { normalize_address_ignoring_dots } from "@/utils/address_dots";

export interface local_address_avatar {
  email: string;
  profile_picture?: string;
  display_name?: string;
}

let entries: Map<string, local_address_avatar> = new Map();
const listeners = new Set<() => void>();

function build_map(values: local_address_avatar[]): Map<string, local_address_avatar> {
  const next = new Map<string, local_address_avatar>();

  for (const value of values) {
    const email = value.email?.trim();

    if (!email || !value.profile_picture) continue;

    const key = normalize_address_ignoring_dots(email);

    if (!next.has(key)) next.set(key, value);
  }

  return next;
}

function is_same_map(
  left: Map<string, local_address_avatar>,
  right: Map<string, local_address_avatar>,
): boolean {
  if (left.size !== right.size) return false;

  for (const [key, value] of left) {
    const other = right.get(key);

    if (!other) return false;
    if (other.profile_picture !== value.profile_picture) return false;
    if (other.display_name !== value.display_name) return false;
  }

  return true;
}

export function set_local_address_avatars(values: local_address_avatar[]): void {
  const next = build_map(values);

  if (is_same_map(entries, next)) return;

  entries = next;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore */
    }
  });
}

export function get_local_address_avatar(
  address: string | null | undefined,
): local_address_avatar | null {
  const trimmed = address?.trim();

  if (!trimmed || entries.size === 0) return null;

  return entries.get(normalize_address_ignoring_dots(trimmed)) ?? null;
}

export function subscribe_local_address_avatars(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function clear_local_address_avatars(): void {
  if (entries.size === 0) return;

  entries = new Map();
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore */
    }
  });
}
