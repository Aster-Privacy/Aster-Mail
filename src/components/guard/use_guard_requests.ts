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

import { server_now } from "@/lib/server_clock";
import { load_guard_request_list } from "@/services/guard/guard_approval";
import { get_guard_device } from "@/services/guard/guard_device";
import { GUARD_REQUESTS_REFRESH_EVENT } from "@/services/guard/guard_events";

export { GUARD_REQUESTS_REFRESH_EVENT };

export const GUARD_REQUESTS_POLL_MS = 25_000;
export const GUARD_REQUESTS_MIN_GAP_MS = 2_000;

export interface GuardRequests {
  requests: GuardRequestView[];
  device: GuardDevice | null;
  refresh: () => Promise<void>;
  dismiss: (request_id: string) => void;
}

function is_live(view: GuardRequestView, now: number): boolean {
  const expires = Date.parse(view.summary.expires_at);

  return Number.isNaN(expires) || expires > now;
}

function page_visible(): boolean {
  return (
    typeof document === "undefined" || document.visibilityState === "visible"
  );
}

export function use_guard_requests(user_id: string | null): GuardRequests {
  const [requests, set_requests] = useState<GuardRequestView[]>([]);
  const [device, set_device] = useState<GuardDevice | null>(null);
  const [active, set_active] = useState(false);
  const generation_ref = useRef(0);
  const dismissed_ref = useRef(new Set<string>());
  const last_refresh_ref = useRef(0);

  const keep = useCallback(
    (views: GuardRequestView[]) => {
      const now = server_now();

      return views.filter(
        (view) =>
          !dismissed_ref.current.has(view.summary.id) && is_live(view, now),
      );
    },
    [],
  );

  const refresh = useCallback(async () => {
    const generation = ++generation_ref.current;

    last_refresh_ref.current = Date.now();
    if (!user_id) {
      set_device(null);
      set_active(false);
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
      set_active(false);
      set_requests([]);

      return;
    }

    let list;

    try {
      list = await load_guard_request_list(found);
    } catch {
      return;
    }
    if (generation !== generation_ref.current) return;
    set_active(list.active);
    if (list.views) set_requests(keep(list.views));
  }, [user_id, keep]);

  const dismiss = useCallback((request_id: string) => {
    dismissed_ref.current.add(request_id);
    set_requests((current) =>
      current.filter((view) => view.summary.id !== request_id),
    );
  }, []);

  useEffect(() => {
    dismissed_ref.current = new Set();
  }, [user_id]);

  useEffect(() => {
    void refresh();
    const on_refresh = () => void refresh();
    const on_wake = () => {
      if (!page_visible()) return;
      if (Date.now() - last_refresh_ref.current < GUARD_REQUESTS_MIN_GAP_MS) {
        return;
      }
      void refresh();
    };

    window.addEventListener(GUARD_REQUESTS_REFRESH_EVENT, on_refresh);
    window.addEventListener("focus", on_wake);
    document.addEventListener("visibilitychange", on_wake);

    return () => {
      generation_ref.current++;
      window.removeEventListener(GUARD_REQUESTS_REFRESH_EVENT, on_refresh);
      window.removeEventListener("focus", on_wake);
      document.removeEventListener("visibilitychange", on_wake);
    };
  }, [refresh]);

  const polling = !!user_id && !!device && active;

  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(() => {
      if (page_visible()) void refresh();
    }, GUARD_REQUESTS_POLL_MS);

    return () => window.clearInterval(timer);
  }, [polling, refresh]);

  useEffect(() => {
    const now = server_now();
    let next = Infinity;

    for (const view of requests) {
      const expires = Date.parse(view.summary.expires_at);

      if (!Number.isNaN(expires) && expires < next) next = expires;
    }
    if (next === Infinity) return;
    const timer = window.setTimeout(
      () =>
        set_requests((current) => {
          const kept = keep(current);

          return kept.length === current.length ? current : kept;
        }),
      Math.max(0, next - now) + 50,
    );

    return () => window.clearTimeout(timer);
  }, [requests, keep]);

  return { requests, device, refresh, dismiss };
}
