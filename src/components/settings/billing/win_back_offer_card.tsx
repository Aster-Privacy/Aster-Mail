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
import type { PendingOffer } from "@/services/api/billing";

import { TagIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { BillingNotice } from "@/components/settings/billing/billing_layout";

interface WinBackOfferCardProps {
  offer: PendingOffer | null | undefined;
  on_choose_plan?: () => void;
  class_name?: string;
}

export function days_until(
  expires_at: string,
  now: number = Date.now(),
): number | null {
  const expiry = Date.parse(expires_at);

  if (Number.isNaN(expiry)) return null;

  return Math.max(0, Math.ceil((expiry - now) / 86_400_000));
}

export function WinBackOfferCard({
  offer,
  on_choose_plan,
  class_name = "",
}: WinBackOfferCardProps) {
  const { t } = use_i18n();

  if (!offer) return null;

  const days_left = days_until(offer.expires_at);

  if (days_left === null) return null;

  const expiry_text =
    days_left === 0
      ? t("settings.win_back_offer_expires_today")
      : days_left === 1
        ? t("settings.win_back_offer_expires_tomorrow")
        : t("settings.win_back_offer_expires_in", { days: days_left });

  return (
    <BillingNotice
      body={
        <>
          {t("settings.win_back_offer_auto_applied", { code: offer.code })}
          <span aria-hidden="true" className="mx-1.5">
            ·
          </span>
          {expiry_text}
        </>
      }
      class_name={class_name}
      icon={TagIcon}
      title={t("settings.win_back_offer_title", {
        discount: offer.discount_label,
      })}
      tone="neutral"
    >
      {on_choose_plan && (
        <button
          className="aster_btn aster_btn_primary aster_btn_sm"
          type="button"
          onClick={on_choose_plan}
        >
          {t("settings.win_back_offer_action")}
        </button>
      )}
    </BillingNotice>
  );
}
