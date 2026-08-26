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

import { pivot_route } from "./engine_types";

import { ignore_error } from "@/lib/ignore_error";

const STORAGE_KEY = "aster_translation_pack_consent";

function read_set(): Set<string> {
  try {
    if (typeof localStorage === "undefined") return new Set();

    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return new Set();

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) return new Set();

    return new Set(
      parsed.filter((value): value is string => typeof value === "string"),
    );
  } catch (caught) {
    ignore_error("services/translation/download_consent:read", caught);

    return new Set();
  }
}

function write_set(values: Set<string>): void {
  try {
    if (typeof localStorage === "undefined") return;

    localStorage.setItem(STORAGE_KEY, JSON.stringify([...values].sort()));
  } catch (caught) {
    ignore_error("services/translation/download_consent:write", caught);
  }
}

export function route_packs(from: LanguageCode, to: LanguageCode): string[] {
  return pivot_route(from, to).map((hop) => `${hop.from}${hop.to}`);
}

export function route_consent_granted(
  from: LanguageCode,
  to: LanguageCode,
): boolean {
  const granted = read_set();

  return route_packs(from, to).every((pack) => granted.has(pack));
}

export function grant_route_consent(
  from: LanguageCode,
  to: LanguageCode,
): void {
  const granted = read_set();

  for (const pack of route_packs(from, to)) granted.add(pack);

  write_set(granted);
}

export function revoke_pack_consent(pack: string): void {
  const granted = read_set();

  if (!granted.delete(pack)) return;

  write_set(granted);
}

export function clear_pack_consent(): void {
  try {
    if (typeof localStorage === "undefined") return;

    localStorage.removeItem(STORAGE_KEY);
  } catch (caught) {
    ignore_error("services/translation/download_consent:clear", caught);
  }
}
