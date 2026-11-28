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
export type SenderKeyStanding =
  "current" | "in_window" | "retired" | "undated" | "unlisted" | "unavailable";

export interface PublishedIdentityEntry {
  kem_identity_key: string | null;
  first_published_at: string | null;
  last_published_at: string | null;
}

export const RETIREMENT_GRACE_US = 10 * 60 * 1_000_000;

const RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:([Zz])|([+-])(\d{2}):(\d{2}))$/;

export function published_at_us(value: unknown): number | null {
  if (typeof value !== "string") return null;

  const match = RFC3339.exec(value.trim());

  if (!match) return null;

  const [y, mo, d, h, mi] = match.slice(1, 6).map(Number);
  const s = Number(match[6] ?? 0);
  const offset_h = Number(match[10] ?? 0);
  const offset_m = Number(match[11] ?? 0);
  const day = new Date(Date.UTC(y, mo - 1, d));

  if (
    y < 1970 ||
    day.getUTCFullYear() !== y ||
    day.getUTCMonth() !== mo - 1 ||
    day.getUTCDate() !== d ||
    h > 23 ||
    mi > 59 ||
    s > 59 ||
    offset_h > 18 ||
    offset_m > 59
  ) {
    return null;
  }

  const offset_s =
    (match[9] === "-" ? -1 : 1) * (offset_h * 3600 + offset_m * 60);
  const seconds = Date.UTC(y, mo - 1, d, h, mi, s) / 1000 - offset_s;
  const micros = Number(((match[7] ?? "") + "000000").slice(0, 6));
  const total = seconds * 1_000_000 + micros;

  return Number.isSafeInteger(total) ? total : null;
}

export function retired_at_us(
  identity_key: string,
  entries: PublishedIdentityEntry[],
): number | null {
  const own = entries.filter(
    (entry) => entry.kem_identity_key === identity_key,
  );

  if (own.length === 0) return null;

  const own_last = own.map((entry) => published_at_us(entry.last_published_at));

  if (own_last.some((value) => value === null)) return null;

  const last_seen = Math.max(...(own_last as number[]));
  let successor: number | null = null;

  for (const entry of entries) {
    if (!entry.kem_identity_key || entry.kem_identity_key === identity_key) {
      continue;
    }

    const first = published_at_us(entry.first_published_at);

    if (
      first !== null &&
      first >= last_seen &&
      (successor === null || first < successor)
    ) {
      successor = first;
    }
  }

  return successor ?? last_seen;
}

export function history_standing(
  identity_key: string,
  entries: PublishedIdentityEntry[],
  received_at_us: number | null,
): SenderKeyStanding {
  if (!entries.some((entry) => entry.kem_identity_key === identity_key)) {
    return "unlisted";
  }

  const retired_at = retired_at_us(identity_key, entries);

  if (retired_at === null || received_at_us === null) return "undated";

  const own_first = entries
    .filter((entry) => entry.kem_identity_key === identity_key)
    .map((entry) => published_at_us(entry.first_published_at));

  if (own_first.some((first) => first === null)) return "undated";

  if (
    received_at_us <
    Math.min(...(own_first as number[])) - RETIREMENT_GRACE_US
  ) {
    return "retired";
  }

  return received_at_us <= retired_at + RETIREMENT_GRACE_US
    ? "in_window"
    : "retired";
}

export function received_at_us(sent_at: number | undefined): number | null {
  return typeof sent_at === "number" &&
    Number.isSafeInteger(sent_at) &&
    sent_at > 0
    ? sent_at * 1000
    : null;
}

export function standing_confirms(standing: SenderKeyStanding | null): boolean {
  return standing === "current" || standing === "in_window";
}

export function standing_is_retired(
  standing: SenderKeyStanding | null,
): boolean {
  return standing === "retired" || standing === "undated";
}
