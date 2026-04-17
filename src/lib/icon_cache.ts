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
const STORAGE_KEY = "aster_icon_cache_v9";
const OK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAIL_TTL_MS = 60 * 60 * 1000;

interface StoredEntry {
  status: "ok" | "fail";
  ts: number;
}

const memory_cache = new Map<string, "ok" | "fail">();

function load_from_storage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return;

    const entries: Record<string, StoredEntry> = JSON.parse(raw);
    const now = Date.now();
    let pruned = false;

    for (const [domain, entry] of Object.entries(entries)) {
      const ttl = entry.status === "ok" ? OK_TTL_MS : FAIL_TTL_MS;

      if (now - entry.ts > ttl) {
        pruned = true;
        continue;
      }

      memory_cache.set(domain, entry.status);
    }

    if (pruned) {
      schedule_flush();
    }
  } catch {}
}

let flush_timer: ReturnType<typeof setTimeout> | null = null;

function schedule_flush(): void {
  if (flush_timer) return;
  flush_timer = setTimeout(() => {
    flush_timer = null;

    try {
      const entries: Record<string, StoredEntry> = {};
      const now = Date.now();

      for (const [domain, status] of memory_cache) {
        entries[domain] = { status, ts: now };
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {}
  }, 1000);
}

load_from_storage();

export function is_icon_failed(domain: string): boolean {
  return memory_cache.get(domain) === "fail";
}

export function mark_icon_ok(domain: string): void {
  if (memory_cache.get(domain) === "ok") return;
  memory_cache.set(domain, "ok");
  schedule_flush();
}

export function mark_icon_failed(domain: string): void {
  if (memory_cache.get(domain) === "fail") return;
  memory_cache.set(domain, "fail");
  schedule_flush();
}
