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
import type {
  CSSProperties,
  FormEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button, Input } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EventKindIcon,
  NOW_COLOR,
} from "@/components/layout/desktop_calendar_agenda_parts";
import {
  DEFAULT_DRAFT_MINUTES,
  HOUR_HEIGHT,
  MINUTES_PER_DAY,
  MIN_EVENT_MINUTES,
  SNAP_MINUTES,
  clamp_minute,
  date_at_minute,
  minute_to_offset,
  minutes_into_day,
  offset_to_minute,
  snap_minute,
  type DayLayout,
  type TimedPlacement,
} from "@/components/layout/desktop_calendar_timeline_layout";
import { safe_color } from "@/components/layout/desktop_calendar_days";

const GUTTER_WIDTH = 48;
const VISIBLE_ALL_DAY = 2;
const COMPACT_HEIGHT = 36;
const ROOMY_HEIGHT = 60;
const DRAG_THRESHOLD_PX = 4;

export interface DraftRange {
  start_minute: number;
  end_minute: number;
}

export interface TimelineFormatters {
  time: Intl.DateTimeFormat;
  hour: Intl.DateTimeFormat;
}

function chip_fill(color: string): string {
  return `color-mix(in srgb, ${color} 16%, var(--bg-primary))`;
}

function chip_hover_fill(color: string): string {
  return `color-mix(in srgb, ${color} 24%, var(--bg-primary))`;
}

function event_title(event: DecryptedCalendarEvent, fallback: string): string {
  return event.title.trim() || fallback;
}

export function format_minute_range(
  day: Date,
  range: DraftRange,
  formatters: TimelineFormatters,
): string {
  const start = formatters.time.format(date_at_minute(day, range.start_minute));
  const end = formatters.time.format(date_at_minute(day, range.end_minute));

  return `${start} - ${end}`;
}

interface AllDayStripProps {
  events: DecryptedCalendarEvent[];
  color_of: (event: DecryptedCalendarEvent) => string;
  on_open: (event: DecryptedCalendarEvent) => void;
}

