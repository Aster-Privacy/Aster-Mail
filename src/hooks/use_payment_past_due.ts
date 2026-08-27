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

import { get_subscription } from "@/services/api/billing";
import { BILLING_UPDATED_EVENT } from "@/lib/payment_action";

export interface PaymentPastDueState {
  is_past_due: boolean;
  plan_name: string | null;
  days_left: number | null;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const INITIAL_STATE: PaymentPastDueState = {
  is_past_due: false,
  plan_name: null,
  days_left: null,
};

export function use_payment_past_due(): PaymentPastDueState {
  const [state, set_state] = useState<PaymentPastDueState>(INITIAL_STATE);

  const check = useCallback(async (): Promise<PaymentPastDueState | null> => {
    const response = await get_subscription();

    if (!response.data) return null;

    const subscription = response.data;
    const grace_end = subscription.grace_period_end
      ? new Date(subscription.grace_period_end).getTime()
      : null;

    const grace_expired = grace_end !== null && grace_end <= Date.now();

    return {
      is_past_due:
        !grace_expired &&
        (subscription.status === "past_due" ||
          (subscription.status === "active" &&
            Boolean(subscription.payment_failed_at))),
      plan_name: subscription.plan.name,
      days_left:
        grace_end === null
          ? null
          : Math.max(0, Math.ceil((grace_end - Date.now()) / DAY_MS)),
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const next = await check();

      if (cancelled || !next) return;
      set_state(next);
    };

    void run();

    const interval = window.setInterval(() => void run(), POLL_INTERVAL_MS);

    window.addEventListener("focus", run);
    window.addEventListener(BILLING_UPDATED_EVENT, run);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", run);
      window.removeEventListener(BILLING_UPDATED_EVENT, run);
    };
  }, [check]);

  return state;
}
