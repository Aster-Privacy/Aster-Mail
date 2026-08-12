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
import { useState, useEffect, useCallback } from "react";

import {
  get_plan_limits,
  type PlanLimitsResponse,
} from "@/services/api/billing";
import { api_client } from "@/services/api/client";
import { ignore_error } from "@/lib/ignore_error";

import {
  get_current_account_id,
  repair_stale_plan_flags,
  set_account_plan_flag,
} from "@/services/account_manager";

let cached_limits: PlanLimitsResponse | null = null;
let cached_account_id: string | null = null;
let cache_timestamp = 0;
const CACHE_TTL = 60_000;

export function clear_plan_limits_cache(): void {
  cached_limits = null;
  cached_account_id = null;
  cache_timestamp = 0;
}

export function use_plan_limits() {
  const [limits, set_limits] = useState<PlanLimitsResponse | null>(
    cached_limits,
  );
  const [is_loading, set_is_loading] = useState(!cached_limits);

  const fetch_limits = useCallback(async (force = false) => {
    if (!api_client.is_authenticated()) {
      set_is_loading(false);

      return;
    }

    const now = Date.now();

    await repair_stale_plan_flags().catch((caught) =>
      ignore_error("hooks/use_plan_limits:use_plan_limits", caught),
    );

    const account_id = await get_current_account_id();

    if (
      !force &&
      cached_limits &&
      cached_account_id === account_id &&
      now - cache_timestamp < CACHE_TTL
    ) {
      set_limits(cached_limits);
      set_is_loading(false);

      return;
    }

    if (cached_account_id !== account_id) {
      set_limits(null);
    }

    try {
      const response = await get_plan_limits();

      if (!response.data) return;

      if ((await get_current_account_id()) !== account_id) return;

      cached_limits = response.data;
      cached_account_id = account_id;
      cache_timestamp = Date.now();
      set_limits(response.data);

      if (account_id) {
        set_account_plan_flag(
          account_id,
          response.data.plan_code !== "free",
        ).catch((caught) =>
          ignore_error("hooks/use_plan_limits:use_plan_limits", caught),
        );
      }
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    fetch_limits();
  }, [fetch_limits]);

  const is_feature_locked = useCallback(
    (feature_key: string): boolean => {
      if (!limits) return true;
      const info = limits.limits[feature_key];

      if (!info) return false;

      return info.limit === 0;
    },
    [limits],
  );

  const is_at_limit = useCallback(
    (feature_key: string): boolean => {
      if (!limits) return false;
      const info = limits.limits[feature_key];

      if (!info) return false;

      return info.is_at_limit;
    },
    [limits],
  );

  return {
    limits,
    is_loading,
    is_feature_locked,
    is_at_limit,
    refresh: fetch_limits,
  };
}