export function AllDayStrip({ events, color_of, on_open }: AllDayStripProps) {
  const { t } = use_i18n();
  const [is_expanded, set_is_expanded] = useState(false);

  if (events.length === 0) return null;

  const overflow = events.length - VISIBLE_ALL_DAY;
  const shown =
    is_expanded || overflow <= 1 ? events : events.slice(0, VISIBLE_ALL_DAY);

  return (
    <div
      aria-label={t("calendar.all_day")}
      className="flex flex-shrink-0 gap-2 border-b border-edge-secondary py-2 pe-3"
      data-testid="desktop_calendar_all_day"
      role="group"
    >
      <span className="w-12 flex-shrink-0 pe-2 pt-[5px] text-end text-[11px] leading-none text-txt-muted">
        {t("calendar.all_day")}
      </span>
      <ul className="flex min-w-0 flex-1 flex-col gap-1">
        {shown.map((event) => {
          const color = color_of(event);

          return (
            <li key={`${event.id}-${event.starts_at}`}>
              <button
                className="calendar_panel_chip flex h-6 w-full min-w-0 items-center gap-1.5 rounded-[6px] pe-2 text-start text-[12px] font-medium text-txt-primary"
                style={
                  {
                    "--chip_fill": chip_fill(color),
                    "--chip_hover": chip_hover_fill(color),
                    "--chip_accent": color,
                  } as CSSProperties
                }
                title={event_title(event, t("calendar.untitled_event"))}
                type="button"
                onClick={() => on_open(event)}
              >
                <EventKindIcon kind={event.event_kind} />
                <span className="truncate">
                  {event_title(event, t("calendar.untitled_event"))}
                </span>
              </button>
            </li>
          );
        })}
        {overflow > 1 && (
          <li>
            <button
              aria-expanded={is_expanded}
              className="flex h-6 items-center rounded-[6px] px-2 text-[12px] font-medium text-txt-secondary hover:bg-[var(--aster-hover)] focus:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-color)]"
              type="button"
              onClick={() => set_is_expanded((value) => !value)}
            >
              {is_expanded
                ? t("calendar.panel_show_less")
                : t("calendar.more_events", { count: overflow })}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

interface TimelineChipProps {
  placement: TimedPlacement;
  day: Date;
  now: Date;
  color: string;
  formatters: TimelineFormatters;
  on_open: (event: DecryptedCalendarEvent) => void;
}

function TimelineChip({
  placement,
  day,
  now,
  color,
  formatters,
  on_open,
}: TimelineChipProps) {
  const { t } = use_i18n();
  const { event, start_minute, end_minute, column, column_count } = placement;
  const visual_end = Math.min(
    MINUTES_PER_DAY,
    Math.max(end_minute, start_minute + MIN_EVENT_MINUTES),
  );
  const top = minute_to_offset(start_minute);
  const height = Math.max(18, minute_to_offset(visual_end - start_minute) - 2);
  const title = event_title(event, t("calendar.untitled_event"));
  const time = formatters.time.format(new Date(event.starts_at));
  const range = format_minute_range(
    day,
    { start_minute, end_minute },
    formatters,
  );
  const location = (event.location ?? "").trim();
  const is_past = new Date(event.ends_at).getTime() < now.getTime();
  const is_compact = height < COMPACT_HEIGHT;
  const is_done = event.event_kind === "task" && event.is_completed;
  const width = 100 / column_count;

  return (
    <li
      className="absolute"
      style={{
        top,
        height,
        insetInlineStart: `${column * width}%`,
        width: `calc(${width}% - 2px)`,
      }}
    >
      <button
        aria-label={`${title}, ${range}`}
        className={`calendar_panel_chip flex h-full w-full min-w-0 overflow-hidden rounded-[6px] pe-1.5 text-start text-txt-primary ${
          is_compact ? "items-center gap-1.5" : "flex-col py-1"
        } ${is_past ? "calendar_panel_chip_past" : ""}`}
        data-event-id={event.id}
        style={
          {
            "--chip_fill": chip_fill(color),
            "--chip_hover": chip_hover_fill(color),
            "--chip_accent": color,
          } as CSSProperties
        }
        title={
          location ? `${title}\n${range}\n${location}` : `${title}\n${range}`
        }
        type="button"
        onClick={() => on_open(event)}
      >
        <span
          className={`flex min-w-0 items-center gap-1 text-[12px] font-semibold leading-4 ${
            is_compact ? "flex-shrink" : ""
          }`}
        >
          <EventKindIcon kind={event.event_kind} />
          <span
            className={`truncate${is_done ? " line-through opacity-70" : ""}`}
          >
            {title}
          </span>
        </span>
        <span
          className={`truncate text-[11px] leading-4 tabular-nums text-txt-secondary ${
            is_compact ? "flex-shrink-0" : ""
          }`}
          dir="ltr"
        >
          {is_compact ? time : range}
        </span>
        {!is_compact && height >= ROOMY_HEIGHT && location && (
          <span className="truncate text-[11px] leading-4 text-txt-secondary">
            {location}
          </span>
        )}
      </button>
    </li>
  );
}

interface DayTimelineProps {
  day: Date;
  now: Date;
  is_today: boolean;
  layout: DayLayout;
  scroll_minute: number;
  formatters: TimelineFormatters;
  draft: DraftRange | null;
  color_of: (event: DecryptedCalendarEvent) => string;
  on_open: (event: DecryptedCalendarEvent) => void;
  on_draft: (range: DraftRange) => void;
  on_draft_preview: (range: DraftRange | null) => void;
}

interface DragState {
  pointer_id: number;
  origin_y: number;
  anchor_minute: number;
  has_moved: boolean;
}

export function DayTimeline({
  day,
  now,
  is_today,
  layout,
  scroll_minute,
  formatters,
  draft,
  color_of,
  on_open,
  on_draft,
  on_draft_preview,
}: DayTimelineProps) {
  const { t } = use_i18n();
  const scroll_ref = useRef<HTMLDivElement | null>(null);
  const area_ref = useRef<HTMLDivElement | null>(null);
  const drag_ref = useRef<DragState | null>(null);
  const day_key = day.getTime();
  const hours = useMemo(
    () =>
      Array.from({ length: 24 }, (_, hour) => ({
        hour,
        label: formatters.hour.format(date_at_minute(day, hour * 60)),
      })),
    [day, formatters],
  );
  const now_minute = is_today ? clamp_minute(minutes_into_day(now, day)) : -1;

  useLayoutEffect(() => {
    const node = scroll_ref.current;

    if (!node) return;
    node.scrollTop = minute_to_offset(scroll_minute);
  }, [day_key]);

  useEffect(() => {
    if (!draft) return;

    const node = scroll_ref.current;

    if (!node) return;

    const top = minute_to_offset(draft.start_minute);
    const bottom = minute_to_offset(draft.end_minute);

    if (top < node.scrollTop || bottom > node.scrollTop + node.clientHeight) {
      node.scrollTop = Math.max(0, top - HOUR_HEIGHT);
    }
  }, [draft?.start_minute]);

  const minute_at = (client_y: number): number => {
    const rect = area_ref.current?.getBoundingClientRect();

    if (!rect) return 0;

    return offset_to_minute(client_y - rect.top);
  };

  const range_from = (anchor: number, pointer: number): DraftRange => {
    const low = Math.min(anchor, pointer);
    const high = Math.max(anchor, pointer);
    const start = snap_minute(low);
    let end = clamp_minute(Math.ceil(high / SNAP_MINUTES) * SNAP_MINUTES);

    if (end - start < SNAP_MINUTES) end = start + SNAP_MINUTES;
    if (end > MINUTES_PER_DAY) {
      return {
        start_minute: MINUTES_PER_DAY - SNAP_MINUTES,
        end_minute: MINUTES_PER_DAY,
      };
    }

    return { start_minute: start, end_minute: end };
  };

  const handle_pointer_down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (event.target !== event.currentTarget) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag_ref.current = {
      pointer_id: event.pointerId,
      origin_y: event.clientY,
      anchor_minute: minute_at(event.clientY),
      has_moved: false,
    };
  };

  const handle_pointer_move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = drag_ref.current;

    if (!drag || drag.pointer_id !== event.pointerId) return;
    if (!drag.has_moved) {
      if (Math.abs(event.clientY - drag.origin_y) < DRAG_THRESHOLD_PX) return;
      drag.has_moved = true;
    }
    on_draft_preview(range_from(drag.anchor_minute, minute_at(event.clientY)));
  };

  const handle_pointer_up = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = drag_ref.current;

    if (!drag || drag.pointer_id !== event.pointerId) return;
    drag_ref.current = null;

    if (drag.has_moved) {
      on_draft(range_from(drag.anchor_minute, minute_at(event.clientY)));

      return;
    }

    const start = snap_minute(drag.anchor_minute);
    const bounded = Math.min(start, MINUTES_PER_DAY - DEFAULT_DRAFT_MINUTES);

    on_draft({
      start_minute: bounded,
      end_minute: bounded + DEFAULT_DRAFT_MINUTES,
    });
  };

  const handle_pointer_cancel = () => {
    if (!drag_ref.current) return;
    drag_ref.current = null;
    on_draft_preview(null);
  };

  return (
    <div
      ref={scroll_ref}
      className="calendar_panel_scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
      data-testid="desktop_calendar_timeline"
    >
      <div
        className="relative"
        style={{ height: HOUR_HEIGHT * 24 + 16, paddingTop: 8 }}
      >
        <div className="relative" style={{ height: HOUR_HEIGHT * 24 }}>
          {hours.map(({ hour, label }) => (
            <div
              key={hour}
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 flex"
              style={{ top: hour * HOUR_HEIGHT }}
            >
              <span
                className="-mt-[7px] flex-shrink-0 pe-2 text-end text-[11px] leading-[14px] tabular-nums text-txt-muted"
                style={{ width: GUTTER_WIDTH }}
              >
                {hour === 0 ? "" : label}
              </span>
              <span className="mt-0 h-px flex-1 bg-[var(--border-secondary)] me-3" />
            </div>
          ))}
          <div
            ref={area_ref}
            aria-label={t("calendar.panel_timeline_hint")}
            className="calendar_panel_area absolute inset-y-0 end-3 cursor-cell touch-none select-none"
            data-testid="desktop_calendar_grid"
            role="presentation"
            style={{ insetInlineStart: GUTTER_WIDTH }}
            onPointerCancel={handle_pointer_cancel}
            onPointerDown={handle_pointer_down}
            onPointerMove={handle_pointer_move}
            onPointerUp={handle_pointer_up}
          >
            <ul className="pointer-events-none absolute inset-0 [&>li>button]:pointer-events-auto">
              {layout.timed.map((placement) => (
                <TimelineChip
                  key={`${placement.event.id}-${placement.event.starts_at}`}
                  color={color_of(placement.event)}
                  day={day}
                  formatters={formatters}
                  now={now}
                  placement={placement}
                  on_open={on_open}
                />
              ))}
            </ul>
            {draft && (
              <div
                aria-hidden="true"
                className="calendar_panel_draft pointer-events-none absolute inset-x-0 flex flex-col overflow-hidden rounded-[6px] px-2 py-1"
                data-testid="desktop_calendar_draft"
                style={{
                  top: minute_to_offset(draft.start_minute),
                  height: Math.max(
                    18,
                    minute_to_offset(draft.end_minute - draft.start_minute) - 2,
                  ),
                }}
              >
                <span
                  className="truncate text-[11px] font-medium leading-4 tabular-nums"
                  dir="ltr"
                >
                  {format_minute_range(day, draft, formatters)}
                </span>
              </div>
            )}
          </div>
          {now_minute >= 0 && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute end-3 z-[2] flex items-center"
              data-testid="desktop_calendar_now_line"
              style={{
                top: minute_to_offset(now_minute) - 4,
                insetInlineStart: GUTTER_WIDTH - 4,
              }}
            >
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{
                  backgroundColor: NOW_COLOR,
                  boxShadow: "0 0 0 2px var(--bg-primary)",
                }}
              />
              <span
                className="h-0.5 flex-1"
                style={{ backgroundColor: NOW_COLOR }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface QuickCreateProps {
  day: Date;
  range: DraftRange;
  calendars: DecryptedCalendar[];
  default_calendar_id: string;
  formatters: TimelineFormatters;
  date_label: string;
  on_cancel: () => void;
  on_save: (input: {
    title: string;
    calendar_id: string;
    range: DraftRange;
  }) => Promise<boolean>;
}

export function QuickCreate({
  day,
  range,
  calendars,
  default_calendar_id,
  formatters,
  date_label,
  on_cancel,
  on_save,
}: QuickCreateProps) {
  const { t } = use_i18n();
  const input_ref = useRef<HTMLInputElement | null>(null);
  const [title, set_title] = useState("");
  const [calendar_id, set_calendar_id] = useState(default_calendar_id);
  const [is_saving, set_is_saving] = useState(false);
  const [has_failed, set_has_failed] = useState(false);
  const selected_calendar = calendars.find((item) => item.id === calendar_id);

  use_escape_layer(true, on_cancel, "calendar_panel_quick_create", false);

  useEffect(() => {
    input_ref.current?.focus();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (is_saving || !calendar_id) return;

    set_is_saving(true);
    set_has_failed(false);

    const ok = await on_save({ title: title.trim(), calendar_id, range });

    if (!ok) {
      set_is_saving(false);
      set_has_failed(true);
    }
  };

  return (
    <form
      aria-label={t("calendar.new_event")}
      className="calendar_panel_quick_create absolute inset-x-2 bottom-2 z-20 flex flex-col gap-3 rounded-xl border border-edge-secondary bg-surf-primary p-3"
      data-testid="desktop_calendar_quick_create"
      onSubmit={submit}
    >
      <div className="flex flex-col gap-1">
        <Input
          ref={input_ref}
          aria-label={t("calendar.event_title")}
          disabled={is_saving}
          maxLength={500}
          placeholder={t("calendar.event_title_placeholder")}
          value={title}
          onChange={(event) => set_title(event.target.value)}
        />
        <p className="flex min-w-0 items-center gap-1.5 px-1 text-[12px] text-txt-secondary">
          <span className="truncate">{date_label}</span>
          <span aria-hidden="true">·</span>
          <span className="flex-shrink-0 tabular-nums" dir="ltr">
            {format_minute_range(day, range, formatters)}
          </span>
        </p>
      </div>
      {calendars.length > 1 && (
        <Select
          disabled={is_saving}
          value={calendar_id}
          onValueChange={set_calendar_id}
        >
          <SelectTrigger
            aria-label={t("calendar.calendar")}
            className="h-9 w-full font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    safe_color(selected_calendar?.color) ??
                    "var(--accent-color)",
                }}
              />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {calendars.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {has_failed && (
        <p className="px-1 text-[12px] text-[var(--color-danger)]" role="alert">
          {t("calendar.panel_save_failed")}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button
          disabled={is_saving}
          size="sm"
          type="button"
          variant="ghost"
          onClick={on_cancel}
        >
          {t("common.cancel")}
        </Button>
        <Button disabled={is_saving} size="sm" type="submit" variant="primary">
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
