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

import { app_locale, get_display_time_zone } from "@/utils/date_format";

export function pretty_chain(chain: string): string {
  const known: Record<string, string> = {
    bitcoin: "Bitcoin",
    base: "Base",
    ethereum: "Ethereum",
    polygon: "Polygon",
    arbitrum: "Arbitrum",
    optimism: "Optimism",
    monero: "Monero",
  };

  return known[chain] ?? chain.charAt(0).toUpperCase() + chain.slice(1);
}

export function coin_title(display_name: string, chain: string): string {
  const suffix = ` (${pretty_chain(chain)})`;

  return display_name.toLowerCase().endsWith(suffix.toLowerCase())
    ? display_name.slice(0, display_name.length - suffix.length).trim()
    : display_name;
}

export function format_clock_time(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString(app_locale(), {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: get_display_time_zone(),
    });
  } catch {
    return new Date(ms).toLocaleTimeString();
  }
}

export function format_countdown(ms: number): string {
  if (!Number.isFinite(ms)) return "--:--";
  if (ms <= 0) return "0:00";

  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;

  return `${minutes}:${pad(seconds)}`;
}

export function outstanding_atomic(
  expected_atomic: string,
  received_atomic: string,
): bigint | null {
  try {
    const remaining = BigInt(expected_atomic) - BigInt(received_atomic);

    return remaining > 0n ? remaining : 0n;
  } catch {
    return null;
  }
}

export function received_atomic_of(received: string): bigint | null {
  try {
    return BigInt(received);
  } catch {
    return null;
  }
}

export function truncate_middle(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail + 1) return value;

  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function format_locked_rate(rate_usd: string): string | null {
  const parsed = Number(rate_usd);

  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  const fraction_digits = parsed >= 1 ? 2 : 6;

  return new Intl.NumberFormat(app_locale(), {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fraction_digits,
    maximumFractionDigits: fraction_digits,
  }).format(parsed);
}

export function elapsed_fraction(
  created_at: string,
  expires_at: string,
  now: number,
): number {
  const start = Date.parse(created_at);
  const end = Date.parse(expires_at);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return 0;

  const fraction = (now - start) / (end - start);

  return Math.min(1, Math.max(0, fraction));
}
