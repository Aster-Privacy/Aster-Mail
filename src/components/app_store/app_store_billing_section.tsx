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
import { useCallback, useEffect, useState } from "react";
import { CreditCardIcon } from "@heroicons/react/24/outline";

import { AppStorePlans } from "@/components/app_store/app_store_plans";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { use_i18n } from "@/lib/i18n/context";
import {
  get_subscription,
  type SubscriptionResponse,
} from "@/services/api/billing";

const APP_STORE_PROVIDER = "app_store";

export function use_app_store_subscription(enabled = true) {
  const [subscription, set_subscription] =
    useState<SubscriptionResponse | null>(null);
  const [load_failed, set_load_failed] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await get_subscription();

      if (response.data) {
        set_subscription(response.data);
        set_load_failed(false);
      } else {
        set_load_failed(true);
      }
    } catch {
      set_load_failed(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const handle_plan_changed = () => void load();

    window.addEventListener("aster:plan-changed", handle_plan_changed);

    return () => {
      window.removeEventListener("aster:plan-changed", handle_plan_changed);
    };
  }, [enabled, load]);

  const plan_code = subscription?.plan.code ?? null;
  const is_paid = !!plan_code && plan_code !== "free";
  const managed_elsewhere =
    is_paid && subscription?.payment_provider !== APP_STORE_PROVIDER;

  return { subscription, plan_code, managed_elsewhere, load_failed, load };
}

export function AppStoreManagedElsewhereNotice() {
  const { t } = use_i18n();

  return (
    <div className="rounded-xl border border-edge-secondary bg-surf-tertiary p-4">
      <p className="text-sm font-medium text-txt-primary">
        {t("app_store.managed_elsewhere_title")}
      </p>
      <p className="text-sm mt-0.5 text-txt-muted">
        {t("app_store.managed_elsewhere_description")}
      </p>
    </div>
  );
}

export function AppStoreBillingSection() {
  const { t } = use_i18n();
  const { subscription, plan_code, managed_elsewhere, load_failed, load } =
    use_app_store_subscription();

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <CreditCardIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("app_store.section_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-4 text-txt-muted">
          {t("app_store.section_description")}
        </p>
      </div>

      {load_failed ? <LoadFailedNotice on_retry={() => void load()} /> : null}

      <div className="rounded-xl border border-edge-secondary p-4">
        <p className="text-xs text-txt-muted">{t("settings.current_plan")}</p>
        <p className="text-sm font-medium mt-0.5 text-txt-primary">
          {subscription?.plan.name ?? "-"}
        </p>
      </div>

      {managed_elsewhere ? <AppStoreManagedElsewhereNotice /> : null}

      <AppStorePlans
        current_plan_code={plan_code}
        purchases_locked={managed_elsewhere || !subscription}
      />
    </div>
  );
}
