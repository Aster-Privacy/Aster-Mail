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
  CalendarIcon,
  SunIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@aster/ui";

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
} from "@/components/ui/dropdown_menu";
import { use_i18n } from "@/lib/i18n/context";

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
  const { t } = use_i18n();
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
        label: t("common.tomorrow_morning"),
        description: format(get_tomorrow_morning(), "EEE, MMM d 'at' h:mm a"),
        icon: <SunIcon className="w-4 h-4" />,
        get_date: get_tomorrow_morning,
      },
      {
        label: t("common.tomorrow_afternoon"),
        description: format(get_tomorrow_afternoon(), "EEE, MMM d 'at' h:mm a"),
        icon: <SunIcon className="w-4 h-4" />,
        get_date: get_tomorrow_afternoon,
      },
      {
        label: t("common.monday_morning"),
        description: format(
          get_next_monday_morning(),
          "EEE, MMM d 'at' h:mm a",
        ),
        icon: <CalendarIcon className="w-4 h-4" />,
        get_date: get_next_monday_morning,
      },
    ],
    [t],
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
    const period = hour >= 12 ? t("common.pm") : t("common.am");
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
            color: "var(--color-info)",
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
      <Tooltip tip={t("mail.schedule_send")}>
        <PopoverTrigger asChild>
          <button
            className="h-8 w-8 p-0 inline-flex items-center justify-center rounded transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/10 text-txt-secondary hover:text-txt-primary disabled:opacity-50"
            disabled={disabled}
            type="button"
          >
            <ClockIcon className="w-4 h-4" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-auto p-0 bg-surf-primary border-edge-primary"
        side="top"
      >
        {!show_custom ? (
          <div className="p-2 min-w-[280px]">
            <div className="px-2 py-1.5 mb-1">
              <span className="text-xs font-medium text-txt-muted">
                {t("mail.schedule_send")}
              </span>
            </div>
            {quick_options.map((option) => (
              <button
                key={option.label}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-[14px] transition-colors hover:bg-surf-hover"
                type="button"
                onClick={() => handle_quick_select(option)}
              >
                <span className="text-txt-muted">{option.icon}</span>
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium text-txt-primary">
                    {option.label}
                  </div>
                  <div className="text-xs text-txt-muted">
                    {option.description}
                  </div>
                </div>
              </button>
            ))}
            <div className="my-2 h-px bg-edge-secondary" />
            <button
              className="w-full flex items-center gap-3 px-2 py-2 rounded-[14px] transition-colors hover:bg-surf-hover"
              type="button"
              onClick={() => set_show_custom(true)}
            >
              <span className="text-txt-muted">
                <CalendarIcon className="w-4 h-4" />
              </span>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-txt-primary">
                  {t("mail.pick_date_time")}
                </div>
                <div className="text-xs text-txt-muted">
                  {t("common.choose_specific_time")}
                </div>
              </div>
            </button>
          </div>
        ) : (
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <button
                className="text-xs font-medium hover:underline text-txt-muted"
                type="button"
                onClick={() => set_show_custom(false)}
              >
                {t("common.back")}
              </button>
              <span className="text-xs font-medium text-txt-primary">
                {t("mail.pick_date_time")}
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
            <div className="my-3 h-px bg-edge-secondary" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-txt-muted">
                {t("common.time_label")}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-8 w-20" size="md" variant="outline">
                    {format_hour(selected_hour)}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-60 overflow-y-auto bg-surf-primary border-edge-primary">
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
              <span className="text-txt-muted">:</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-8 w-16" size="md" variant="outline">
                    {selected_minute.toString().padStart(2, "0")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-60 overflow-y-auto bg-surf-primary border-edge-primary">
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
            <div className="flex mt-4 gap-2">
              <Button
                size="md"
                variant="ghost"
                onClick={() => {
                  set_show_custom(false);
                  set_is_open(false);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="flex-1"
                disabled={!is_valid_custom_time}
                size="md"
                variant="depth"
                onClick={handle_custom_confirm}
              >
                {t("mail.schedule")}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
