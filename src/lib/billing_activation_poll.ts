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
import {
  activate_subscription,
  get_subscription,
  type SubscriptionResponse,
} from "@/services/api/billing";
import { request_cache } from "@/services/api/request_cache";
import { ignore_error } from "@/lib/ignore_error";

export const SLOW_ACTIVATION_INTERVAL_MS = 60000;
export const SLOW_ACTIVATION_WINDOW_MS = 3600000;

export function is_activated_plan(
  live: string | undefined,
  target: string | null,
): boolean {
  return target ? live === target : Boolean(live) && live !== "free";
}

export async function wait_for_slow_activation(
  target: string | null,
  is_disposed: () => boolean,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<SubscriptionResponse | null> {
  const attempts = Math.floor(
    SLOW_ACTIVATION_WINDOW_MS / SLOW_ACTIVATION_INTERVAL_MS,
  );

  for (let attempt = 0; attempt < attempts; attempt++) {
    await wait(SLOW_ACTIVATION_INTERVAL_MS);
    if (is_disposed()) return null;
    try {
      await activate_subscription();
    } catch (caught) {
      ignore_error("lib/billing_activation_poll:activate", caught);
    }
    if (is_disposed()) return null;
    request_cache.invalidate("/payments/v1");
    try {
      const response = await get_subscription();

      if (response.data && is_activated_plan(response.data.plan.code, target))
        return response.data;
    } catch (caught) {
      ignore_error("lib/billing_activation_poll:subscription", caught);
    }
  }

  return null;
}
