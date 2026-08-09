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

export type CalendarEventStatus = "confirmed" | "tentative" | "cancelled";

export type CalendarAttendeeResponse =
  | "accepted"
  | "declined"
  | "tentative"
  | "needs_action";

export interface CalendarAttendee {
  email: string;
  display_name: string | null;
  response: CalendarAttendeeResponse;
  is_organizer: boolean;
}

export interface DecryptedCalendar {
  id: string;
  name: string;
  color: string;
  is_visible: boolean;
  is_default: boolean;
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
  reminder_minutes: number | null;
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
  reminder_minutes: number | null;
}
