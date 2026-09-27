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
import { SparklesIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { BillingNotice } from "@/components/settings/billing/billing_layout";
import {
  SPECIAL_OFFER_PERCENT_OFF,
  is_special_offer_available,
} from "@/lib/special_offer";
import { show_special_offer } from "@/stores/special_offer_store";
import { use_special_offer_status } from "@/stores/special_offer_status";

interface SpecialOfferBillingCardProps {
  plan_code: string | null;
  class_name?: string;
}

export function SpecialOfferBillingCard({
  plan_code,
  class_name = "",
}: SpecialOfferBillingCardProps) {
  const { t } = use_i18n();
  const { status } = use_special_offer_status();

  const is_visible =
    (status?.available ?? false) &&
    is_special_offer_available({ plan_code, is_dismissed: false });

  if (!is_visible) return null;

  return (
    <BillingNotice
      body={t("settings.special_offer_subtitle")}
      class_name={class_name}
      icon={SparklesIcon}
      title={t("settings.special_offer_title")}
      tone="neutral"
    >
      <button
        className="aster_btn aster_btn_primary aster_btn_sm"
        type="button"
        onClick={() => show_special_offer("manual")}
      >
        {t("settings.special_offer_cta", {
          percent: SPECIAL_OFFER_PERCENT_OFF,
        })}
      </button>
    </BillingNotice>
  );
}
