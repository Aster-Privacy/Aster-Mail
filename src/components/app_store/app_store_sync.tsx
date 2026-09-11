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
import { useEffect } from "react";

import { announce_app_store_plan_change } from "@/components/app_store/app_store_plans";
import { use_auth } from "@/contexts/auth_context";
import { use_distribution_channel } from "@/native/distribution_channel";
import { get_subscription } from "@/services/api/billing";
import {
  listen_for_app_store_transactions,
  sync_current_app_store_entitlements,
  sync_pending_app_store_transactions,
  type AppStoreRestoreResult,
} from "@/services/app_store/storekit_client";

export function AppStoreSync() {
  const channel = use_distribution_channel();
  const { is_authenticated } = use_auth();

  useEffect(() => {
    if (channel !== "mas" || !is_authenticated) return;
    let active = true;
    let unlisten: (() => void) | null = null;

    const settle = async (run: () => Promise<AppStoreRestoreResult>) => {
      try {
        const result = await run();

        if (active && result.redeemed > 0) announce_app_store_plan_change();
      } catch {
        return;
      }
    };

    void listen_for_app_store_transactions(() => {
      void settle(sync_pending_app_store_transactions);
    })
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      })
      .catch(() => undefined);

    void (async () => {
      await settle(sync_pending_app_store_transactions);
      const response = await get_subscription().catch(() => null);
      const plan_code = response?.data?.plan.code;

      if (!active || !response?.data || (plan_code && plan_code !== "free")) {
        return;
      }
      await settle(sync_current_app_store_entitlements);
    })();

    return () => {
      active = false;
      unlisten?.();
    };
  }, [channel, is_authenticated]);

  return null;
}
