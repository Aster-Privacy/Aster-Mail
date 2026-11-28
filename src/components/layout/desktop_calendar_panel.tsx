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
  CalendarEventDraft,
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button, Skeleton, Tooltip } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import { use_panel_inset } from "@/hooks/use_panel_inset";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { use_preferences } from "@/contexts/preferences_context";
import { has_vault_in_memory_for } from "@/services/crypto/memory_key_store";
import {
  get_app_lock_config,
  is_session_unlocked,
} from "@/services/app_lock_store";
import { open_external } from "@/utils/open_link";
import { use_panel_transition } from "@/components/layout/use_panel_transition";
import { open_calendar_externally } from "@/components/layout/open_calendar_externally";
import { create_event } from "@/services/api/calendar";
import {
  add_days,
  add_months,
  bucket_events_by_day,
  build_event_link,
  build_month_grid,
  day_key,
  end_of_day,
  is_same_day,
  plain_text,
  resolve_event_color,
  start_of_day,
  week_start_day_index,
} from "@/components/layout/desktop_calendar_days";
import { use_desktop_agenda } from "@/components/layout/use_desktop_agenda";
import {
  DEFAULT_DRAFT_MINUTES,
  MINUTES_PER_DAY,
  date_at_minute,
  initial_scroll_minute,
  layout_day,
  next_draft_start,
} from "@/components/layout/desktop_calendar_timeline_layout";
import {
  AllDayStrip,
  DayTimeline,
  QuickCreate,
  type DraftRange,
} from "@/components/layout/desktop_calendar_day_view";

const NOW_TICK_MS = 30_000;
const KEY_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

export type DesktopCalendarGate =
  "loading" | "signed_out" | "locked" | "keys" | "ready";

export function resolve_desktop_calendar_gate(input: {
  is_loading: boolean;
  is_authenticated: boolean;
  account_id: string | null;
  user_id: string | null;
  has_keys: boolean;
  is_locked: boolean;
  has_vault: boolean;
}): DesktopCalendarGate {
  if (input.is_loading) return "loading";
  if (!input.is_authenticated || !input.account_id || !input.user_id) {
    return "signed_out";
  }
  if (input.is_locked) return "locked";
  if (!input.has_keys || !input.has_vault) return "keys";

  return "ready";
}

function is_account_locked(account_id: string | null): boolean {
  if (!account_id) return false;

  try {
    const config = get_app_lock_config(account_id);

    return !!config?.enabled && !is_session_unlocked(account_id);
  } catch {
    return false;
  }
}

function use_now(is_active: boolean): Date {
  const [now, set_now] = useState(() => new Date());

  useEffect(() => {
    if (!is_active) return;

    set_now(new Date());
    const timer = window.setInterval(() => set_now(new Date()), NOW_TICK_MS);

    return () => window.clearInterval(timer);
  }, [is_active]);

  return now;
}

interface PanelHeaderProps {
  on_close: () => void;
  on_new_event: (() => void) | null;
}

function PanelHeader({ on_close, on_new_event }: PanelHeaderProps) {
  const { t } = use_i18n();

  return (
    <div className="flex h-12 flex-shrink-0 items-center gap-1 ps-4 pe-2">
      <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium text-txt-primary">
        {t("common.app_name_calendar")}
      </h2>
      {on_new_event && (
        <Tooltip position="bottom" tip={t("calendar.new_event")}>
          <Button
            aria-label={t("calendar.new_event")}
            className="h-8 w-8 flex-shrink-0 text-txt-secondary"
            data-testid="desktop_calendar_new_event"
            size="icon"
            variant="ghost"
            onClick={on_new_event}
          >
            <PlusIcon className="h-4 w-4" />
          </Button>
        </Tooltip>
      )}
      <Tooltip position="bottom" tip={t("calendar.panel_open_calendar")}>
        <Button
          aria-label={t("calendar.panel_open_calendar")}
          className="h-8 w-8 flex-shrink-0 text-txt-secondary"
          size="icon"
          variant="ghost"
          onClick={open_calendar_externally}
        >
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
        </Button>
      </Tooltip>
      <Tooltip position="bottom" tip={t("common.close")}>
        <Button
          aria-label={t("common.close")}
          className="h-8 w-8 flex-shrink-0 text-txt-secondary"
          size="icon"
          variant="ghost"
          onClick={on_close}
        >
          <XMarkIcon className="h-4 w-4" />
        </Button>
      </Tooltip>
    </div>
  );
}

function AgendaSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-1 flex-col overflow-hidden"
      data-testid="desktop_calendar_skeleton"
    >
      <div className="px-4 pt-2">
        <Skeleton className="h-5 w-32 rounded-md" />
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }, (_, index) => (
            <Skeleton key={index} className="h-6 rounded-md" />
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2.5 px-4">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
      </div>
    </div>
  );
}

interface NoticeProps {
  body: string;
  role: "status" | "alert";
  on_retry?: () => void;
  show_open?: boolean;
}

function Notice({ body, role, on_retry, show_open = true }: NoticeProps) {
  const { t } = use_i18n();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-12 text-center">
      <p className="text-[13px] text-txt-secondary" role={role}>
        {body}
      </p>
      <div className="flex w-full max-w-[240px] flex-col gap-2">
        {on_retry && (
          <Button size="md" variant="outline" onClick={on_retry}>
            {t("calendar.panel_try_again")}
          </Button>
        )}
        {show_open && (
          <Button
            size="md"
            variant={on_retry ? "ghost" : "outline"}
            onClick={open_calendar_externally}
          >
            {t("calendar.panel_open_calendar")}
          </Button>
        )}
      </div>
    </div>
  );
}

function use_formatters(language: string, time_format: "12h" | "24h") {
  return useMemo(() => {
    const locale = language || undefined;
    const safe = (options: Intl.DateTimeFormatOptions) => {
      try {
        return new Intl.DateTimeFormat(locale, options);
      } catch {
        return new Intl.DateTimeFormat(undefined, options);
      }
    };

    return {
      time: safe({
        hour: "numeric",
        minute: "2-digit",
        hour12: time_format === "12h",
      }),
      hour:
        time_format === "12h"
          ? safe({ hour: "numeric", hour12: true })
          : safe({ hour: "2-digit", minute: "2-digit", hour12: false }),
      nav_day: safe({ weekday: "long", month: "short", day: "numeric" }),
      month: safe({ month: "long", year: "numeric" }),
      weekday_short: safe({ weekday: "narrow" }),
      short_date: safe({ month: "short", day: "numeric" }),
      full_day: safe({
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    };
  }, [language, time_format]);
}

type Formatters = ReturnType<typeof use_formatters>;

function event_time_label(
  event: DecryptedCalendarEvent,
  formatters: Formatters,
  all_day_label: string,
): string {
  if (event.is_all_day) return all_day_label;

  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);

  if (Number.isNaN(start.getTime())) return "";
  if (Number.isNaN(end.getTime()) || end <= start) {
    return formatters.time.format(start);
  }

  return `${formatters.time.format(start)} - ${formatters.time.format(end)}`;
}

interface MiniMonthProps {
  anchor: Date;
  selected: Date;
  today: Date;
  week_start: number;
  event_days: ReadonlySet<string>;
  formatters: Formatters;
  on_select: (day: Date) => void;
  on_anchor_change: (anchor: Date) => void;
}

function MiniMonth({
  anchor,
  selected,
  today,
  week_start,
  event_days,
  formatters,
  on_select,
  on_anchor_change,
}: MiniMonthProps) {
  const { t } = use_i18n();
  const grid_ref = useRef<HTMLDivElement | null>(null);
  const focus_pending_ref = useRef(false);
  const days = useMemo(
    () => build_month_grid(anchor, week_start),
    [anchor, week_start],
  );
  const rows = useMemo(
    () =>
      Array.from({ length: 6 }, (_, row) => days.slice(row * 7, row * 7 + 7)),
    [days],
  );

  useEffect(() => {
    if (!focus_pending_ref.current) return;
    focus_pending_ref.current = false;
    grid_ref.current
      ?.querySelector<HTMLButtonElement>('button[tabindex="0"]')
      ?.focus();
  }, [selected]);

  const handle_key = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEPS[event.key];

    if (step === undefined) return;
    event.preventDefault();

    const is_rtl =
      grid_ref.current?.closest("[dir]")?.getAttribute("dir") === "rtl";
    const signed = is_rtl && Math.abs(step) === 1 ? -step : step;
    const next = add_days(selected, signed);

    focus_pending_ref.current = true;
    on_select(next);
  };

  return (
    <div className="px-3 pt-1">
      <div className="flex items-center gap-1">
        <button
          className="min-w-0 flex-1 truncate rounded-md px-1 py-1 text-start text-[14px] font-medium text-txt-primary hover:bg-surf-hover"
          type="button"
          onClick={() => on_select(today)}
        >
          {formatters.month.format(anchor)}
        </button>
        <Button
          aria-label={t("calendar.panel_previous_month")}
          className="h-7 w-7 text-txt-secondary"
          size="icon"
          variant="ghost"
          onClick={() => on_anchor_change(add_months(anchor, -1))}
        >
          <ChevronLeftIcon className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <Button
          aria-label={t("calendar.panel_next_month")}
          className="h-7 w-7 text-txt-secondary"
          size="icon"
          variant="ghost"
          onClick={() => on_anchor_change(add_months(anchor, 1))}
        >
          <ChevronRightIcon className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>
      <div
        ref={grid_ref}
        aria-label={formatters.month.format(anchor)}
        className="mt-1"
        role="grid"
        onKeyDown={handle_key}
      >
        <div className="grid grid-cols-7" role="row">
          {rows[0].map((day) => (
            <span
              key={`head-${day.getDay()}`}
              className="py-1 text-center text-[11px] text-txt-tertiary"
              role="columnheader"
            >
              {formatters.weekday_short.format(day)}
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div key={day_key(row[0])} className="grid grid-cols-7" role="row">
            {row.map((day) => {
              const is_selected = is_same_day(day, selected);
              const is_today = is_same_day(day, today);
              const in_month = day.getMonth() === anchor.getMonth();

              return (
                <span
                  key={day_key(day)}
                  aria-selected={is_selected}
                  className="flex"
                  role="gridcell"
                >
                  <button
                    aria-current={is_today ? "date" : undefined}
                    aria-label={formatters.full_day.format(day)}
                    className="group/day relative flex h-7 w-full items-center justify-center focus:outline-none focus-visible:[&>span]:shadow-[0_0_0_2px_var(--accent-color)]"
                    data-mini-day={day_key(day)}
                    tabIndex={is_selected ? 0 : -1}
                    type="button"
                    onClick={() => on_select(day)}
                  >
                    <span
                      className={`relative flex h-7 w-7 items-center justify-center rounded-[8px] text-[12px] leading-none tabular-nums transition-colors duration-150 ease-out motion-reduce:transition-none ${
                        is_today
                          ? "bg-[var(--accent-color)] font-semibold text-[var(--accent-color-foreground,#ffffff)]"
                          : is_selected
                            ? "bg-[var(--aster-selected)] font-medium text-txt-primary"
                            : in_month
                              ? "text-txt-primary group-hover/day:bg-[var(--aster-hover)]"
                              : "text-txt-muted group-hover/day:bg-[var(--aster-hover)]"
                      }`}
                    >
                      {day.getDate()}
                      {event_days.has(day_key(day)) && (
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none absolute bottom-[3px] start-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full rtl:translate-x-1/2 ${
                            is_today
                              ? "bg-[var(--accent-color-foreground,#ffffff)]"
                              : "bg-[var(--accent-color)]"
                          } ${in_month ? "" : "opacity-50"}`}
                          data-testid="mini_day_dot"
                        />
                      )}
                    </span>
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

interface EventViewProps {
  event: DecryptedCalendarEvent;
  calendar: DecryptedCalendar | undefined;
  color: string;
  formatters: Formatters;
  on_back: () => void;
}

function EventView({
  event,
  calendar,
  color,
  formatters,
  on_back,
}: EventViewProps) {
  const { t } = use_i18n();
  const back_ref = useRef<HTMLButtonElement | null>(null);
  const start = new Date(event.starts_at);
  const description = useMemo(
    () => plain_text(event.description ?? ""),
    [event.description],
  );
  const location = (event.location ?? "").trim();

  useEffect(() => {
    back_ref.current?.focus();
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-3 pb-4">
      <div>
        <Button
          ref={back_ref}
          aria-label={t("common.back")}
          className="h-8 w-8 text-txt-secondary"
          size="icon"
          variant="ghost"
          onClick={on_back}
        >
          <ArrowLeftIcon className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>
      <div className="mt-2 flex items-start gap-2 px-1">
        <span
          aria-hidden="true"
          className="mt-1.5 h-3 w-3 flex-shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <h3 className="min-w-0 break-words text-[16px] font-medium text-txt-primary">
          {event.title.trim() || t("calendar.untitled_event")}
        </h3>
      </div>
      <p className="mt-2 px-1 text-[13px] text-txt-secondary">
        {Number.isNaN(start.getTime()) ? "" : formatters.full_day.format(start)}
      </p>
      <p className="px-1 text-[13px] text-txt-secondary">
        {event_time_label(event, formatters, t("calendar.all_day"))}
      </p>
      {location && (
        <p className="mt-2 flex items-start gap-1.5 px-1 text-[13px] text-txt-primary">
          <MapPinIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-txt-tertiary" />
          <span className="min-w-0 break-words">{location}</span>
        </p>
      )}
      {calendar && (
        <p className="mt-2 px-1 text-[12px] text-txt-tertiary">
          {calendar.name}
        </p>
      )}
      {description && (
        <p className="mt-3 whitespace-pre-wrap break-words px-1 text-[13px] text-txt-primary">
          {description}
        </p>
      )}
      <div className="mt-4 px-1">
        <Button
          size="md"
          variant="outline"
          onClick={() => open_external(build_event_link(event))}
        >
          {t("calendar.panel_open_event")}
        </Button>
      </div>
    </div>
  );
}

const MONTH_OPEN_STORAGE_KEY = "aster_calendar_panel_month_open";

function read_month_open(): boolean {
  try {
    return window.localStorage.getItem(MONTH_OPEN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function write_month_open(value: boolean) {
  try {
    window.localStorage.setItem(MONTH_OPEN_STORAGE_KEY, value ? "1" : "0");
  } catch {
    return;
  }
}

function build_draft(
  calendar_id: string,
  title: string,
  day: Date,
  range: DraftRange,
): CalendarEventDraft {
  return {
    calendar_id,
    title,
    description: "",
    location: "",
    starts_at: date_at_minute(day, range.start_minute).toISOString(),
    ends_at: date_at_minute(day, range.end_minute).toISOString(),
    is_all_day: false,
    status: "confirmed",
    attendees: [],
    tags: [],
    reminder_minutes: null,
    color: null,
    availability: "busy",
    visibility: "default",
    event_kind: "default",
    is_completed: false,
    working_location: null,
    conference_url: "",
    guests_can_modify: false,
    guests_can_invite: false,
    guests_can_see_guests: true,
    recurrence: null,
    recurrence_exceptions: [],
  };
}

interface DayNavigatorProps {
  selected: Date;
  is_today: boolean;
  is_month_open: boolean;
  formatters: Formatters;
  on_toggle_month: () => void;
  on_today: () => void;
  on_step: (delta: number) => void;
}

function DayNavigator({
  selected,
  is_today,
  is_month_open,
  formatters,
  on_toggle_month,
  on_today,
  on_step,
}: DayNavigatorProps) {
  const { t } = use_i18n();

  return (
    <div className="flex h-10 flex-shrink-0 items-center gap-1 ps-2 pe-2">
      <button
        aria-controls="calendar_panel_month"
        aria-expanded={is_month_open}
        aria-label={`${formatters.full_day.format(selected)}, ${t(
          is_month_open
            ? "calendar.panel_hide_month"
            : "calendar.panel_show_month",
        )}`}
        className="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-[var(--aster-radius-control,8px)] px-2 text-start text-[14px] font-medium text-txt-primary transition-colors duration-150 ease-out hover:bg-[var(--aster-hover)] focus:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-color)]"
        data-testid="desktop_calendar_day_button"
        type="button"
        onClick={on_toggle_month}
      >
        <span className="truncate">{formatters.nav_day.format(selected)}</span>
        <ChevronDownIcon
          aria-hidden="true"
          className={`h-3.5 w-3.5 flex-shrink-0 text-txt-secondary transition-transform duration-200 ease-out motion-reduce:transition-none ${
            is_month_open ? "rotate-180" : ""
          }`}
        />
      </button>
      <Button
        className="h-8 flex-shrink-0 px-3"
        disabled={is_today}
        size="sm"
        variant="outline"
        onClick={on_today}
      >
        {t("calendar.today")}
      </Button>
      <Tooltip position="bottom" tip={t("calendar.panel_previous_day")}>
        <Button
          aria-label={t("calendar.panel_previous_day")}
          className="h-8 w-8 flex-shrink-0 text-txt-secondary"
          size="icon"
          variant="ghost"
          onClick={() => on_step(-1)}
        >
          <ChevronLeftIcon className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </Tooltip>
      <Tooltip position="bottom" tip={t("calendar.panel_next_day")}>
        <Button
          aria-label={t("calendar.panel_next_day")}
          className="h-8 w-8 flex-shrink-0 text-txt-secondary"
          size="icon"
          variant="ghost"
          onClick={() => on_step(1)}
        >
          <ChevronRightIcon className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </Tooltip>
    </div>
  );
}

interface AgendaBodyProps {
  account_id: string;
  is_open: boolean;
  create_request: number;
  selected_event: DecryptedCalendarEvent | null;
  on_select_event: (event: DecryptedCalendarEvent | null) => void;
  on_ready_change: (is_ready: boolean) => void;
}

function AgendaBody({
  account_id,
  is_open,
  create_request,
  selected_event,
  on_select_event,
  on_ready_change,
}: AgendaBodyProps) {
  const { t, language } = use_i18n();
  const { preferences } = use_preferences();
  const now = use_now(is_open);
  const today = useMemo(() => start_of_day(now), [now]);
  const [selected, set_selected] = useState(() => start_of_day(new Date()));
  const [anchor, set_anchor] = useState(() => start_of_day(new Date()));
  const [is_month_open, set_is_month_open] = useState(read_month_open);
  const [draft, set_draft] = useState<DraftRange | null>(null);
  const [is_composing, set_is_composing] = useState(false);
  const handled_request_ref = useRef(create_request);
  const return_focus_ref = useRef<string | null>(null);
  const week_start = week_start_day_index(preferences.calendar_week_starts_on);
  const formatters = use_formatters(language, preferences.time_format);
  const is_today = is_same_day(selected, today);

  const grid = useMemo(
    () => build_month_grid(anchor, week_start),
    [anchor, week_start],
  );
  const range_start = useMemo(
    () => start_of_day(grid[0] < selected ? grid[0] : selected),
    [grid, selected],
  );
  const range_end = useMemo(() => {
    const last_grid = grid[grid.length - 1];

    return end_of_day(selected > last_grid ? selected : last_grid);
  }, [grid, selected]);

  const agenda = use_desktop_agenda({
    enabled: true,
    account_id,
    range_start,
    range_end,
    up_next_start: range_start,
    up_next_end: range_end,
  });

  const calendars_by_id = useMemo(
    () => new Map(agenda.calendars.map((calendar) => [calendar.id, calendar])),
    [agenda.calendars],
  );
  const visible_calendars = useMemo(
    () => agenda.calendars.filter((calendar) => calendar.is_visible),
    [agenda.calendars],
  );
  const default_calendar_id =
    visible_calendars.find((calendar) => calendar.is_default)?.id ??
    agenda.calendars.find((calendar) => calendar.is_default)?.id ??
    visible_calendars[0]?.id ??
    agenda.calendars[0]?.id ??
    "";
  const visible_events = useMemo(() => {
    const hidden = new Set(
      agenda.calendars.filter((c) => !c.is_visible).map((c) => c.id),
    );

    return agenda.events.filter((event) => !hidden.has(event.calendar_id));
  }, [agenda.events, agenda.calendars]);
  const selected_events = useMemo(
    () =>
      bucket_events_by_day(visible_events, [selected]).get(day_key(selected)) ??
      [],
    [visible_events, selected],
  );
  const layout = useMemo(
    () => layout_day(selected_events, selected),
    [selected_events, selected],
  );
  const selected_time = selected.getTime();
  const has_timed_events = layout.timed.length > 0;
  const scroll_minute = useMemo(
    () => initial_scroll_minute(layout, is_today, now, selected),
    [selected_time, has_timed_events, is_today],
  );
  const event_days = useMemo(() => {
    const buckets = bucket_events_by_day(visible_events, grid);

    return new Set(
      Array.from(buckets.entries())
        .filter(([, list]) => list.length > 0)
        .map(([key]) => key),
    );
  }, [visible_events, grid]);
  const color_of = useCallback(
    (event: DecryptedCalendarEvent) =>
      resolve_event_color(event, calendars_by_id),
    [calendars_by_id],
  );
  const select_day = useCallback((day: Date) => {
    const next = start_of_day(day);

    set_selected(next);
    set_draft(null);
    set_is_composing(false);
    set_anchor((current) =>
      current.getFullYear() === next.getFullYear() &&
      current.getMonth() === next.getMonth()
        ? current
        : next,
    );
  }, []);
  const toggle_month = useCallback(() => {
    set_is_month_open((value) => {
      write_month_open(!value);

      return !value;
    });
  }, []);
  const open_event = useCallback(
    (event: DecryptedCalendarEvent) => {
      return_focus_ref.current = event.id;
      set_draft(null);
      set_is_composing(false);
      on_select_event(event);
    },
    [on_select_event],
  );
  const start_draft = useCallback((range: DraftRange) => {
    set_draft(range);
    set_is_composing(true);
  }, []);
  const preview_draft = useCallback((range: DraftRange | null) => {
    set_draft(range);
    set_is_composing(false);
  }, []);
  const cancel_draft = useCallback(() => {
    set_draft(null);
    set_is_composing(false);
  }, []);
  const save_draft = useCallback(
    async (input: {
      title: string;
      calendar_id: string;
      range: DraftRange;
    }) => {
      try {
        const result = await create_event(
          build_draft(
            input.calendar_id,
            input.title || t("calendar.untitled_event"),
            selected,
            input.range,
          ),
        );

        if (!result.data) return false;
        set_draft(null);
        set_is_composing(false);
        agenda.retry();

        return true;
      } catch {
        return false;
      }
    },
    [selected, agenda.retry, t],
  );

  const is_ready = agenda.status === "ready";

  useEffect(() => {
    on_ready_change(is_ready);
  }, [is_ready, on_ready_change]);

  useEffect(() => () => on_ready_change(false), [on_ready_change]);

  useEffect(() => {
    if (create_request === handled_request_ref.current) return;
    handled_request_ref.current = create_request;
    if (!is_ready || !default_calendar_id) return;

    const start = next_draft_start(now, selected, is_today);

    on_select_event(null);
    start_draft({
      start_minute: start,
      end_minute: Math.min(MINUTES_PER_DAY, start + DEFAULT_DRAFT_MINUTES),
    });
  }, [create_request]);

  useEffect(() => {
    if (!selected_event) return;
    if (agenda.status !== "ready") on_select_event(null);
  }, [agenda.status, selected_event, on_select_event]);

  useEffect(() => {
    if (selected_event || !return_focus_ref.current) return;

    const id = return_focus_ref.current;

    return_focus_ref.current = null;
    document
      .querySelector<HTMLButtonElement>(
        `[data-testid="desktop_calendar_panel"] [data-event-id="${CSS.escape(id)}"]`,
      )
      ?.focus();
  }, [selected_event]);

  if (agenda.status === "loading") return <AgendaSkeleton />;
  if (agenda.status === "failed") {
    return (
      <Notice
        body={t("calendar.panel_load_failed")}
        role="alert"
        on_retry={agenda.retry}
      />
    );
  }
  if (agenda.status === "unavailable") {
    return <Notice body={t("calendar.panel_unavailable")} role="status" />;
  }
  if (agenda.status === "empty") {
    return <Notice body={t("calendar.panel_no_calendars")} role="status" />;
  }

  if (selected_event) {
    return (
      <EventView
        calendar={calendars_by_id.get(selected_event.calendar_id)}
        color={color_of(selected_event)}
        event={selected_event}
        formatters={formatters}
        on_back={() => on_select_event(null)}
      />
    );
  }

  const is_empty_day = selected_events.length === 0;

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      data-testid="desktop_calendar_agenda"
    >
      {agenda.refresh_failed && (
        <div
          className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-surf-secondary px-3 py-2"
          role="status"
        >
          <p className="min-w-0 flex-1 text-[12px] text-txt-secondary">
            {t("calendar.panel_refresh_failed")}
          </p>
          <Button size="sm" variant="ghost" onClick={agenda.retry}>
            {t("calendar.panel_try_again")}
          </Button>
        </div>
      )}
      <DayNavigator
        formatters={formatters}
        is_month_open={is_month_open}
        is_today={is_today}
        selected={selected}
        on_step={(delta) => select_day(add_days(selected, delta))}
        on_today={() => select_day(today)}
        on_toggle_month={toggle_month}
      />
      {is_month_open && (
        <div
          className="calendar_panel_month flex-shrink-0 pb-2"
          id="calendar_panel_month"
        >
          <MiniMonth
            anchor={anchor}
            event_days={event_days}
            formatters={formatters}
            selected={selected}
            today={today}
            week_start={week_start}
            on_anchor_change={set_anchor}
            on_select={select_day}
          />
        </div>
      )}
      <div className="h-px flex-shrink-0 bg-[var(--border-secondary)]" />
      <AllDayStrip
        key={day_key(selected)}
        color_of={color_of}
        events={layout.all_day}
        on_open={open_event}
      />
      {is_empty_day && (
        <p
          className="flex-shrink-0 border-b border-edge-secondary px-4 py-2 text-[12px] text-txt-muted"
          data-testid="desktop_calendar_empty_day"
        >
          {t("calendar.panel_empty_day")}
        </p>
      )}
      <DayTimeline
        color_of={color_of}
        day={selected}
        draft={draft}
        formatters={formatters}
        is_today={is_today}
        layout={layout}
        now={now}
        scroll_minute={scroll_minute}
        on_draft={start_draft}
        on_draft_preview={preview_draft}
        on_open={open_event}
      />
      {is_composing && draft && default_calendar_id && (
        <QuickCreate
          key={`${draft.start_minute}-${draft.end_minute}`}
          calendars={
            visible_calendars.length > 0 ? visible_calendars : agenda.calendars
          }
          date_label={formatters.nav_day.format(selected)}
          day={selected}
          default_calendar_id={default_calendar_id}
          formatters={formatters}
          range={draft}
          on_cancel={cancel_draft}
          on_save={save_draft}
        />
      )}
    </div>
  );
}

interface DesktopCalendarPanelProps {
  is_open: boolean;
  is_swapping: boolean;
  on_close: () => void;
}

export function DesktopCalendarPanel({
  is_open,
  is_swapping,
  on_close,
}: DesktopCalendarPanelProps) {
  const { t } = use_i18n();
  const auth = use_auth();
  const panel_ref = useRef<HTMLElement | null>(null);
  const [has_opened, set_has_opened] = useState(is_open);
  const [selected_event, set_selected_event] =
    useState<DecryptedCalendarEvent | null>(null);
  const [gate_tick, set_gate_tick] = useState(0);
  const [create_request, set_create_request] = useState(0);
  const [is_body_ready, set_is_body_ready] = useState(false);
  const { is_visible, is_closing } = use_panel_transition(is_open, is_swapping);
  const account_id = auth.current_account_id ?? auth.user?.id ?? null;
  const user_id = auth.user?.id ?? null;

  useEffect(() => {
    if (is_open) set_has_opened(true);
  }, [is_open]);

  useEffect(() => {
    set_selected_event(null);
  }, [account_id]);

  const handle_escape = useCallback(() => {
    if (selected_event) {
      set_selected_event(null);

      return;
    }

    on_close();
  }, [selected_event, on_close]);

  use_escape_layer(is_open, handle_escape, "quick_calendar_panel", false);
  use_panel_inset(is_visible, panel_ref);

  const gate = useMemo(
    () =>
      resolve_desktop_calendar_gate({
        is_loading: auth.is_loading,
        is_authenticated: auth.is_authenticated,
        account_id,
        user_id,
        has_keys: auth.has_keys,
        is_locked: gate_tick >= 0 && is_open && is_account_locked(account_id),
        has_vault: gate_tick >= 0 && has_vault_in_memory_for(user_id),
      }),
    [
      auth.is_loading,
      auth.is_authenticated,
      auth.has_keys,
      auth.vault,
      account_id,
      user_id,
      is_open,
      gate_tick,
    ],
  );

  const recheck_gate = useCallback(() => set_gate_tick((tick) => tick + 1), []);

  let body: ReactNode = null;

  if (has_opened) {
    if (gate === "loading") {
      body = <AgendaSkeleton />;
    } else if (gate === "signed_out") {
      body = (
        <Notice
          body={t("calendar.panel_signed_out")}
          role="status"
          show_open={false}
        />
      );
    } else if (gate === "locked") {
      body = (
        <Notice
          body={t("calendar.panel_locked")}
          role="status"
          on_retry={recheck_gate}
          show_open={false}
        />
      );
    } else if (gate === "keys") {
      body = (
        <Notice
          body={t("calendar.panel_keys_loading")}
          role="status"
          on_retry={recheck_gate}
          show_open={false}
        />
      );
    } else if (account_id) {
      body = (
        <AgendaBody
          key={account_id}
          account_id={account_id}
          create_request={create_request}
          is_open={is_open}
          selected_event={selected_event}
          on_ready_change={set_is_body_ready}
          on_select_event={set_selected_event}
        />
      );
    }
  }

  return (
    <aside
      ref={panel_ref}
      aria-label={t("common.app_name_calendar")}
      className={`quick_calendar_panel absolute inset-y-0 start-0 end-1.5 flex-col overflow-hidden rounded-lg bg-surf-primary md:end-2.5 md:rounded-xl ${
        is_visible ? "flex" : "hidden"
      } ${is_closing ? "quick_panel_closing" : "z-10"}`}
      data-testid="desktop_calendar_panel"
    >
      <PanelHeader
        on_close={on_close}
        on_new_event={
          gate === "ready" && is_body_ready
            ? () => set_create_request((value) => value + 1)
            : null
        }
      />
      {body}
    </aside>
  );
}
