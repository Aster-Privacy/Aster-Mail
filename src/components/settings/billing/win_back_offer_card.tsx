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
import { SparklesIcon } from "@heroicons/react/24/solid";

import { use_i18n } from "@/lib/i18n/context";
import type { PendingOffer } from "@/services/api/billing";

interface WinBackOfferCardProps {
  offer: PendingOffer | null | undefined;
  on_choose_plan?: () => void;
  class_name?: string;
}

export function days_until(expires_at: string, now: number = Date.now()): number | null {
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

  return (
    <div
      className={`rounded-xl border border-accent-blue/30 bg-accent-blue/5 px-4 py-3.5 ${class_name}`}
    >
      <div className="flex items-start gap-3">
        <SparklesIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-blue" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-txt-primary">
            {t("settings.win_back_offer_title", {
              discount: offer.discount_label,
            })}
          </p>
          <p className="mt-0.5 text-xs text-txt-muted">
            {days_left === 0 && t("settings.win_back_offer_expires_today")}
            {days_left === 1 && t("settings.win_back_offer_expires_tomorrow")}
            {days_left > 1 &&
              t("settings.win_back_offer_expires_in", { days: days_left })}
          </p>
          <p className="mt-1.5 text-xs text-txt-muted">
            {t("settings.win_back_offer_auto_applied", { code: offer.code })}
          </p>
          {on_choose_plan && (
            <div className="mt-3">
              <button
                className="aster_btn aster_btn_primary aster_btn_sm"
                type="button"
                onClick={on_choose_plan}
              >
                {t("settings.win_back_offer_action")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
