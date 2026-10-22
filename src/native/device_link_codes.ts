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
const STORAGE_KEY = "aster_device_link_codes";
const MAX_CODES = 5;

export const MIN_REUSE_MS = 90_000;

export interface DeviceLinkCode {
  code: string;
  device_key: string;
  expires_at: number;
}

function is_link_code(value: unknown): value is DeviceLinkCode {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;

  return (
    typeof entry.code === "string" &&
    typeof entry.device_key === "string" &&
    typeof entry.expires_at === "number"
  );
}

function read_all(): DeviceLinkCode[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed.filter(is_link_code) : [];
  } catch {
    return [];
  }
}

function write_all(codes: DeviceLinkCode[]): void {
  try {
    if (codes.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
    }
  } catch {
    return;
  }
}

function newest_first(codes: DeviceLinkCode[]): DeviceLinkCode[] {
  return [...codes].sort((a, b) => b.expires_at - a.expires_at);
}

export function load_link_codes(
  device_key: string,
  now: number = Date.now(),
): DeviceLinkCode[] {
  const all = read_all();
  const live = all.filter((entry) => entry.expires_at > now);

  if (live.length !== all.length) write_all(live);

  return newest_first(live.filter((entry) => entry.device_key === device_key));
}

export function remember_link_code(
  entry: DeviceLinkCode,
  now: number = Date.now(),
): void {
  const others = read_all().filter(
    (existing) => existing.code !== entry.code && existing.expires_at > now,
  );

  write_all(newest_first([entry, ...others]).slice(0, MAX_CODES));
}

export function forget_link_code(code: string): void {
  write_all(read_all().filter((entry) => entry.code !== code));
}

export function clear_link_codes(): void {
  write_all([]);
}

export function pick_reusable_code(
  codes: DeviceLinkCode[],
  now: number = Date.now(),
): DeviceLinkCode | null {
  return (
    newest_first(codes).find(
      (entry) => entry.expires_at - now >= MIN_REUSE_MS,
    ) ?? null
  );
}
