type DateFormatPreference = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
type TimeFormatPreference = "12h" | "24h";

export interface FormatOptions {
  date_format: DateFormatPreference;
  time_format: TimeFormatPreference;
}

const DEFAULT_OPTIONS: FormatOptions = {
  date_format: "MM/DD/YYYY",
  time_format: "12h",
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function format_date(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();

  switch (options.date_format) {
    case "DD/MM/YYYY":
      return `${day}/${month}/${year}`;
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`;
    case "MM/DD/YYYY":
    default:
      return `${month}/${day}/${year}`;
  }
}

export function format_time(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  const hours = date.getHours();
  const minutes = pad(date.getMinutes());

  if (options.time_format === "24h") {
    return `${pad(hours)}:${minutes}`;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const hours_12 = hours % 12 || 12;

  return `${hours_12}:${minutes} ${period}`;
}

export function format_date_short(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  const day = date.getDate();
  const month_names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = month_names[date.getMonth()];

  switch (options.date_format) {
    case "DD/MM/YYYY":
      return `${day} ${month}`;
    case "YYYY-MM-DD":
      return `${month} ${day}`;
    case "MM/DD/YYYY":
    default:
      return `${month} ${day}`;
  }
}

export function format_weekday_short(date: Date): string {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return weekdays[date.getDay()];
}

export function format_full_date(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  const weekdays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const weekday = weekdays[date.getDay()];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();

  switch (options.date_format) {
    case "DD/MM/YYYY":
      return `${weekday}, ${day} ${month} ${year}`;
    case "YYYY-MM-DD":
      return `${weekday}, ${year} ${month} ${day}`;
    case "MM/DD/YYYY":
    default:
      return `${weekday}, ${month} ${day}, ${year}`;
  }
}

export function format_full_datetime(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  return `${format_full_date(date, options)} at ${format_time(date, options)}`;
}

export function format_timestamp_smart(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  const now = new Date();
  const diff_ms = now.getTime() - date.getTime();
  const diff_days = diff_ms / (1000 * 60 * 60 * 24);

  const is_today = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);

  yesterday.setDate(yesterday.getDate() - 1);
  const is_yesterday = date.toDateString() === yesterday.toDateString();

  if (is_today) {
    return format_time(date, options);
  }

  if (is_yesterday) {
    return "Yesterday";
  }

  if (diff_days < 7) {
    return format_weekday_short(date);
  }

  return format_date_short(date, options);
}

export function format_email_list_timestamp(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  const now = new Date();
  const diff_ms = now.getTime() - date.getTime();
  const diff_hours = diff_ms / (1000 * 60 * 60);

  if (diff_hours < 24) {
    return format_time(date, options);
  }

  if (diff_hours < 168) {
    return format_weekday_short(date);
  }

  return format_date_short(date, options);
}

export function format_email_detail_timestamp(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  const now = new Date();
  const is_today = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);

  yesterday.setDate(yesterday.getDate() - 1);
  const is_yesterday = date.toDateString() === yesterday.toDateString();

  const diff_days = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);

  if (is_today) {
    return `Today at ${format_time(date, options)}`;
  }

  if (is_yesterday) {
    return `Yesterday at ${format_time(date, options)}`;
  }

  if (diff_days < 7) {
    return `${format_weekday_short(date)} at ${format_time(date, options)}`;
  }

  return `${format_date_short(date, options)} at ${format_time(date, options)}`;
}

export function format_email_popup_timestamp(
  date: Date,
  options: FormatOptions = DEFAULT_OPTIONS,
): string {
  return format_full_datetime(date, options);
}

export function format_snooze_remaining(snooze_date: Date): string {
  const now = new Date();
  const diff_ms = snooze_date.getTime() - now.getTime();

  if (diff_ms <= 0) return "Snooze expired";

  const diff_minutes = Math.floor(diff_ms / (1000 * 60));
  const diff_hours = Math.floor(diff_ms / (1000 * 60 * 60));
  const diff_days = Math.floor(diff_ms / (1000 * 60 * 60 * 24));

  if (diff_minutes < 60) {
    return `${diff_minutes} minute${diff_minutes !== 1 ? "s" : ""} remaining`;
  } else if (diff_hours < 24) {
    return `${diff_hours} hour${diff_hours !== 1 ? "s" : ""} remaining`;
  } else if (diff_days < 7) {
    return `${diff_days} day${diff_days !== 1 ? "s" : ""} remaining`;
  } else {
    const weeks = Math.floor(diff_days / 7);

    return `${weeks} week${weeks !== 1 ? "s" : ""} remaining`;
  }
}

export function format_snooze_target(snooze_date: Date): string {
  const now = new Date();
  const tomorrow = new Date(now);

  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const snooze_day = new Date(snooze_date);

  snooze_day.setHours(0, 0, 0, 0);

  const today = new Date(now);

  today.setHours(0, 0, 0, 0);

  const time_str = snooze_date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (snooze_day.getTime() === today.getTime()) {
    return `Today at ${time_str}`;
  } else if (snooze_day.getTime() === tomorrow.getTime()) {
    return `Tomorrow at ${time_str}`;
  } else {
    const date_str = snooze_date.toLocaleDateString([], {
      weekday: "long",
      month: "short",
      day: "numeric",
    });

    return `${date_str} at ${time_str}`;
  }
}
