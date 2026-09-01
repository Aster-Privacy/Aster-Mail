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

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

const SERVER_CODE_KEYS: Record<string, TranslationKey> = {
  NOT_FOUND: "settings.plan_not_available",
  BILLING_NOT_CONFIGURED: "settings.billing_unavailable",
  STRIPE_ERROR: "settings.billing_unavailable",
  RATE_LIMIT_EXCEEDED: "settings.checkout_rate_limited",
  CONFLICT: "settings.checkout_already_active",
  FINGERPRINT_MISMATCH: "settings.checkout_session_mismatch",
  FAMILY_GROUP_MEMBER: "settings.checkout_family_group_member",
  FAMILY_PLAN_ACTIVE: "settings.checkout_family_plan_active",
  CRYPTO_OPEN_INVOICE_LIMIT: "settings.checkout_crypto_open_invoice_limit",
  CRYPTO_ACTIVE_CARD_SUBSCRIPTION: "settings.checkout_crypto_active_card",
  UNPAID_SUBSCRIPTION: "settings.checkout_unpaid_subscription",
  PENDING_CANCELLATION: "settings.checkout_pending_cancellation",
  DUPLICATE_SUBSCRIPTION: "settings.checkout_duplicate_subscription",
  PROVIDER_UNREACHABLE: "settings.checkout_provider_unreachable",
  SCA_REQUIRED: "settings.checkout_sca_required",
  CARD_DECLINED: "settings.checkout_card_declined",
  COLLECTION_FAILED: "settings.checkout_collection_failed",
};

export function checkout_error_text(
  t: Translate,
  server_code?: string | null,
): string {
  const key = server_code ? SERVER_CODE_KEYS[server_code] : undefined;

  return t(key ?? "settings.failed_checkout");
}
