import { useCallback, useMemo } from "react";

import { use_preferences } from "@/contexts/preferences_context";
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
    (date: Date) => format_full_datetime(date, options),
    [options],
  );

  const format_timestamp_smart_fn = useCallback(
    (date: Date) => format_timestamp_smart(date, options),
    [options],
  );

  const format_email_list_fn = useCallback(
    (date: Date) => format_email_list_timestamp(date, options),
    [options],
  );

  const format_email_detail_fn = useCallback(
    (date: Date) => format_email_detail_timestamp(date, options),
    [options],
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
