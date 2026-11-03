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
export type CalendarViewMode =
  "month" | "week" | "day" | "agenda" | "year" | "custom";

export type CalendarEventStatus = "confirmed" | "tentative" | "cancelled";

export type CalendarEventAvailability = "busy" | "free";

export type CalendarEventVisibility = "default" | "public" | "private";

export type CalendarEventKind =
  "default" | "task" | "out_of_office" | "focus_time" | "working_location";

export type CalendarWorkingLocation = "home" | "office" | "other";

export type CalendarAttendeeResponse =
  "accepted" | "declined" | "tentative" | "needs_action";

export interface CalendarAttendee {
  email: string;
  display_name: string | null;
  response: CalendarAttendeeResponse;
  is_organizer: boolean;
  responded_at?: string | null;
}

export interface CalendarTag {
  name: string;
  color: string;
}

export const CALENDAR_ICON_NAMES = [
  "calendar",
  "briefcase",
  "home",
  "heart",
  "graduation_cap",
  "dumbbell",
  "plane",
  "users",
  "star",
  "bell",
] as const;

export type CalendarIconName = (typeof CALENDAR_ICON_NAMES)[number];

export const DEFAULT_CALENDAR_ICON: CalendarIconName = "calendar";

export function is_calendar_icon_name(
  value: unknown,
): value is CalendarIconName {
  return (
    typeof value === "string" &&
    (CALENDAR_ICON_NAMES as readonly string[]).includes(value)
  );
}

export function normalize_calendar_icon(value: unknown): CalendarIconName {
  return is_calendar_icon_name(value) ? value : DEFAULT_CALENDAR_ICON;
}

export interface DecryptedCalendar {
  id: string;
  name: string;
  color: string;
  icon: CalendarIconName;
  is_visible: boolean;
  is_default: boolean;
}

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export type RecurrenceEditScope = "single" | "following" | "series";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  by_weekday: number[];
  count: number | null;
  until: string | null;
  by_month_day?: number[];
  by_month?: number[];
  by_set_pos?: number[];
  week_start?: number;
  extra_dates?: string[];
  time_zone?: string | null;
}

export interface CalendarTaskMeta {
  list_id: string;
  parent_id: string | null;
  position: number;
  starred: boolean;
  has_date: boolean;
  completed_at: string | null;
  source_ref: string | null;
  key: string;
}

export interface DecryptedCalendarEvent {
  id: string;
  calendar_id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  status: CalendarEventStatus;
  attendees: CalendarAttendee[];
  tags: string[];
  reminder_minutes: number | null;
  color: string | null;
  availability: CalendarEventAvailability;
  visibility: CalendarEventVisibility;
  event_kind: CalendarEventKind;
  is_completed: boolean;
  working_location: CalendarWorkingLocation | null;
  conference_url: string;
  guests_can_modify: boolean;
  guests_can_invite: boolean;
  guests_can_see_guests: boolean;
  recurrence: RecurrenceRule | null;
  recurrence_exceptions: string[];
  recurrence_master_id: string | null;
  occurrence_start: string | null;
  recurrence_id?: string | null;
  uid?: string | null;
  sequence?: number;
  organizer_email?: string | null;
  trashed_at?: string | null;
  task_meta?: CalendarTaskMeta | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEventDraft {
  calendar_id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  status: CalendarEventStatus;
  attendees: CalendarAttendee[];
  tags: string[];
  reminder_minutes: number | null;
  color: string | null;
  availability: CalendarEventAvailability;
  visibility: CalendarEventVisibility;
  event_kind: CalendarEventKind;
  is_completed: boolean;
  working_location: CalendarWorkingLocation | null;
  conference_url: string;
  guests_can_modify: boolean;
  guests_can_invite: boolean;
  guests_can_see_guests: boolean;
  recurrence: RecurrenceRule | null;
  recurrence_exceptions: string[];
  recurrence_cleared?: boolean;
  uid?: string | null;
  recurrence_id?: string | null;
  sequence?: number;
  organizer_email?: string | null;
  trashed_at?: string | null;
  task_meta?: CalendarTaskMeta | null;
}
