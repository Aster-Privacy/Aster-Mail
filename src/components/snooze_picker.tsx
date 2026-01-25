import { useState, useMemo, useCallback } from "react";
import { ClockIcon, CalendarIcon } from "@heroicons/react/24/outline";
import { setHours, setMinutes, isBefore, startOfMinute } from "date-fns";

import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface SnoozePickerProps {
  on_snooze: (snooze_until: Date) => Promise<void>;
  trigger?: React.ReactNode;
  children?: React.ReactNode;
}

const snooze_options = [
  { label: "Later today", hours: 4 },
  { label: "Tomorrow", hours: 24 },
  { label: "This weekend", days: "weekend" },
  { label: "Next week", days: 7 },
  { label: "Next month", days: 30 },
];

function calculate_snooze_date(option: (typeof snooze_options)[0]): Date {
  const now = new Date();

  if (option.hours) {
    return new Date(now.getTime() + option.hours * 60 * 60 * 1000);
  }

  if (option.days === "weekend") {
    const day_of_week = now.getDay();
    const days_until_saturday =
      day_of_week === 6 ? 7 : (6 - day_of_week + 7) % 7;
    const saturday = new Date(now);

    saturday.setDate(now.getDate() + days_until_saturday);
    saturday.setHours(9, 0, 0, 0);

    return saturday;
  }

  if (typeof option.days === "number") {
    const target = new Date(now);

    target.setDate(now.getDate() + option.days);
    target.setHours(9, 0, 0, 0);

    return target;
  }

  return now;
}

function format_snooze_preview(date: Date): string {
  const now = new Date();
  const is_today = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);

  tomorrow.setDate(tomorrow.getDate() + 1);
  const is_tomorrow = date.toDateString() === tomorrow.toDateString();

  const time_str = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (is_today) {
    return `Today, ${time_str}`;
  }

  if (is_tomorrow) {
    return `Tomorrow, ${time_str}`;
  }

  const day_name = date.toLocaleDateString([], { weekday: "short" });
  const month_day = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  return `${day_name}, ${month_day}, ${time_str}`;
}

export function SnoozePicker({
  on_snooze,
  trigger,
  children,
}: SnoozePickerProps) {
  const [is_open, set_is_open] = useState(false);
  const [is_loading, set_is_loading] = useState(false);
  const [show_custom, set_show_custom] = useState(false);
  const [selected_date, set_selected_date] = useState<Date | undefined>(
    undefined,
  );
  const [selected_hour, set_selected_hour] = useState(9);
  const [selected_minute, set_selected_minute] = useState(0);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => [0, 15, 30, 45], []);

  const format_hour = (hour: number) => {
    const period = hour >= 12 ? "PM" : "AM";
    const display_hour = hour % 12 || 12;

    return `${display_hour} ${period}`;
  };

  const is_valid_custom_time = useMemo(() => {
    if (!selected_date) return false;
    const scheduled = setMinutes(
      setHours(selected_date, selected_hour),
      selected_minute,
    );

    return !isBefore(scheduled, startOfMinute(new Date()));
  }, [selected_date, selected_hour, selected_minute]);

  const handle_snooze = async (option: (typeof snooze_options)[0]) => {
    set_is_loading(true);
    try {
      const snooze_date = calculate_snooze_date(option);

      await on_snooze(snooze_date);
      set_is_open(false);
    } finally {
      set_is_loading(false);
    }
  };

  const handle_custom_confirm = useCallback(async () => {
    if (!selected_date || !is_valid_custom_time) return;

    const snooze_date = setMinutes(
      setHours(selected_date, selected_hour),
      selected_minute,
    );

    set_is_loading(true);
    try {
      await on_snooze(snooze_date);
      set_is_open(false);
      set_show_custom(false);
      set_selected_date(undefined);
    } finally {
      set_is_loading(false);
    }
  }, [
    selected_date,
    selected_hour,
    selected_minute,
    is_valid_custom_time,
    on_snooze,
  ]);

  const handle_open_change = useCallback((open: boolean) => {
    set_is_open(open);
    if (!open) {
      set_show_custom(false);
      set_selected_date(undefined);
    }
  }, []);

  return (
    <Popover open={is_open} onOpenChange={handle_open_change}>
      <PopoverTrigger asChild>
        {trigger || children || (
          <Button size="sm" variant="ghost">
            <ClockIcon className="h-4 w-4 mr-2" />
            Snooze
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderColor: "var(--border-primary)",
        }}
      >
        {!show_custom ? (
          <div className="p-2 min-w-[240px]">
            <div className="flex flex-col gap-1">
              {snooze_options.map((option) => {
                const snooze_date = calculate_snooze_date(option);
                const preview = format_snooze_preview(snooze_date);

                return (
                  <Button
                    key={option.label}
                    className="justify-start h-auto py-2 px-3"
                    disabled={is_loading}
                    variant="ghost"
                    onClick={() => handle_snooze(option)}
                  >
                    <ClockIcon className="h-4 w-4 mr-3 flex-shrink-0" />
                    <div className="flex flex-col items-start">
                      <span>{option.label}</span>
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {preview}
                      </span>
                    </div>
                  </Button>
                );
              })}
              <div
                className="my-1 h-px"
                style={{ backgroundColor: "var(--border-secondary)" }}
              />
              <Button
                className="justify-start h-auto py-2 px-3"
                disabled={is_loading}
                variant="ghost"
                onClick={() => set_show_custom(true)}
              >
                <CalendarIcon className="h-4 w-4 mr-3 flex-shrink-0" />
                <div className="flex flex-col items-start">
                  <span>Pick date & time</span>
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Choose a custom time
                  </span>
                </div>
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <button
                className="text-xs font-medium hover:underline"
                style={{ color: "var(--text-muted)" }}
                type="button"
                onClick={() => set_show_custom(false)}
              >
                Back
              </button>
              <span
                className="text-xs font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Pick date & time
              </span>
              <div className="w-8" />
            </div>
            <Calendar
              initialFocus
              disabled={(date) => isBefore(date, startOfMinute(new Date()))}
              mode="single"
              selected={selected_date}
              onSelect={set_selected_date}
            />
            <div
              className="my-3 h-px"
              style={{ backgroundColor: "var(--border-secondary)" }}
            />
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Time:
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-8 w-20" size="sm" variant="outline">
                    {format_hour(selected_hour)}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="max-h-60 overflow-y-auto"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    borderColor: "var(--border-primary)",
                  }}
                >
                  {hours.map((hour) => (
                    <DropdownMenuItem
                      key={hour}
                      onClick={() => set_selected_hour(hour)}
                    >
                      {format_hour(hour)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span style={{ color: "var(--text-muted)" }}>:</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-8 w-16" size="sm" variant="outline">
                    {selected_minute.toString().padStart(2, "0")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    borderColor: "var(--border-primary)",
                  }}
                >
                  {minutes.map((minute) => (
                    <DropdownMenuItem
                      key={minute}
                      onClick={() => set_selected_minute(minute)}
                    >
                      {minute.toString().padStart(2, "0")}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex justify-end mt-4 gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  set_show_custom(false);
                  set_is_open(false);
                }}
              >
                Cancel
              </Button>
              <Button
                className={is_valid_custom_time ? "text-white" : ""}
                disabled={!is_valid_custom_time || is_loading}
                size="sm"
                style={{
                  background: is_valid_custom_time
                    ? "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)"
                    : undefined,
                }}
                onClick={handle_custom_confirm}
              >
                Snooze
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
