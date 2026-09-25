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
import { run_account_data_conversion } from "@/services/account_data_conversion";
import { ignore_error } from "@/lib/ignore_error";

const START_DELAY_MS = 3000;
const IDLE_TIMEOUT_MS = 10000;

export function use_account_data_conversion(): void {
  const { vault, user } = use_auth();
  const account_id = user?.id ?? null;
  const started_for_ref = useRef<string | null>(null);

  useEffect(() => {
    if (!vault || !account_id) return;
    if (started_for_ref.current === account_id) return;

    let idle_handle: number | null = null;

    const start = () => {
      started_for_ref.current = account_id;
      run_account_data_conversion(account_id).catch((caught) =>
        ignore_error("hooks/use_account_data_conversion", caught),
      );
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
      if (idle_handle !== null && typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idle_handle);
      }
    };
  }, [vault, account_id]);
}
