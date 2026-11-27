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
import { useEffect, useRef, useState } from "react";

import { RATE_LIMIT_RECOVERED_EVENT } from "@/services/api/client/request_governor";

export const LOAD_DEADLINE_MS = 20_000;
export const RECOVERY_RETRY_MIN_GAP_MS = 5000;

export function use_loading_deadline(
  is_loading: boolean,
  deadline_ms: number = LOAD_DEADLINE_MS,
): boolean {
  const [timed_out, set_timed_out] = useState(false);

  useEffect(() => {
    if (!is_loading) {
      set_timed_out(false);

      return;
    }

    const timer = setTimeout(() => set_timed_out(true), deadline_ms);

    return () => clearTimeout(timer);
  }, [is_loading, deadline_ms]);

  return is_loading && timed_out;
}

export function use_retry_on_recovery(
  active: boolean,
  on_retry: (() => void) | undefined,
  min_gap_ms: number = RECOVERY_RETRY_MIN_GAP_MS,
): void {
  const retry_ref = useRef(on_retry);
  const last_retry_ref = useRef(0);

  useEffect(() => {
    retry_ref.current = on_retry;
  }, [on_retry]);

  useEffect(() => {
    if (!active) return;

    const trigger = (): void => {
      if (typeof document !== "undefined" && document.hidden) return;

      const now = Date.now();

      if (now - last_retry_ref.current < min_gap_ms) return;

      last_retry_ref.current = now;
      retry_ref.current?.();
    };

    const on_visibility = (): void => {
      if (!document.hidden) trigger();
    };

    window.addEventListener("focus", trigger);
    window.addEventListener("online", trigger);
    window.addEventListener(RATE_LIMIT_RECOVERED_EVENT, trigger);
    document.addEventListener("visibilitychange", on_visibility);

    return () => {
      window.removeEventListener("focus", trigger);
      window.removeEventListener("online", trigger);
      window.removeEventListener(RATE_LIMIT_RECOVERED_EVENT, trigger);
      document.removeEventListener("visibilitychange", on_visibility);
    };
  }, [active, min_gap_ms]);
}
