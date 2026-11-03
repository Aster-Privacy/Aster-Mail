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
import { CALENDARS_ENDPOINT } from "@/services/calendar/sync_engine";

let known: boolean | null = null;
let pending: Promise<boolean> | null = null;

export function calendar_available(): Promise<boolean> {
  if (known !== null) {
    return Promise.resolve(known);
  }

  if (!pending) {
    pending = api_client
      .get<unknown>(CALENDARS_ENDPOINT, { skip_cache: true })
      .then((response) => {
        if (response.status === 404) {
          known = false;

          return false;
        }

        if (!response.error) {
          known = true;
        }

        return true;
      })
      .catch(() => true)
      .finally(() => {
        pending = null;
      });
  }

  return pending;
}

export function reset_calendar_availability(): void {
  known = null;
  pending = null;
}
