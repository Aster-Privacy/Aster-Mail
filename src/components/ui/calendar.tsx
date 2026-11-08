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
import type { CalendarProps } from "@aster/ui/date_picker";

import { useContext } from "react";
import { Calendar as BaseCalendar } from "@aster/ui/date_picker";

import { PreferencesContext } from "@/contexts/preferences_context/helpers";
import { week_start_index } from "@/utils/week_start";

export type { CalendarProps };

export function Calendar(props: CalendarProps) {
  const context = useContext(PreferencesContext);
  const week_starts_on = week_start_index(
    context?.preferences.calendar_week_starts_on,
  );

  return <BaseCalendar weekStartsOn={week_starts_on} {...props} />;
}
