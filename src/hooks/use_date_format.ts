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
import { useCallback, useMemo } from "react";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n";
import {
  format_date,
  format_time,
  format_date_short,
  format_weekday_short,
  format_full_date,
  format_full_datetime,
  format_timestamp_smart,
  format_email_list_timestamp,
  format_email_detail_timestamp,
  format_email_popup_timestamp,
  type FormatOptions,
} from "@/utils/date_format";

export function use_date_format() {
  const { preferences } = use_preferences();
  const { t } = use_i18n();

  const options: FormatOptions = useMemo(
    () => ({
      date_format: preferences.date_format as FormatOptions["date_format"],
      time_format: preferences.time_format,
    }),
    [preferences.date_format, preferences.time_format],
  );

  const format_date_fn = useCallback(
    (date: Date) => format_date(date, options),
    [options],
  );

  const format_time_fn = useCallback(
    (date: Date) => format_time(date, options),
    [options],
  );

  const format_date_short_fn = useCallback(
    (date: Date) => format_date_short(date, options),
    [options],
  );

  const format_weekday_short_fn = useCallback(
    (date: Date) => format_weekday_short(date),
    [],
  );

  const format_full_date_fn = useCallback(
    (date: Date) => format_full_date(date, options),
    [options],
  );

  const format_full_datetime_fn = useCallback(
    (date: Date) => format_full_datetime(date, options, t),
    [options, t],
  );

  const format_timestamp_smart_fn = useCallback(
    (date: Date) => format_timestamp_smart(date, options, t),
    [options, t],
  );

  const format_email_list_fn = useCallback(
    (date: Date) => format_email_list_timestamp(date, options),
    [options],
  );

  const format_email_detail_fn = useCallback(
    (date: Date) => format_email_detail_timestamp(date, options, t),
    [options, t],
  );

  const format_email_popup_fn = useCallback(
    (date: Date) => format_email_popup_timestamp(date, options),
    [options],
  );

  return {
    format_date: format_date_fn,
    format_time: format_time_fn,
    format_date_short: format_date_short_fn,
    format_weekday_short: format_weekday_short_fn,
    format_full_date: format_full_date_fn,
    format_full_datetime: format_full_datetime_fn,
    format_timestamp_smart: format_timestamp_smart_fn,
    format_email_list: format_email_list_fn,
    format_email_detail: format_email_detail_fn,
    format_email_popup: format_email_popup_fn,
    options,
  };
}
