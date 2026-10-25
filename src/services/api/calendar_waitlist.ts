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
import { api_client } from "@/services/api/client";

export const CALENDAR_WAITLIST_ENDPOINT = "/calendar/v1/waitlist";

export interface CalendarWaitlistStatus {
  joined: boolean;
  joined_at: string | null;
}

async function settle(
  request: Promise<{ data?: CalendarWaitlistStatus; error?: string }>,
): Promise<CalendarWaitlistStatus> {
  const response = await request;

  if (response.error || !response.data) {
    throw new Error(response.error || "calendar_waitlist_unavailable");
  }

  return {
    joined: response.data.joined === true,
    joined_at: response.data.joined_at ?? null,
  };
}

export function get_calendar_waitlist_status(): Promise<CalendarWaitlistStatus> {
  return settle(
    api_client.get<CalendarWaitlistStatus>(CALENDAR_WAITLIST_ENDPOINT, {
      skip_cache: true,
    }),
  );
}

export function join_calendar_waitlist(): Promise<CalendarWaitlistStatus> {
  return settle(
    api_client.post<CalendarWaitlistStatus>(CALENDAR_WAITLIST_ENDPOINT, {}),
  );
}

export function leave_calendar_waitlist(): Promise<CalendarWaitlistStatus> {
  return settle(
    api_client.delete<CalendarWaitlistStatus>(CALENDAR_WAITLIST_ENDPOINT),
  );
}
