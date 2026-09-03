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
import type { ReactNode } from "react";
import type { DowngradeOffer } from "@/components/settings/billing/cancel_offer";

import { button_variants } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { format_price } from "@/services/api/billing";
import { convert_cents } from "@/components/settings/billing/billing_constants";

interface CancelOfferStepProps {
  offer: DowngradeOffer;
  preferred_currency: string;
  is_busy: boolean;
  keep_plan_slot?: ReactNode;
  on_switch: () => void;
  on_back: () => void;
  on_continue: () => void;
}

export function CancelOfferStep({
  offer,
  preferred_currency,
  is_busy,
  keep_plan_slot,
  on_switch,
  on_back,
  on_continue,
}: CancelOfferStepProps) {
  const { t } = use_i18n();

  const price = format_price(
    convert_cents(offer.monthly_cents, preferred_currency),
    preferred_currency,
  );

  return (
    <div className="py-1">
      <div className="rounded-lg border border-edge-secondary px-3.5 py-3">
        <p className="text-sm leading-relaxed text-txt-secondary">
          {t("settings.cancel_offer_body", {
            plan: offer.plan_name,
            price,
          })}
        </p>
        <button
          className={`${button_variants({ variant: "primary", size: "sm" })} mt-3 w-full`}
          disabled={is_busy}
          type="button"
          onClick={on_switch}
        >
          {t("settings.cancel_offer_switch", { plan: offer.plan_name })}
        </button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-txt-muted">
        {t("settings.cancel_offer_hint")}
      </p>

      <div className="mt-5 flex flex-row items-center gap-2">
        {keep_plan_slot}
        <div className="ml-auto flex flex-row items-center gap-2">
          <button
            className={button_variants({ variant: "ghost", size: "sm" })}
            type="button"
            onClick={on_back}
          >
            {t("common.back")}
          </button>
          <button
            className={button_variants({ variant: "ghost", size: "sm" })}
            disabled={is_busy}
            type="button"
            onClick={on_continue}
          >
            {t("settings.cancel_offer_continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
