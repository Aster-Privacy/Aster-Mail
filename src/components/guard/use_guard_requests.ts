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
import type { GuardDevice } from "@/services/guard/guard_device";
import type { GuardRequestView } from "@/services/guard/guard_approval";

import { useCallback, useEffect, useRef, useState } from "react";

import { load_guard_requests } from "@/services/guard/guard_approval";
import { get_guard_device } from "@/services/guard/guard_device";

export const GUARD_REQUESTS_REFRESH_EVENT = "aster:guard-requests-refresh";

export interface GuardRequests {
  requests: GuardRequestView[];
  device: GuardDevice | null;
  refresh: () => Promise<void>;
  dismiss: (request_id: string) => void;
}

export function use_guard_requests(user_id: string | null): GuardRequests {
  const [requests, set_requests] = useState<GuardRequestView[]>([]);
  const [device, set_device] = useState<GuardDevice | null>(null);
  const generation_ref = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++generation_ref.current;

    if (!user_id) {
      set_device(null);
      set_requests([]);

      return;
    }

    let found: GuardDevice | null = null;

    try {
      found = await get_guard_device(user_id);
    } catch {
      found = null;
    }
    if (generation !== generation_ref.current) return;
    set_device(found);
    if (!found) {
      set_requests([]);

      return;
    }

    const views = await load_guard_requests(found);

    if (generation !== generation_ref.current) return;
    set_requests(views);
  }, [user_id]);

  const dismiss = useCallback((request_id: string) => {
    set_requests((current) =>
      current.filter((view) => view.summary.id !== request_id),
    );
  }, []);

  useEffect(() => {
    void refresh();
    const on_refresh = () => void refresh();

    window.addEventListener(GUARD_REQUESTS_REFRESH_EVENT, on_refresh);

    return () => {
      generation_ref.current++;
      window.removeEventListener(GUARD_REQUESTS_REFRESH_EVENT, on_refresh);
    };
  }, [refresh]);

  return { requests, device, refresh, dismiss };
}
