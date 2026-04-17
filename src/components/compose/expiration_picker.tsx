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
  addHours,
  addDays,
  setHours,
  setMinutes,
  isBefore,
  startOfMinute,
} from "date-fns";
import {
  ClockIcon,
  CalendarIcon,
  FireIcon,
  XMarkIcon,
  LockClosedIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@aster/ui";

import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
} from "@/components/ui/alert_dialog";
import { use_i18n } from "@/lib/i18n/context";

interface ExpirationPickerProps {
  expires_at: Date | null;
  on_expiration_change: (date: Date | null) => void;
  password: string | null;
  on_password_change: (password: string | null) => void;
  show_password_option?: boolean;
  disabled?: boolean;
}

interface QuickOption {
  label: string;
  description: string;
  icon: React.ReactNode;
  get_date: () => Date;
}

function get_one_hour(): Date {
  return addHours(new Date(), 1);
}

function get_twenty_four_hours(): Date {
  return addHours(new Date(), 24);
}

function get_seven_days(): Date {
  return addDays(new Date(), 7);
}

export function ExpirationPicker({
  expires_at,
  on_expiration_change,
  password,
  on_password_change,
  show_password_option = false,
  disabled = false,
}: ExpirationPickerProps) {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);
  const [show_custom, set_show_custom] = useState(false);
  const [show_password_dialog, set_show_password_dialog] = useState(false);
  const [selected_date, set_selected_date] = useState<Date | undefined>(
    expires_at || undefined,
  );
  const [selected_hour, set_selected_hour] = useState(
    expires_at ? expires_at.getHours() : 12,
  );
  const [selected_minute, set_selected_minute] = useState(
    expires_at ? expires_at.getMinutes() : 0,
  );
  const [password_input, set_password_input] = useState(password || "");

  const quick_options: QuickOption[] = useMemo(
    () => [
      {
        label: t("mail.one_hour_option"),
        description: format(get_one_hour(), "h:mm a"),
        icon: <ClockIcon className="w-4 h-4" />,
        get_date: get_one_hour,
      },
      {
        label: t("mail.twenty_four_hours_option"),
        description: format(get_twenty_four_hours(), "EEE, h:mm a"),
        icon: <ClockIcon className="w-4 h-4" />,
        get_date: get_twenty_four_hours,
      },
      {
        label: t("mail.seven_days_option"),
        description: format(get_seven_days(), "EEE, MMM d"),
        icon: <CalendarIcon className="w-4 h-4" />,
        get_date: get_seven_days,
      },
    ],
    [t],
  );

  const handle_quick_select = useCallback(
    (option: QuickOption) => {
      const date = option.get_date();

      on_expiration_change(date);
      set_is_open(false);
      set_show_custom(false);
    },
    [on_expiration_change],
  );

  const handle_custom_confirm = useCallback(() => {
    if (!selected_date) return;

    const expiry = setMinutes(
      setHours(selected_date, selected_hour),
      selected_minute,
    );

    const now = startOfMinute(new Date());

    if (isBefore(expiry, now)) {
      return;
    }

    on_expiration_change(expiry);
    set_is_open(false);
    set_show_custom(false);
  }, [selected_date, selected_hour, selected_minute, on_expiration_change]);

  const handle_clear = useCallback(() => {
    on_expiration_change(null);
    on_password_change(null);
    set_selected_date(undefined);
    set_password_input("");
    set_is_open(false);
    set_show_custom(false);
  }, [on_expiration_change, on_password_change]);

  const handle_password_save = useCallback(() => {
    if (password_input.trim()) {
      on_password_change(password_input.trim());
    } else {
      on_password_change(null);
    }
    set_show_password_dialog(false);
  }, [password_input, on_password_change]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  const minutes = useMemo(() => [0, 15, 30, 45], []);

  const format_hour = (hour: number) => {
    const period = hour >= 12 ? t("common.pm") : t("common.am");
    const display_hour = hour % 12 || 12;

    return `${display_hour} ${period}`;
  };

  const is_valid_custom_time = useMemo(() => {
    if (!selected_date) return false;
    const expiry = setMinutes(
      setHours(selected_date, selected_hour),
      selected_minute,
    );

    return !isBefore(expiry, startOfMinute(new Date()));
  }, [selected_date, selected_hour, selected_minute]);

  const format_relative_time = (date: Date): string => {
    const now = new Date();
    const diff_ms = date.getTime() - now.getTime();
    const diff_hours = Math.floor(diff_ms / (1000 * 60 * 60));
    const diff_days = Math.floor(diff_hours / 24);

    if (diff_days > 0) {
      return `${diff_days}d ${diff_hours % 24}h`;
    }
    if (diff_hours > 0) {
      const diff_minutes = Math.floor(
        (diff_ms % (1000 * 60 * 60)) / (1000 * 60),
      );

      return `${diff_hours}h ${diff_minutes}m`;
    }
    const diff_minutes = Math.floor(diff_ms / (1000 * 60));

    return `${diff_minutes}m`;
  };

  if (expires_at) {
    return (
      <div className="flex items-center gap-1">
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "var(--color-danger)",
          }}
        >
          <FireIcon className="w-3.5 h-3.5" />
          <span>
            {t("common.expires_in")}
            {format_relative_time(expires_at)}
          </span>
          {password && <LockClosedIcon className="w-3 h-3 ml-0.5" />}
          <button
            className="ml-0.5 hover:bg-red-500/20 rounded p-0.5 transition-colors"
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
    <>
      <Popover open={is_open} onOpenChange={set_is_open}>
        <Tooltip tip={t("mail.self_destruct")}>
          <PopoverTrigger asChild>
            <button
              className="h-8 w-8 p-0 inline-flex items-center justify-center rounded transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/10 text-txt-secondary hover:text-txt-primary disabled:opacity-50"
              disabled={disabled}
              type="button"
            >
              <FireIcon className="w-4 h-4" />
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
                  {t("mail.self_destruct_after")}
                </span>
              </div>
              {quick_options.map((option) => (
                <button
                  key={option.label}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-md transition-colors hover:bg-surf-hover"
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
                className="w-full flex items-center gap-3 px-2 py-2 rounded-md transition-colors hover:bg-surf-hover"
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
                    {t("common.choose_specific_expiration")}
                  </div>
                </div>
              </button>
              {show_password_option && (
                <>
                  <div className="my-2 h-px bg-edge-secondary" />
                  <button
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-md transition-colors hover:bg-surf-hover"
                    type="button"
                    onClick={() => {
                      set_is_open(false);
                      set_show_password_dialog(true);
                    }}
                  >
                    <span className="text-txt-muted">
                      {password ? (
                        <LockClosedIcon className="w-4 h-4" />
                      ) : (
                        <EyeIcon className="w-4 h-4" />
                      )}
                    </span>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium text-txt-primary">
                        {password
                          ? t("settings.change_password")
                          : t("mail.add_password")}
                      </div>
                      <div className="text-xs text-txt-muted">
                        {password
                          ? t("common.password_protected")
                          : t("mail.require_password_to_view")}
                      </div>
                    </div>
                  </button>
                </>
              )}
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
                  {t("mail.pick_expiration")}
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
              <div className="flex justify-end mt-4 gap-2">
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
                  disabled={!is_valid_custom_time}
                  size="md"
                  variant="depth"
                  onClick={handle_custom_confirm}
                >
                  {t("mail.set_expiration")}
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <AlertDialog
        open={show_password_dialog}
        onOpenChange={set_show_password_dialog}
      >
        <AlertDialogContent className="p-0 gap-0">
          <AlertDialogHeader className="p-4 pb-3">
            <AlertDialogTitle>
              {password
                ? t("settings.change_password")
                : t("settings.set_password")}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="px-4 pb-4">
            <p className="text-sm mb-3 text-txt-muted">
              {t("mail.password_description")}
            </p>
            <Input
              autoFocus
              placeholder={t("mail.enter_password_placeholder")}
              type="password"
              value={password_input}
              onChange={(e) => set_password_input(e.target.value)}
            />
          </div>
          <AlertDialogFooter className="flex-row gap-3 px-4 pb-4 sm:justify-end">
            <Button
              className="max-sm:flex-1"
              size="md"
              variant="ghost"
              onClick={() => {
                set_password_input(password || "");
                set_show_password_dialog(false);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="max-sm:flex-1"
              size="md"
              onClick={handle_password_save}
            >
              {password_input.trim()
                ? t("settings.set_password")
                : t("mail.no_password")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
