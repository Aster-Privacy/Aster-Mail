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
import {
  safe_local_get,
  safe_local_remove,
  safe_local_set,
} from "@/lib/safe_storage";

const STORAGE_KEY = "aster_pending_invite_code";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_SHAPE = /^[A-Z0-9]{1,16}$/;

export function normalize_invite_code(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();

  return CODE_SHAPE.test(code) ? code : null;
}

export function remember_invite_code(raw: string | null | undefined): void {
  const code = normalize_invite_code(raw);

  if (!code) return;
  safe_local_set(STORAGE_KEY, JSON.stringify({ code, saved_at: Date.now() }));
}

export function read_remembered_invite_code(): string | null {
  const stored = safe_local_get(STORAGE_KEY);

  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as { code?: unknown; saved_at?: unknown };
    const code =
      typeof parsed.code === "string"
        ? normalize_invite_code(parsed.code)
        : null;
    const age =
      typeof parsed.saved_at === "number"
        ? Date.now() - parsed.saved_at
        : Infinity;

    if (code && age >= 0 && age < MAX_AGE_MS) return code;
  } catch {
    void 0;
  }
  safe_local_remove(STORAGE_KEY);

  return null;
}

export function clear_remembered_invite_code(): void {
  safe_local_remove(STORAGE_KEY);
}

export function current_invite_code(): string | null {
  if (typeof window === "undefined") return null;
  const from_url = normalize_invite_code(
    new URLSearchParams(window.location.search).get("ref"),
  );

  if (from_url) {
    remember_invite_code(from_url);

    return from_url;
  }

  return read_remembered_invite_code();
}
