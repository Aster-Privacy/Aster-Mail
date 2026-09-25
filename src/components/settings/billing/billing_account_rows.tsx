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
  ChevronRightIcon,
  CreditCardIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/outline";

import { BILLING_CARD_CLASS } from "@/components/settings/billing/billing_skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import {
  format_price,
  type CreditBalanceResponse,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";

interface BillingAccountRowsProps {
  credit_balance: CreditBalanceResponse | null;
  show_payment_row: boolean;
  on_update_payment: () => void;
  on_top_up: () => void;
}

export function BillingAccountRows({
  credit_balance,
  show_payment_row,
  on_update_payment,
  on_top_up,
}: BillingAccountRowsProps) {
  const { t } = use_i18n();

  return (
    <div className={`${BILLING_CARD_CLASS} py-1`}>
      {show_payment_row && (
        <button
          className="flex min-h-[54px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-surf-hover"
          type="button"
          onClick={on_update_payment}
        >
          <CreditCardIcon className="h-[18px] w-[18px] flex-shrink-0 text-txt-secondary" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-txt-primary">
              {t("settings.bill_payment")}
            </span>
            <span className="block text-[13px] text-txt-muted">
              {t("settings.bill_payment_subtitle")}
            </span>
          </span>
          <span
            className="flex flex-shrink-0 items-center gap-0.5 text-sm font-semibold"
            style={{ color: "var(--accent-blue)" }}
          >
            {t("settings.bill_update_payment")}
            <ChevronRightIcon className="h-4 w-4" />
          </span>
        </button>
      )}
      <button
        className="flex min-h-[54px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-surf-hover"
        id="credits_section"
        type="button"
        onClick={on_top_up}
      >
        <CurrencyDollarIcon className="h-[18px] w-[18px] flex-shrink-0 text-txt-secondary" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-txt-primary">
            {t("settings.bill_credits")}
          </span>
          {credit_balance ? (
            <span className="block text-[13px] text-txt-muted">
              {format_price(credit_balance.balance_cents)}
            </span>
          ) : (
            <Skeleton className="mt-1 h-3 w-14 rounded" />
          )}
        </span>
        <span
          className="flex flex-shrink-0 items-center gap-0.5 text-sm font-semibold"
          style={{ color: "var(--accent-blue)" }}
        >
          {t("settings.bill_top_up")}
          <ChevronRightIcon className="h-4 w-4" />
        </span>
      </button>
    </div>
  );
}
