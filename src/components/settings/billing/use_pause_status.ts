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
import type { SubscriptionResponse } from "@/services/api/billing";

import { useCallback, useEffect, useState } from "react";

import {
  get_pause_status,
  type PauseStatusResponse,
} from "@/services/api/billing";

export function scheduled_pause_start(
  pause_status: PauseStatusResponse | null,
): string | null {
  if (pause_status?.status !== "scheduled") return null;

  return pause_status.pause_starts_at ?? null;
}

export function pause_refresh_key(
  subscription: SubscriptionResponse | null,
): string {
  return `${subscription?.plan.code ?? ""}:${subscription?.status ?? ""}:${subscription?.current_period_end ?? ""}:${subscription?.cancel_at_period_end ?? ""}`;
}

export function use_pause_status(refresh_key: string, enabled = true) {
  const [pause_status, set_pause_status] =
    useState<PauseStatusResponse | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      set_pause_status(null);

      return;
    }
    try {
      const response = await get_pause_status();

      set_pause_status(response.data ?? null);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    }
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload, refresh_key]);

  return { pause_status, reload };
}
