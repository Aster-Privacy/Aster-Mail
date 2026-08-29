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
};

export function checkout_error_text(
  t: Translate,
  server_code?: string | null,
): string {
  const key = server_code ? SERVER_CODE_KEYS[server_code] : undefined;

  return t(key ?? "settings.failed_checkout");
}
