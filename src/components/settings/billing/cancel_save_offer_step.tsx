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
import type { SaveOffer } from "@/components/settings/billing/cancel_offer";

import { button_variants } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { ButtonSpinner } from "@/components/ui/spinner";

interface CancelSaveOfferStepProps {
  offer: SaveOffer;
  plan_name: string;
  is_busy: boolean;
  keep_plan_slot?: ReactNode;
  on_accept: () => void;
  on_back: () => void;
  on_continue: () => void;
}

export function CancelSaveOfferStep({
  offer,
  plan_name,
  is_busy,
  keep_plan_slot,
  on_accept,
  on_back,
  on_continue,
}: CancelSaveOfferStepProps) {
  const { t } = use_i18n();

  return (
    <div className="py-1">
      <div className="rounded-lg border border-edge-secondary px-3.5 py-3">
        <p className="text-sm leading-relaxed text-txt-secondary">
          {t("settings.save_offer_body", {
            plan: plan_name,
            percent: offer.percent_off,
            count: offer.months,
          })}
        </p>
        <button
          className={`${button_variants({ variant: "primary" })} mt-3 w-full`}
          disabled={is_busy}
          type="button"
          onClick={on_accept}
        >
          {t("settings.save_offer_action", { percent: offer.percent_off })}
          {is_busy && <ButtonSpinner />}
        </button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-txt-muted">
        {t("settings.save_offer_hint")}
      </p>

      <div className="mt-5 flex flex-row items-center gap-2">
        {keep_plan_slot}
        <div className="ml-auto flex flex-row items-center gap-2">
          <button
            className={button_variants({ variant: "ghost" })}
            disabled={is_busy}
            type="button"
            onClick={on_back}
          >
            {t("common.back")}
          </button>
          <button
            className={button_variants({ variant: "ghost" })}
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
