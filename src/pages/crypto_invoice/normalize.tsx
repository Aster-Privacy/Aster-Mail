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
  type CryptoInvoiceStatus,
  type CryptoNativeInvoiceStatus,
} from "@/services/api/billing";


export function decimal_matches(candidate: string, expected: string): boolean {
  const left = Number(candidate);
  const right = Number(expected);

  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;

  return Math.abs(left - right) <= Math.max(Math.abs(right) * 1e-9, 0);
}

export function string_of(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function number_of(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function string_list_of(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter((entry): entry is string => typeof entry === "string");
}

export function normalize_invoice(raw: unknown): CryptoNativeInvoiceStatus | null {
  if (!raw || typeof raw !== "object") return null;

  const source = raw as Record<string, unknown>;
  const id = string_of(source.id);
  const status = string_of(source.status);

  if (!id || !status) return null;

  const currency = string_of(source.currency);
  const amount_atomic = string_of(source.amount_atomic, "0");
  const amount_decimal = string_of(source.amount_decimal, "0");

  return {
    id,
    currency,
    chain: string_of(source.chain),
    display_name: string_of(source.display_name, currency),
    address: string_of(source.address),
    amount_atomic,
    amount_decimal,
    amount_received_atomic: string_of(source.amount_received_atomic, "0"),
    amount_received_decimal: string_of(source.amount_received_decimal, "0"),
    amount_due_atomic: string_of(source.amount_due_atomic, amount_atomic),
    amount_due_decimal: string_of(source.amount_due_decimal, amount_decimal),
    decimals: number_of(source.decimals),
    usd_cents: number_of(source.usd_cents),
    rate_locked_usd: string_of(source.rate_locked_usd),
    status: status as CryptoInvoiceStatus,
    confirmations: number_of(source.confirmations),
    min_confirmations: number_of(source.min_confirmations, 1),
    txids: string_list_of(source.txids),
    payment_uri: string_of(source.payment_uri),
    expires_at: string_of(source.expires_at),
    watch_until: string_of(source.watch_until),
    created_at: string_of(source.created_at),
    completed_at:
      typeof source.completed_at === "string" ? source.completed_at : null,
    server_time:
      typeof source.server_time === "string" ? source.server_time : undefined,
  };
}

export function normalize_atomic(candidate: string): string | null {
  const trimmed = candidate.trim();
  const scientific = /^(\d+)(?:\.(\d+))?[eE]\+?(\d+)$/.exec(trimmed);

  if (!scientific) return /^\d+$/.test(trimmed) ? trimmed : null;

  const [, whole, fraction = "", exponent] = scientific;
  const shift = Number(exponent);

  if (!Number.isSafeInteger(shift) || shift > 96 || fraction.length > shift) {
    return null;
  }

  return `${whole}${fraction}${"0".repeat(shift - fraction.length)}`.replace(
    /^0+(?=\d)/,
    "",
  );
}

export function atomic_matches(candidate: string, expected: string): boolean {
  const normalized = normalize_atomic(candidate);

  if (normalized === null) return false;

  try {
    return BigInt(normalized) === BigInt(expected);
  } catch {
    return false;
  }
}

