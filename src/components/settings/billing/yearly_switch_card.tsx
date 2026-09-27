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
import type { YearlySwitchOffer } from "@/services/api/billing";

import { CalendarIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { BillingNotice } from "@/components/settings/billing/billing_layout";
import { format_price } from "@/services/api/billing";

interface YearlySwitchCardProps {
  offer: YearlySwitchOffer | null | undefined;
  currency?: string;
  on_switch: (plan_code: string) => void;
  class_name?: string;
}

export function monthly_equivalent_cents(yearly_price_cents: number): number {
  return Math.round(yearly_price_cents / 12);
}

export function YearlySwitchCard({
  offer,
  currency = "usd",
  on_switch,
  class_name = "",
}: YearlySwitchCardProps) {
  const { t } = use_i18n();

  if (!offer || offer.saving_cents <= 0) return null;

  return (
    <BillingNotice
      body={t("settings.yearly_switch_body", {
        monthly: format_price(offer.monthly_price_cents, currency),
        yearly_monthly: format_price(
          monthly_equivalent_cents(offer.yearly_price_cents),
          currency,
        ),
      })}
      class_name={class_name}
      icon={CalendarIcon}
      title={t("settings.yearly_switch_title", {
        amount: format_price(offer.saving_cents, currency),
      })}
      tone="neutral"
    >
      <button
        className="aster_btn aster_btn_primary aster_btn_sm"
        type="button"
        onClick={() => on_switch(offer.plan_code)}
      >
        {t("settings.yearly_switch_action")}
      </button>
    </BillingNotice>
  );
}
