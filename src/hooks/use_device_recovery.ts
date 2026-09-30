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
import { useEffect, useRef } from "react";

import { use_auth } from "@/contexts/auth_context";
import {
  refresh_device_snapshot,
  run_device_recovery,
  device_recovery_enabled,
} from "@/services/crypto/device_recovery";
import { ignore_error } from "@/lib/ignore_error";

const START_DELAY_MS = 3000;
const IDLE_TIMEOUT_MS = 10000;
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

const in_flight = new Map<string, Promise<unknown>>();

function single_flight(account_id: string, task: () => Promise<unknown>): void {
  if (in_flight.has(account_id)) return;

  const running = task()
    .catch((caught) => ignore_error("hooks/use_device_recovery", caught))
    .finally(() => {
      in_flight.delete(account_id);
    });

  in_flight.set(account_id, running);
}

export function use_device_recovery(): void {
  const { vault, user } = use_auth();
  const account_id = user?.id ?? null;
  const started_for_ref = useRef<string | null>(null);

  useEffect(() => {
    if (!vault || !account_id) return;
    if (started_for_ref.current === account_id) return;

    let idle_handle: number | null = null;
    let interval_id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      started_for_ref.current = account_id;
      single_flight(account_id, () => run_device_recovery(account_id));
      interval_id = setInterval(() => {
        single_flight(account_id, async () => {
          if (await device_recovery_enabled()) {
            await refresh_device_snapshot(account_id);
          }
        });
      }, REFRESH_INTERVAL_MS);
    };

    const timeout_id = setTimeout(() => {
      if (typeof requestIdleCallback === "function") {
        idle_handle = requestIdleCallback(start, { timeout: IDLE_TIMEOUT_MS });

        return;
      }

      start();
    }, START_DELAY_MS);

    return () => {
      clearTimeout(timeout_id);
      if (interval_id !== null) clearInterval(interval_id);
      if (idle_handle !== null && typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idle_handle);
      }
      if (started_for_ref.current === account_id) {
        started_for_ref.current = null;
      }
    };
  }, [vault, account_id]);
}
