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
import type { PendingOffer } from "@/services/api/billing";

const DISMISSED_STORAGE_KEY = "aster_dismissed_offers";

const MAX_REMEMBERED_OFFERS = 20;

const SNOOZE_STORAGE_KEY = "aster_snoozed_offers";

const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export function offer_discount_percent(
  discount_label: string | null | undefined,
): number | null {
  if (!discount_label) return null;

  const match = discount_label.match(/(\d{1,2})\s*%/);

  if (!match) return null;

  const percent = Number(match[1]);

  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) return null;

  return percent;
}

export function offer_is_live(
  offer: PendingOffer | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!offer || !offer.code) return false;

  const expiry = Date.parse(offer.expires_at);

  if (Number.isNaN(expiry)) return false;

  return expiry > now;
}

export function read_dismissed_offers(): string[] {
  if (typeof localStorage === "undefined") return [];

  try {
    const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);

    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter((code): code is string => typeof code === "string");
  } catch {
    return [];
  }
}

export function is_offer_dismissed(code: string): boolean {
  return read_dismissed_offers().includes(code);
}

export function dismiss_offer(code: string): void {
  if (typeof localStorage === "undefined") return;

  const next = [
    code,
    ...read_dismissed_offers().filter((entry) => entry !== code),
  ].slice(0, MAX_REMEMBERED_OFFERS);

  try {
    localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(next));
  } catch {
    return;
  }
}

function read_snoozed_offers(): Record<string, number> {
  if (typeof localStorage === "undefined") return {};

  try {
    const raw = localStorage.getItem(SNOOZE_STORAGE_KEY);

    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};

    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    );

    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export function is_offer_snoozed(
  code: string,
  now: number = Date.now(),
): boolean {
  const snoozed_at = read_snoozed_offers()[code];

  if (typeof snoozed_at !== "number") return false;

  return now - snoozed_at < SNOOZE_MS;
}

export function snooze_offer(code: string, now: number = Date.now()): void {
  if (typeof localStorage === "undefined") return;

  const current = read_snoozed_offers();
  const fresh = Object.entries(current)
    .filter(([, at]) => now - at < SNOOZE_MS)
    .slice(-MAX_REMEMBERED_OFFERS);

  try {
    localStorage.setItem(
      SNOOZE_STORAGE_KEY,
      JSON.stringify({ ...Object.fromEntries(fresh), [code]: now }),
    );
  } catch {
    return;
  }
}

export function should_show_offer(
  offer: PendingOffer | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!offer_is_live(offer, now)) return false;

  return (
    !is_offer_dismissed(offer!.code) && !is_offer_snoozed(offer!.code, now)
  );
}
