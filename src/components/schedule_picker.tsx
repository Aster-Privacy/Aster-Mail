import { useState, useMemo, useCallback } from "react";
import {
  format,
  addDays,
  setHours,
  setMinutes,
  nextMonday,
  isBefore,
  startOfMinute,
} from "date-fns";
import {
  ClockIcon,
  ChevronDownIcon,
  CalendarIcon,
  SunIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface SchedulePickerProps {
  scheduled_time: Date | null;
  on_schedule: (date: Date | null) => void;
  disabled?: boolean;
}

interface QuickOption {
  label: string;
  description: string;
  icon: React.ReactNode;
  get_date: () => Date;
}

function get_tomorrow_morning(): Date {
  const tomorrow = addDays(new Date(), 1);

  return setMinutes(setHours(tomorrow, 8), 0);
}

function get_tomorrow_afternoon(): Date {
  const tomorrow = addDays(new Date(), 1);

  return setMinutes(setHours(tomorrow, 13), 0);
}

function get_next_monday_morning(): Date {
  const monday = nextMonday(new Date());

  return setMinutes(setHours(monday, 8), 0);
}

export function SchedulePicker({
  scheduled_time,
  on_schedule,
  disabled = false,
}: SchedulePickerProps) {
  const [is_open, set_is_open] = useState(false);
  const [show_custom, set_show_custom] = useState(false);
  const [selected_date, set_selected_date] = useState<Date | undefined>(
    scheduled_time || undefined,
  );
  const [selected_hour, set_selected_hour] = useState(
    scheduled_time ? scheduled_time.getHours() : 9,
  );
  const [selected_minute, set_selected_minute] = useState(
    scheduled_time ? scheduled_time.getMinutes() : 0,
  );

  const quick_options: QuickOption[] = useMemo(
    () => [
      {
        label: "Tomorrow morning",
        description: format(get_tomorrow_morning(), "EEE, MMM d 'at' h:mm a"),
        icon: <SunIcon className="w-4 h-4" />,
        get_date: get_tomorrow_morning,
      },
      {
        label: "Tomorrow afternoon",
        description: format(get_tomorrow_afternoon(), "EEE, MMM d 'at' h:mm a"),
        icon: <SunIcon className="w-4 h-4" />,
        get_date: get_tomorrow_afternoon,
      },
      {
        label: "Monday morning",
        description: format(
          get_next_monday_morning(),
          "EEE, MMM d 'at' h:mm a",
        ),
        icon: <CalendarIcon className="w-4 h-4" />,
        get_date: get_next_monday_morning,
      },
    ],
    [],
  );

  const handle_quick_select = useCallback(
    (option: QuickOption) => {
      const date = option.get_date();

      on_schedule(date);
      set_is_open(false);
      set_show_custom(false);
    },
    [on_schedule],
  );

  const handle_custom_confirm = useCallback(() => {
    if (!selected_date) return;

    const scheduled = setMinutes(
      setHours(selected_date, selected_hour),
      selected_minute,
    );

    const now = startOfMinute(new Date());

    if (isBefore(scheduled, now)) {
      return;
    }

    on_schedule(scheduled);
    set_is_open(false);
    set_show_custom(false);
  }, [selected_date, selected_hour, selected_minute, on_schedule]);

  const handle_clear = useCallback(() => {
    on_schedule(null);
    set_selected_date(undefined);
    set_is_open(false);
    set_show_custom(false);
  }, [on_schedule]);

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

  if (scheduled_time) {
    return (
      <div className="flex items-center gap-1">
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium"
          style={{
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            color: "#3b82f6",
          }}
        >
          <ClockIcon className="w-3.5 h-3.5" />
          <span>{format(scheduled_time, "MMM d 'at' h:mm a")}</span>
          <button
            className="ml-0.5 hover:bg-blue-500/20 rounded p-0.5 transition-colors"
            type="button"
            onClick={handle_clear}
          >
            <XMarkIcon className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <Popover open={is_open} onOpenChange={set_is_open}>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            "h-8 gap-1.5 px-2.5 text-xs font-medium",
            "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          )}
          disabled={disabled}
          size="sm"
          variant="ghost"
        >
          <ClockIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Schedule</span>
          <ChevronDownIcon className="w-3 h-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-auto p-0"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderColor: "var(--border-primary)",
        }}
      >
        {!show_custom ? (
          <div className="p-2 min-w-[280px]">
            <div className="px-2 py-1.5 mb-1">
              <span
                className="text-xs font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Schedule send
              </span>
            </div>
            {quick_options.map((option) => (
              <button
                key={option.label}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                type="button"
                onClick={() => handle_quick_select(option)}
              >
                <span style={{ color: "var(--text-muted)" }}>
                  {option.icon}
                </span>
                <div className="flex-1 text-left">
                  <div
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {option.label}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {option.description}
                  </div>
                </div>
              </button>
            ))}
            <div
              className="my-2 h-px"
              style={{ backgroundColor: "var(--border-secondary)" }}
            />
            <button
              className="w-full flex items-center gap-3 px-2 py-2 rounded-md transition-colors hover:bg-[var(--bg-hover)]"
              type="button"
              onClick={() => set_show_custom(true)}
            >
              <span style={{ color: "var(--text-muted)" }}>
                <CalendarIcon className="w-4 h-4" />
              </span>
              <div className="flex-1 text-left">
                <div
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Pick date & time
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Choose a specific time
                </div>
              </div>
            </button>
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
                disabled={!is_valid_custom_time}
                size="sm"
                style={{
                  background: is_valid_custom_time
                    ? "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)"
                    : undefined,
                }}
                onClick={handle_custom_confirm}
              >
                Schedule
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
