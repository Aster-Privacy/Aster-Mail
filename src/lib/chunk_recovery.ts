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
import { hard_flush_and_reload } from "@/lib/version_check";

const CHUNK_RELOAD_MARKER = "aster:chunk_reload_at";
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

const FETCH_FAILURE_PATTERNS = [
  "Importing a module script failed",
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Failed to load module script",
  "Unable to preload CSS",
];

const LINK_FAILURE_PATTERNS = [
  "does not provide an export named",
  "import not found",
  "Importing binding name",
  "ambiguous indirect export",
  "indirectly exported binding name",
];

export function is_chunk_load_error(message: string): boolean {
  if (!message) return false;

  if (/ChunkLoadError/i.test(message)) return true;

  if (FETCH_FAILURE_PATTERNS.some((pattern) => message.includes(pattern))) {
    return true;
  }

  return LINK_FAILURE_PATTERNS.some((pattern) => message.includes(pattern));
}

export function error_message_of(value: unknown): string {
  if (typeof value === "string") return value;

  if (value && typeof value === "object" && "message" in value) {
    return String((value as { message: unknown }).message);
  }

  return "";
}

export function trigger_chunk_recovery(): void {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_MARKER) || "0");

    if (Date.now() - last < CHUNK_RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(CHUNK_RELOAD_MARKER, String(Date.now()));
  } catch {
    return;
  }

  void hard_flush_and_reload();
}
