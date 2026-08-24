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
import { useEffect, useState } from "react";
import { ExclamationTriangleIcon, CreditCardIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { get_subscription } from "@/services/api/billing";

function days_until(iso: string | null): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();

  if (Number.isNaN(end)) return null;
  const remaining = Math.ceil((end - Date.now()) / 86_400_000);

  return remaining > 0 ? remaining : null;
}

export function PaymentFailedBanner() {
  const { t } = use_i18n();
  const [failed_at, set_failed_at] = useState<string | null>(null);
  const [grace_days, set_grace_days] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await get_subscription();

        if (cancelled || !response.data) return;
        set_failed_at(response.data.payment_failed_at);
        set_grace_days(days_until(response.data.grace_period_end));
      } catch {
        if (!cancelled) set_failed_at(null);
      }
    };

    load();
    window.addEventListener("aster:plan-changed", load);

    return () => {
      cancelled = true;
      window.removeEventListener("aster:plan-changed", load);
    };
  }, []);

  if (!failed_at) return null;

  const open_billing = () =>
    window.dispatchEvent(
      new CustomEvent("navigate-settings", { detail: "billing" }),
    );

  return (
    <div
      className="mx-3 mt-2 px-4 py-3 rounded-lg flex items-center gap-3"
      style={{ backgroundColor: "#d97706", color: "#fff" }}
    >
      <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-white" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">
          {t("settings.payment_failed")}
        </p>
        {grace_days !== null && (
          <p className="text-xs text-white/80 mt-0.5">
            {t("settings.grace_period_remaining", { days: String(grace_days) })}
          </p>
        )}
      </div>
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-[12px] text-xs font-medium text-amber-700 bg-white hover:bg-white/90 transition-colors flex-shrink-0"
        onClick={open_billing}
      >
        <CreditCardIcon className="w-3.5 h-3.5" />
        {t("settings.update_payment_method")}
      </button>
    </div>
  );
}
