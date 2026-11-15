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
import type { GuardStatus } from "@/services/api/guard";

import { useCallback, useEffect, useRef, useState } from "react";

import { GUARD_HELD_EVENT } from "@/services/api/client/helpers";
import { get_guard_status } from "@/services/api/guard";
import { on_guard_event } from "@/services/guard/guard_events";

export const GUARD_STATUS_REFRESH_EVENT = "aster:guard-status-refresh";

export interface GuardStatusState {
  status: GuardStatus | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function request_guard_status_refresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(GUARD_STATUS_REFRESH_EVENT));
}

export function use_guard_status(enabled = true): GuardStatusState {
  const [status, set_status] = useState<GuardStatus | null>(null);
  const [loading, set_loading] = useState(enabled);
  const generation_ref = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++generation_ref.current;

    if (!enabled) {
      set_status(null);
      set_loading(false);

      return;
    }

    const response = await get_guard_status();

    if (generation !== generation_ref.current) return;
    set_status(!response.error && response.data ? response.data : null);
    set_loading(false);
  }, [enabled]);

  useEffect(() => {
    void refresh();
    const on_refresh = () => void refresh();
    const stop_events = on_guard_event(() => void refresh());

    window.addEventListener(GUARD_STATUS_REFRESH_EVENT, on_refresh);
    window.addEventListener(GUARD_HELD_EVENT, on_refresh);

    return () => {
      generation_ref.current++;
      stop_events();
      window.removeEventListener(GUARD_STATUS_REFRESH_EVENT, on_refresh);
      window.removeEventListener(GUARD_HELD_EVENT, on_refresh);
    };
  }, [refresh]);

  return { status, loading, refresh };
}
