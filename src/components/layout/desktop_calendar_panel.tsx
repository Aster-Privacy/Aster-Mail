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
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
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
import { open_calendar_externally } from "@/components/layout/quick_calendar_panel";
import {
  AGENDA_DAY_COUNT,
  UP_NEXT_SOON_MS,
  add_days,
  add_months,
  bucket_events_by_day,
  build_event_link,
  build_month_grid,
  day_key,
  end_of_day,
  is_same_day,
  pick_next_event,
  plain_text,
  resolve_event_color,
  start_of_day,
  week_start_day_index,
  type UpNextPick,
} from "@/components/layout/desktop_calendar_days";
import { use_desktop_agenda } from "@/components/layout/use_desktop_agenda";
import {
  EventKindIcon,
  NowDivider,
  compact_time_range,
  event_segment_for_day,
  now_divider_index,
  relative_day_label,
} from "@/components/layout/desktop_calendar_agenda_parts";

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
}

function PanelHeader({ on_close }: PanelHeaderProps) {
  const { t } = use_i18n();

  return (
    <div className="flex h-12 flex-shrink-0 items-center gap-1 ps-4 pe-2">
      <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium text-txt-primary">
        {t("common.app_name_calendar")}
      </h2>
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

function segment_time_label(
  event: DecryptedCalendarEvent,
  day: Date,
  formatters: Formatters,
  all_day_label: string,
): string {
  const segment = event_segment_for_day(event, day);

  if (segment.is_all_day) return all_day_label;
  if (Number.isNaN(segment.start.getTime())) return "";
  if (
    Number.isNaN(segment.end.getTime()) ||
    segment.end.getTime() <= segment.start.getTime()
  ) {
    return formatters.time.format(segment.start);
  }

  return compact_time_range(
    formatters.time.format(segment.start),
    formatters.time.format(segment.end),
  );
}

function month_key(day: Date): string {
  return `${day.getFullYear()}-${day.getMonth()}`;
}

interface AgendaEventRowProps {
  event: DecryptedCalendarEvent;
  day: Date;
  now: Date;
  color: string;
  formatters: Formatters;
  on_open: (event: DecryptedCalendarEvent) => void;
}

function AgendaEventRow({
  event,
  day,
  now,
  color,
  formatters,
  on_open,
}: AgendaEventRowProps) {
  const { t } = use_i18n();
  const is_past = new Date(event.ends_at).getTime() < now.getTime();
  const location = (event.location ?? "").trim();
  const time = segment_time_label(
    event,
    day,
    formatters,
    t("calendar.all_day"),
  );

  return (
    <button
      className="flex w-full items-center gap-2.5 rounded-[var(--aster-radius-control,8px)] px-2 py-1.5 text-start transition-colors duration-150 ease-out hover:bg-[var(--aster-hover)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
      style={{
        opacity: is_past ? 0.6 : undefined,
        outlineColor: "var(--accent-color)",
      }}
      title={event.title}
      type="button"
      onClick={() => on_open(event)}
    >
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-txt-primary">
          <EventKindIcon kind={event.event_kind} />
          <span
            className={`truncate${
              event.event_kind === "task" && event.is_completed
                ? " line-through opacity-70"
                : ""
            }`}
          >
            {event.title.trim() || t("calendar.untitled_event")}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] tabular-nums text-txt-muted">
          <span className="flex-shrink-0 truncate" dir="ltr">
            {time}
          </span>
          {location && (
            <>
              <span aria-hidden="true">·</span>
              <MapPinIcon
                aria-hidden="true"
                className="h-3 w-3 flex-shrink-0"
              />
              <span className="min-w-0 truncate">{location}</span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}

interface UpNextProps {
  pick: UpNextPick | null;
  now: Date;
  color_of: (event: DecryptedCalendarEvent) => string;
  formatters: Formatters;
  on_open: (event: DecryptedCalendarEvent) => void;
}

function UpNext({ pick, now, color_of, formatters, on_open }: UpNextProps) {
  const { t, language } = use_i18n();
  const heading = (
    <span className="text-[11px] font-semibold uppercase tracking-wider text-txt-muted">
      {t("calendar.panel_up_next")}
    </span>
  );

  if (!pick) {
    return (
      <div
        className="mx-3 mt-3 rounded-xl border border-edge-secondary px-3 py-2.5"
        data-testid="desktop_calendar_up_next"
      >
        {heading}
        <p className="mt-1 flex items-center gap-2 text-[13px] text-txt-muted">
          <CalendarDaysIcon
            aria-hidden="true"
            className="h-4 w-4 flex-shrink-0"
          />
          <span>{t("calendar.panel_up_next_empty")}</span>
        </p>
      </div>
    );
  }

  const { event } = pick;
  const now_ms = now.getTime();
  const is_ongoing = pick.start_ms <= now_ms && now_ms < pick.end_ms;
  const minutes = Math.max(1, Math.ceil((pick.start_ms - now_ms) / 60_000));
  let badge = "";

  if (!event.is_all_day && is_ongoing) {
    badge = t("calendar.panel_up_next_now");
  } else if (!event.is_all_day && pick.start_ms - now_ms <= UP_NEXT_SOON_MS) {
    badge = t("calendar.panel_up_next_in_minutes", { count: minutes });
  }

  const start = new Date(pick.start_ms);
  const is_later_day = !is_same_day(start, now) && pick.start_ms > now_ms;
  const day_text = is_later_day
    ? `${relative_day_label(start, now, language)}, ${formatters.short_date.format(start)}`
    : relative_day_label(now, now, language);

  return (
    <button
      className="mx-3 mt-3 flex w-[calc(100%-1.5rem)] flex-col rounded-xl border border-edge-secondary px-3 py-2.5 text-start transition-colors duration-150 ease-out hover:bg-[var(--aster-hover)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
      data-testid="desktop_calendar_up_next"
      style={{ outlineColor: "var(--accent-color)" }}
      type="button"
      onClick={() => on_open(event)}
    >
      <span className="flex w-full items-center gap-2">
        {heading}
        {badge && (
          <span className="ms-auto rounded-full bg-[var(--accent-color)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-color-foreground,#ffffff)]">
            {badge}
          </span>
        )}
      </span>
      <span className="mt-1.5 flex w-full items-center gap-2.5">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: color_of(event) }}
        />
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px] font-medium text-txt-primary">
          <EventKindIcon kind={event.event_kind} />
          <span className="truncate">
            {event.title.trim() || t("calendar.untitled_event")}
          </span>
        </span>
      </span>
      <span className="mt-0.5 flex w-full min-w-0 items-center gap-1.5 ps-5 text-[12px] tabular-nums text-txt-muted">
        <span
          className="flex-shrink-0 font-medium"
          style={{ color: is_later_day ? undefined : "var(--accent-color)" }}
        >
          {day_text}
        </span>
        <span aria-hidden="true">·</span>
        <span className="min-w-0 truncate" dir="ltr">
          {event_time_label(event, formatters, t("calendar.all_day"))}
        </span>
      </span>
    </button>
  );
}

interface AgendaListProps {
  days: Date[];
  selected: Date;
  buckets: Map<string, DecryptedCalendarEvent[]>;
  now: Date;
  today: Date;
  color_of: (event: DecryptedCalendarEvent) => string;
  formatters: Formatters;
  on_open: (event: DecryptedCalendarEvent) => void;
}

function AgendaList({
  days,
  selected,
  buckets,
  now,
  today,
  color_of,
  formatters,
  on_open,
}: AgendaListProps) {
  const { t, language } = use_i18n();
  const groups = days
    .map((day) => ({ day, events: buckets.get(day_key(day)) ?? [] }))
    .filter(
      ({ day, events }) =>
        events.length > 0 ||
        is_same_day(day, selected) ||
        is_same_day(day, today),
    );
  let rendered_month = groups.length > 0 ? month_key(groups[0].day) : "";

  return (
    <div
      className="mt-2 flex flex-col pb-4"
      data-testid="desktop_calendar_agenda_list"
    >
      {groups.map(({ day, events }, index) => {
        const is_today = is_same_day(day, today);
        const is_past_day = day.getTime() < today.getTime();
        const current_month = month_key(day);
        const show_month_header = current_month !== rendered_month;
        const divider_at = is_today ? now_divider_index(events, now) : -1;

        rendered_month = current_month;

        return (
          <div key={day_key(day)}>
            {show_month_header && (
              <div
                className="sticky top-0 z-10 flex h-7 items-center border-b border-edge-secondary bg-surf-primary px-4 text-[11px] font-semibold uppercase tracking-wider text-txt-muted"
                data-testid="agenda_month_header"
              >
                {formatters.month.format(day)}
              </div>
            )}
            <section
              aria-current={is_today ? "date" : undefined}
              aria-label={formatters.full_day.format(day)}
              className={`flex gap-1 px-2 py-2 ${
                index === 0 || show_month_header
                  ? ""
                  : "border-t border-edge-secondary"
              }`}
            >
              <div className="flex w-16 flex-shrink-0 flex-col items-center pt-0.5">
                <span
                  className="max-w-full truncate whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide"
                  style={{
                    color: is_today
                      ? "var(--accent-color)"
                      : "var(--text-muted)",
                  }}
                >
                  {relative_day_label(day, today, language)}
                </span>
                <span
                  className="mt-0.5 inline-flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-[16px] font-medium tabular-nums"
                  style={{
                    backgroundColor: is_today
                      ? "var(--accent-color)"
                      : undefined,
                    color: is_today
                      ? "var(--accent-color-foreground, #ffffff)"
                      : is_past_day
                        ? "var(--text-muted)"
                        : "var(--text-primary)",
                  }}
                >
                  {day.getDate()}
                </span>
              </div>
              {events.length === 0 ? (
                <p className="flex h-10 min-w-0 flex-1 items-center gap-2 px-2 text-[13px] text-txt-muted">
                  <CalendarDaysIcon
                    aria-hidden="true"
                    className="h-4 w-4 flex-shrink-0"
                  />
                  <span className="truncate">
                    {t("calendar.panel_no_events")}
                  </span>
                </p>
              ) : (
                <ul className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {events.map((event, event_index) => (
                    <Fragment key={`${event.id}-${event.starts_at}`}>
                      {event_index === divider_at && <NowDivider />}
                      <li>
                        <AgendaEventRow
                          color={color_of(event)}
                          day={day}
                          event={event}
                          formatters={formatters}
                          now={now}
                          on_open={on_open}
                        />
                      </li>
                    </Fragment>
                  ))}
                  {divider_at === events.length && <NowDivider />}
                </ul>
              )}
            </section>
          </div>
        );
      })}
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

interface AgendaBodyProps {
  account_id: string;
  self_email: string;
  is_open: boolean;
  selected_event: DecryptedCalendarEvent | null;
  on_select_event: (event: DecryptedCalendarEvent | null) => void;
}

function AgendaBody({
  account_id,
  self_email,
  is_open,
  selected_event,
  on_select_event,
}: AgendaBodyProps) {
  const { t, language } = use_i18n();
  const { preferences } = use_preferences();
  const now = use_now(is_open);
  const today = useMemo(() => start_of_day(now), [now]);
  const [selected, set_selected] = useState(() => start_of_day(new Date()));
  const [anchor, set_anchor] = useState(() => start_of_day(new Date()));
  const week_start = week_start_day_index(preferences.calendar_week_starts_on);
  const formatters = use_formatters(language, preferences.time_format);

  const grid = useMemo(
    () => build_month_grid(anchor, week_start),
    [anchor, week_start],
  );
  const agenda_days = useMemo(
    () =>
      Array.from({ length: AGENDA_DAY_COUNT }, (_, index) =>
        add_days(selected, index),
      ),
    [selected],
  );
  const range_start = useMemo(
    () => start_of_day(grid[0] < selected ? grid[0] : selected),
    [grid, selected],
  );
  const range_end = useMemo(() => {
    const last_agenda = agenda_days[agenda_days.length - 1];
    const last_grid = grid[grid.length - 1];

    return end_of_day(last_agenda > last_grid ? last_agenda : last_grid);
  }, [agenda_days, grid]);
  const up_next_end = useMemo(
    () => end_of_day(add_days(today, AGENDA_DAY_COUNT + 1)),
    [today],
  );

  const agenda = use_desktop_agenda({
    enabled: true,
    account_id,
    range_start,
    range_end,
    up_next_start: today,
    up_next_end,
  });

  const calendars_by_id = useMemo(
    () => new Map(agenda.calendars.map((calendar) => [calendar.id, calendar])),
    [agenda.calendars],
  );
  const visible_events = useMemo(() => {
    const hidden = new Set(
      agenda.calendars.filter((c) => !c.is_visible).map((c) => c.id),
    );

    return agenda.events.filter((event) => !hidden.has(event.calendar_id));
  }, [agenda.events, agenda.calendars]);
  const agenda_buckets = useMemo(
    () => bucket_events_by_day(visible_events, agenda_days),
    [visible_events, agenda_days],
  );
  const event_days = useMemo(() => {
    const buckets = bucket_events_by_day(visible_events, grid);

    return new Set(
      Array.from(buckets.entries())
        .filter(([, list]) => list.length > 0)
        .map(([key]) => key),
    );
  }, [visible_events, grid]);
  const pick = useMemo(
    () =>
      pick_next_event(agenda.up_next_events, agenda.calendars, now, self_email),
    [agenda.up_next_events, agenda.calendars, now, self_email],
  );
  const color_of = useCallback(
    (event: DecryptedCalendarEvent) =>
      resolve_event_color(event, calendars_by_id),
    [calendars_by_id],
  );
  const select_day = useCallback((day: Date) => {
    const next = start_of_day(day);

    set_selected(next);
    set_anchor((current) =>
      current.getFullYear() === next.getFullYear() &&
      current.getMonth() === next.getMonth()
        ? current
        : next,
    );
  }, []);

  useEffect(() => {
    if (!selected_event) return;
    if (agenda.status !== "ready") on_select_event(null);
  }, [agenda.status, selected_event, on_select_event]);

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

  return (
    <div
      className="flex flex-1 flex-col overflow-y-auto"
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
      <UpNext
        color_of={color_of}
        formatters={formatters}
        now={now}
        pick={pick}
        on_open={on_select_event}
      />
      <AgendaList
        buckets={agenda_buckets}
        color_of={color_of}
        days={agenda_days}
        formatters={formatters}
        now={now}
        selected={selected}
        today={today}
        on_open={on_select_event}
      />
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
          is_open={is_open}
          self_email={auth.user?.email ?? ""}
          selected_event={selected_event}
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
      <PanelHeader on_close={on_close} />
      {body}
    </aside>
  );
}
