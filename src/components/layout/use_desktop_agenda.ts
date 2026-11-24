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
import type {
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { calendar_sync_engine } from "@/services/calendar/sync_engine";
import { expand_events } from "@/services/calendar/recurrence";

export const AGENDA_SYNC_TIMEOUT_MS = 30_000;
export const AGENDA_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export type AgendaStatus =
  | "loading"
  | "ready"
  | "failed"
  | "unavailable"
  | "empty";

export interface AgendaSnapshot {
  events: DecryptedCalendarEvent[];
  calendars: DecryptedCalendar[];
  calendar_count: number;
}

export interface AgendaState extends AgendaSnapshot {
  up_next_events: DecryptedCalendarEvent[];
  status: AgendaStatus;
  refresh_failed: boolean;
  retry: () => void;
}

interface SyncOutcome {
  ok: boolean;
  failure_status: number | null;
}

const EMPTY_SNAPSHOT: AgendaSnapshot = {
  events: [],
  calendars: [],
  calendar_count: 0,
};

function is_listed(event: DecryptedCalendarEvent): boolean {
  if (event.trashed_at) return false;

  return !(event.event_kind === "task" && event.task_meta?.has_date === false);
}

export function read_agenda_snapshot(
  range_start: Date,
  range_end: Date,
): AgendaSnapshot {
  try {
    const start_ms = range_start.getTime();
    const end_ms = range_end.getTime();
    const events = expand_events(
      calendar_sync_engine.get_events().filter(is_listed),
      range_start,
      range_end,
    ).filter((event) => {
      const event_start = new Date(event.starts_at).getTime();
      const event_end = new Date(event.ends_at).getTime();

      return event_end >= start_ms && event_start <= end_ms;
    });

    return {
      events,
      calendars: calendar_sync_engine.get_calendars(),
      calendar_count: calendar_sync_engine.calendar_count(),
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

export function derive_agenda_status(
  outcome: SyncOutcome | null,
  calendar_count: number,
): { status: AgendaStatus; refresh_failed: boolean } {
  if (!outcome) {
    return {
      status: calendar_count > 0 ? "ready" : "loading",
      refresh_failed: false,
    };
  }

  if (outcome.ok) {
    return {
      status: calendar_count > 0 ? "ready" : "empty",
      refresh_failed: false,
    };
  }

  if (calendar_count > 0) return { status: "ready", refresh_failed: true };

  return {
    status: outcome.failure_status === 404 ? "unavailable" : "failed",
    refresh_failed: false,
  };
}

function with_timeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), AGENDA_SYNC_TIMEOUT_MS);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

interface AgendaOptions {
  enabled: boolean;
  account_id: string | null;
  range_start: Date;
  range_end: Date;
  up_next_start: Date;
  up_next_end: Date;
}

export function use_desktop_agenda({
  enabled,
  account_id,
  range_start,
  range_end,
  up_next_start,
  up_next_end,
}: AgendaOptions): AgendaState {
  const [outcome, set_outcome] = useState<SyncOutcome | null>(null);
  const [loaded_for, set_loaded_for] = useState<string | null>(null);
  const [version, set_version] = useState(0);
  const generation_ref = useRef(0);
  const in_flight_ref = useRef(false);

  const sync = useCallback(async () => {
    if (!enabled || !account_id) return;
    if (in_flight_ref.current) return;

    const generation = generation_ref.current;

    in_flight_ref.current = true;

    try {
      const loaded = await with_timeout(
        calendar_sync_engine.ensure_loaded().then(() => true),
        false,
      );

      if (generation !== generation_ref.current) return;
      if (loaded) {
        set_loaded_for(account_id);
        set_version((value) => value + 1);
      }

      const ok =
        loaded &&
        (await with_timeout(calendar_sync_engine.pull_delta(), false));

      if (generation !== generation_ref.current) return;

      set_outcome({
        ok,
        failure_status:
          ok || !loaded ? null : calendar_sync_engine.last_failure_status(),
      });
      set_version((value) => value + 1);
    } finally {
      if (generation === generation_ref.current) in_flight_ref.current = false;
    }
  }, [enabled, account_id]);

  useEffect(() => {
    generation_ref.current += 1;
    in_flight_ref.current = false;
    set_outcome(null);
    set_loaded_for(null);
  }, [account_id]);

  useEffect(() => {
    if (!enabled || !account_id) return;

    void sync();

    const interval = window.setInterval(() => {
      void sync();
    }, AGENDA_REFRESH_INTERVAL_MS);
    const handle_visibility = () => {
      if (document.visibilityState === "visible") void sync();
    };
    const handle_online = () => {
      void sync();
    };
    const unsubscribe = calendar_sync_engine.subscribe(() => {
      set_version((value) => value + 1);
    });

    document.addEventListener("visibilitychange", handle_visibility);
    window.addEventListener("online", handle_online);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handle_visibility);
      window.removeEventListener("online", handle_online);
      unsubscribe();
    };
  }, [enabled, account_id, sync]);

  const range_start_ms = range_start.getTime();
  const range_end_ms = range_end.getTime();
  const up_next_start_ms = up_next_start.getTime();
  const up_next_end_ms = up_next_end.getTime();
  const is_current = loaded_for !== null && loaded_for === account_id;

  const snapshot = useMemo(
    () =>
      is_current && version >= 0
        ? read_agenda_snapshot(new Date(range_start_ms), new Date(range_end_ms))
        : EMPTY_SNAPSHOT,
    [is_current, range_start_ms, range_end_ms, version],
  );

  const up_next_events = useMemo(
    () =>
      is_current && version >= 0
        ? read_agenda_snapshot(
            new Date(up_next_start_ms),
            new Date(up_next_end_ms),
          ).events
        : EMPTY_SNAPSHOT.events,
    [is_current, up_next_start_ms, up_next_end_ms, version],
  );

  const retry = useCallback(() => {
    set_outcome(null);
    void sync();
  }, [sync]);

  const derived = derive_agenda_status(outcome, snapshot.calendar_count);

  return { ...snapshot, up_next_events, ...derived, retry };
}
