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

import { ArrowPathIcon } from "@heroicons/react/24/solid";

import { use_i18n } from "@/lib/i18n/context";
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
    <div className={`offer_banner px-5 py-5 ${class_name}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            aria-hidden="true"
            className="offer_banner_orb flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl"
          >
            <ArrowPathIcon className="h-5 w-5" />
          </span>

          <div className="min-w-0">
            <p className="offer_banner_title text-[15px] font-semibold leading-tight">
              {t("settings.yearly_switch_title", {
                amount: format_price(offer.saving_cents, currency),
              })}
            </p>
            <p className="offer_banner_body mt-1.5 text-xs leading-relaxed">
              {t("settings.yearly_switch_body", {
                monthly: format_price(offer.monthly_price_cents, currency),
                yearly_monthly: format_price(
                  monthly_equivalent_cents(offer.yearly_price_cents),
                  currency,
                ),
              })}
            </p>
          </div>
        </div>

        <button
          className="aster_btn aster_btn_primary aster_btn_sm w-full flex-shrink-0 sm:w-auto"
          type="button"
          onClick={() => on_switch(offer.plan_code)}
        >
          {t("settings.yearly_switch_action")}
        </button>
      </div>
    </div>
  );
}
