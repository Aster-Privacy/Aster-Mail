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
  UNSAFE_WALLET_SCHEMES,
  WALLET_SCHEME_BY_CHAIN,
  WALLET_SCHEME_SHAPE,
} from "./constants";
import { received_atomic_of } from "./format";
import { atomic_matches, decimal_matches } from "./normalize";

import { type CryptoNativeInvoiceStatus } from "@/services/api/billing";

export function scheme_allowed_for_chain(
  scheme: string,
  chain: string,
): boolean {
  if (UNSAFE_WALLET_SCHEMES.has(scheme)) return false;
  if (!WALLET_SCHEME_SHAPE.test(scheme)) return false;

  const expected = WALLET_SCHEME_BY_CHAIN[chain.trim().toLowerCase()];

  return expected ? scheme === expected : true;
}

export function uri_recipient(parsed: URL): string {
  const transfer_target = parsed.searchParams.get("address");

  if (transfer_target) return transfer_target;

  const head = parsed.pathname.split("/")[0] ?? "";

  return head.split("@")[0] ?? "";
}

export function uri_amount_agrees(
  parsed: URL,
  expected_decimal: string,
  expected_atomic: string,
): boolean {
  const decimal_param =
    parsed.searchParams.get("amount") ?? parsed.searchParams.get("tx_amount");

  if (decimal_param !== null) {
    return decimal_matches(decimal_param, expected_decimal);
  }

  const atomic_param =
    parsed.searchParams.get("uint256") ?? parsed.searchParams.get("value");

  if (atomic_param !== null) {
    return atomic_matches(atomic_param, expected_atomic);
  }

  return true;
}

export function safe_wallet_uri(
  invoice: CryptoNativeInvoiceStatus,
): string | null {
  const candidate = invoice.payment_uri;
  const expected_address = invoice.address;

  if (typeof candidate !== "string" || candidate.length === 0) return null;
  if (typeof expected_address !== "string" || expected_address.length === 0) {
    return null;
  }

  try {
    const parsed = new URL(candidate);

    if (
      !scheme_allowed_for_chain(parsed.protocol.toLowerCase(), invoice.chain)
    ) {
      return null;
    }

    if (
      uri_recipient(parsed).toLowerCase() !== expected_address.toLowerCase()
    ) {
      return null;
    }

    const received = received_atomic_of(invoice.amount_received_atomic);
    const partially_funded = received !== null && received > 0n;

    const agrees =
      uri_amount_agrees(
        parsed,
        invoice.amount_due_decimal,
        invoice.amount_due_atomic,
      ) ||
      (!partially_funded &&
        uri_amount_agrees(
          parsed,
          invoice.amount_decimal,
          invoice.amount_atomic,
        ));

    if (!agrees) return null;

    return parsed.href;
  } catch {
    return null;
  }
}
