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
import type { TranslationKey } from "@/lib/i18n/types";

import type { checkout_method } from "@/components/settings/checkout_options";

export type checkout_decline_kind =
  | "insufficient_funds"
  | "expired_card"
  | "card_details"
  | "card_not_supported"
  | "contact_bank"
  | "try_again"
  | "authentication";

export interface checkout_payment_error {
  type?: string;
  code?: string;
  decline_code?: string;
  message?: string;
}

const KIND_BY_CODE: Record<string, checkout_decline_kind> = {
  insufficient_funds: "insufficient_funds",
  withdrawal_count_limit_exceeded: "insufficient_funds",
  card_velocity_exceeded: "insufficient_funds",
  expired_card: "expired_card",
  incorrect_cvc: "card_details",
  invalid_cvc: "card_details",
  incorrect_number: "card_details",
  invalid_number: "card_details",
  invalid_expiry_month: "card_details",
  invalid_expiry_year: "card_details",
  incorrect_zip: "card_details",
  incorrect_address: "card_details",
  card_not_supported: "card_not_supported",
  currency_not_supported: "card_not_supported",
  transaction_not_allowed: "card_not_supported",
  processing_error: "try_again",
  issuer_not_available: "try_again",
  try_again_later: "try_again",
  reenter_transaction: "try_again",
  approve_with_id: "try_again",
  authentication_required: "authentication",
  authentication_not_handled: "authentication",
  payment_intent_authentication_failure: "authentication",
};

const MESSAGE_KEYS: Record<checkout_decline_kind, TranslationKey> = {
  insufficient_funds: "settings.checkout_decline_insufficient_funds",
  expired_card: "settings.checkout_decline_expired_card",
  card_details: "settings.checkout_decline_card_details",
  card_not_supported: "settings.checkout_decline_card_not_supported",
  contact_bank: "settings.checkout_decline_contact_bank",
  try_again: "settings.checkout_decline_try_again",
  authentication: "settings.checkout_sca_required",
};

const FIXABLE_IN_PLACE: ReadonlySet<checkout_decline_kind> = new Set([
  "card_details",
  "try_again",
  "authentication",
]);

export function checkout_decline_kind(
  error: checkout_payment_error,
): checkout_decline_kind | null {
  const by_code =
    (error.decline_code && KIND_BY_CODE[error.decline_code]) ||
    (error.code && KIND_BY_CODE[error.code]);

  if (by_code) return by_code;
  if (error.type === "card_error") return "contact_bank";

  return null;
}

export function checkout_decline_message_key(
  kind: checkout_decline_kind,
): TranslationKey {
  return MESSAGE_KEYS[kind];
}

export function alternate_checkout_method(
  kind: checkout_decline_kind,
  current: checkout_method,
  available: readonly checkout_method[],
): checkout_method | null {
  if (FIXABLE_IN_PLACE.has(kind)) return null;

  const preferred: checkout_method[] = ["wallet", "cashapp", "card", "crypto"];

  return (
    preferred.find(
      (method) => method !== current && available.includes(method),
    ) ?? null
  );
}
