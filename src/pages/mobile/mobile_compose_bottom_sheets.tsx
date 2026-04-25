//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { SenderOption } from "@/hooks/use_sender_aliases";
import type { TranslationKey } from "@/lib/i18n/types";

import { useState, useMemo, useCallback } from "react";
import {
  XMarkIcon,
  ClockIcon,
  SunIcon,
  CalendarIcon,
  CheckIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import {
  format,
  addDays,
  addHours,
  setHours,
  setMinutes,
  nextMonday,
  isBefore,
  startOfMinute,
} from "date-fns";
import { Button } from "@aster/ui";

import {
  MobileSenderIcon,
  sender_type_label,
  sender_type_color,
} from "./mobile_compose_helpers";

import { MobileBottomSheet } from "@/components/mobile/mobile_bottom_sheet";
import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";

export function MobileSenderSheet({
  is_open,
  on_close,
  sender_options,
  current_sender,
  on_select,
  t,
}: {
  is_open: boolean;
  on_close: () => void;
  sender_options: SenderOption[];
  current_sender: SenderOption | undefined;
  on_select: (sender: SenderOption) => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <MobileBottomSheet is_open={is_open} on_close={on_close}>
      <div className="px-4 pb-4">
        <h3 className="mb-3 text-[16px] font-semibold text-[var(--text-primary)]">
          {t("mail.from")}
        </h3>
        <div className="space-y-1">
          {sender_options.map((sender) => (
            <button
              key={sender.id}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
              type="button"
              onClick={() => on_select(sender)}
            >
              <MobileSenderIcon option={sender} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-[var(--text-primary)]">
                    {sender.display_name || sender.email}
                  </span>
                  {sender.type !== "primary" && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${sender_type_color(sender.type)}`}
                    >
                      {sender_type_label(sender.type, t)}
                    </span>
                  )}
                </div>
                {sender.display_name && (
                  <p className="truncate text-[12px] text-[var(--text-muted)]">
                    {sender.email}
                  </p>
                )}
              </div>
              {current_sender?.id === sender.id && (
                <CheckIcon className="h-5 w-5 shrink-0 text-blue-500" />
              )}
            </button>
          ))}
        </div>
      </div>
    </MobileBottomSheet>
  );
}

export function MobileScheduleSheet({
  is_open,
  on_close,
  on_schedule,
  on_clear,
  has_scheduled_time,
  t,
}: {
  is_open: boolean;
  on_close: () => void;
  on_schedule: (date: Date) => void;
  on_clear: () => void;
  has_scheduled_time: boolean;
  t: (key: TranslationKey) => string;
}) {
  const [show_custom, set_show_custom] = useState(false);
  const [schedule_date, set_schedule_date] = useState("");
  const [schedule_time, set_schedule_time] = useState("09:00");

  const quick_options = useMemo(() => {
    const tomorrow = addDays(new Date(), 1);
    const tomorrow_morning = setMinutes(setHours(tomorrow, 8), 0);
    const tomorrow_afternoon = setMinutes(setHours(tomorrow, 13), 0);
    const monday_morning = setMinutes(setHours(nextMonday(new Date()), 8), 0);

    return [
      {
        label: t("common.tomorrow_morning"),
        description: format(tomorrow_morning, "EEE, MMM d 'at' h:mm a"),
        date: tomorrow_morning,
        icon: <SunIcon className="h-5 w-5" />,
      },
      {
        label: t("common.tomorrow_afternoon"),
        description: format(tomorrow_afternoon, "EEE, MMM d 'at' h:mm a"),
        date: tomorrow_afternoon,
        icon: <SunIcon className="h-5 w-5" />,
      },
      {
        label: t("common.monday_morning"),
        description: format(monday_morning, "EEE, MMM d 'at' h:mm a"),
        date: monday_morning,
        icon: <CalendarIcon className="h-5 w-5" />,
      },
    ];
  }, [t]);

  const handle_custom_confirm = useCallback(() => {
    if (!schedule_date) return;
    const [year, month, day] = schedule_date.split("-").map(Number);
    const [hour, minute] = schedule_time.split(":").map(Number);
    const date = new Date(year, month - 1, day, hour, minute);

    if (isBefore(date, startOfMinute(new Date()))) return;
    on_schedule(date);
    set_show_custom(false);
  }, [on_schedule, schedule_date, schedule_time]);

  const handle_close = useCallback(() => {
    set_show_custom(false);
    on_close();
  }, [on_close]);

  return (
    <MobileBottomSheet is_open={is_open} on_close={handle_close}>
      <div className="px-4 pb-4">
        <h3 className="mb-3 text-[16px] font-semibold text-[var(--text-primary)]">
          {t("mail.schedule_send")}
        </h3>

        {!show_custom ? (
          <div className="space-y-1">
            {quick_options.map((opt) => (
              <button
                key={opt.label}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-[var(--bg-tertiary)]"
                type="button"
                onClick={() => {
                  on_schedule(opt.date);
                  set_show_custom(false);
                }}
              >
                <span className="text-[var(--text-muted)]">{opt.icon}</span>
                <div className="flex-1">
                  <p className="text-[14px] font-medium text-[var(--text-primary)]">
                    {opt.label}
                  </p>
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {opt.description}
                  </p>
                </div>
              </button>
            ))}
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-[var(--bg-tertiary)]"
              type="button"
              onClick={() => set_show_custom(true)}
            >
              <span className="text-[var(--text-muted)]">
                <CalendarIcon className="h-5 w-5" />
              </span>
              <p className="text-[14px] font-medium text-[var(--text-primary)]">
                {t("mail.pick_date_time")}
              </p>
            </button>
            {has_scheduled_time && (
              <button
                className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-[14px] font-medium text-red-500 active:bg-[var(--bg-tertiary)]"
                type="button"
                onClick={() => {
                  on_clear();
                  handle_close();
                }}
              >
                <XMarkIcon className="h-4 w-4" />
                {t("common.clear")}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                {t("common.date_label")}
              </label>
              <Input
                className="w-full"
                min={format(new Date(), "yyyy-MM-dd")}
                type="date"
                value={schedule_date}
                onChange={(e) => set_schedule_date(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                {t("common.time_label")}
              </label>
              <Input
                className="w-full"
                type="time"
                value={schedule_time}
                onChange={(e) => set_schedule_time(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1"
                size="md"
                variant="outline"
                onClick={() => set_show_custom(false)}
              >
                {t("common.back")}
              </Button>
              <Button
                className="flex-1"
                disabled={!schedule_date}
                size="md"
                variant="depth"
                onClick={handle_custom_confirm}
              >
                {t("common.confirm")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </MobileBottomSheet>
  );
}

export function MobileExpirationSheet({
  is_open,
  on_close,
  on_set_expiration,
  on_clear,
  on_save_password,
  has_expires_at,
  has_external_recipients,
  expiry_password,
  t,
}: {
  is_open: boolean;
  on_close: () => void;
  on_set_expiration: (date: Date) => void;
  on_clear: () => void;
  on_save_password: (password: string | null) => void;
  has_expires_at: boolean;
  has_external_recipients: boolean;
  expiry_password: string | null;
  t: (key: TranslationKey) => string;
}) {
  const [show_custom, set_show_custom] = useState(false);
  const [show_password, set_show_password] = useState(false);
  const [password_input, set_password_input] = useState("");
  const [expiration_date, set_expiration_date] = useState("");
  const [expiration_time, set_expiration_time] = useState("12:00");

  const quick_options = useMemo(() => {
    const one_hour = addHours(new Date(), 1);
    const twenty_four = addHours(new Date(), 24);
    const seven_days = addDays(new Date(), 7);

    return [
      {
        label: t("mail.one_hour_option"),
        description: format(one_hour, "h:mm a"),
        date: one_hour,
        icon: <ClockIcon className="h-5 w-5" />,
      },
      {
        label: t("mail.twenty_four_hours_option"),
        description: format(twenty_four, "EEE, h:mm a"),
        date: twenty_four,
        icon: <ClockIcon className="h-5 w-5" />,
      },
      {
        label: t("mail.seven_days_option"),
        description: format(seven_days, "EEE, MMM d"),
        date: seven_days,
        icon: <CalendarIcon className="h-5 w-5" />,
      },
    ];
  }, [t]);

  const handle_custom_confirm = useCallback(() => {
    if (!expiration_date) return;
    const [year, month, day] = expiration_date.split("-").map(Number);
    const [hour, minute] = expiration_time.split(":").map(Number);
    const date = new Date(year, month - 1, day, hour, minute);

    if (isBefore(date, startOfMinute(new Date()))) return;
    on_set_expiration(date);
    set_show_custom(false);
  }, [on_set_expiration, expiration_date, expiration_time]);

  const handle_close = useCallback(() => {
    set_show_custom(false);
    set_show_password(false);
    on_close();
  }, [on_close]);

  return (
    <MobileBottomSheet is_open={is_open} on_close={handle_close}>
      <div className="px-4 pb-4">
        <h3 className="mb-3 text-[16px] font-semibold text-[var(--text-primary)]">
          {t("mail.set_expiration")}
        </h3>

        {!show_custom && !show_password ? (
          <div className="space-y-1">
            {quick_options.map((opt) => (
              <button
                key={opt.label}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-[var(--bg-tertiary)]"
                type="button"
                onClick={() => {
                  on_set_expiration(opt.date);
                  set_show_custom(false);
                }}
              >
                <span className="text-[var(--text-muted)]">{opt.icon}</span>
                <div className="flex-1">
                  <p className="text-[14px] font-medium text-[var(--text-primary)]">
                    {opt.label}
                  </p>
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {opt.description}
                  </p>
                </div>
              </button>
            ))}
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-[var(--bg-tertiary)]"
              type="button"
              onClick={() => set_show_custom(true)}
            >
              <span className="text-[var(--text-muted)]">
                <CalendarIcon className="h-5 w-5" />
              </span>
              <p className="text-[14px] font-medium text-[var(--text-primary)]">
                {t("mail.pick_date_time")}
              </p>
            </button>
            {has_external_recipients && (
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-[var(--bg-tertiary)]"
                type="button"
                onClick={() => {
                  set_password_input(expiry_password ?? "");
                  set_show_password(true);
                }}
              >
                <span className="text-[var(--text-muted)]">
                  <LockClosedIcon className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <p className="text-[14px] font-medium text-[var(--text-primary)]">
                    {expiry_password
                      ? t("common.change_password_label")
                      : t("common.set_password_label")}
                  </p>
                  {expiry_password && (
                    <p className="text-[12px] text-[var(--text-muted)]">
                      {t("common.password_set")}
                    </p>
                  )}
                </div>
              </button>
            )}
            {has_expires_at && (
              <button
                className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-[14px] font-medium text-red-500 active:bg-[var(--bg-tertiary)]"
                type="button"
                onClick={() => {
                  on_clear();
                  handle_close();
                }}
              >
                <XMarkIcon className="h-4 w-4" />
                {t("common.clear")}
              </button>
            )}
          </div>
        ) : show_password ? (
          <div className="space-y-3">
            <p className="text-[13px] text-[var(--text-muted)]">
              {t("common.require_password_expiry")}
            </p>
            <Input
              autoFocus
              className="w-full"
              placeholder={t("common.enter_password_optional")}
              type="text"
              value={password_input}
              onChange={(e) => set_password_input(e.target.value)}
            />
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1"
                size="md"
                variant="outline"
                onClick={() => set_show_password(false)}
              >
                {t("common.back")}
              </Button>
              <Button
                className="flex-1"
                size="md"
                variant="depth"
                onClick={() => {
                  const trimmed = password_input.trim();

                  on_save_password(trimmed || null);
                  set_show_password(false);
                }}
              >
                {t("common.save")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                {t("common.date_label")}
              </label>
              <Input
                className="w-full"
                min={format(new Date(), "yyyy-MM-dd")}
                type="date"
                value={expiration_date}
                onChange={(e) => set_expiration_date(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                {t("common.time_label")}
              </label>
              <Input
                className="w-full"
                type="time"
                value={expiration_time}
                onChange={(e) => set_expiration_time(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1"
                size="md"
                variant="outline"
                onClick={() => set_show_custom(false)}
              >
                {t("common.back")}
              </Button>
              <Button
                className="flex-1"
                disabled={!expiration_date}
                size="md"
                variant="depth"
                onClick={handle_custom_confirm}
              >
                {t("common.confirm")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </MobileBottomSheet>
  );
}

export function MobileGhostSheet({
  is_open,
  on_close,
  ghost_mode,
}: {
  is_open: boolean;
  on_close: () => void;
  ghost_mode: {
    is_ghost_enabled: boolean;
    is_creating: boolean;
    ghost_sender: { email: string } | null;
    ghost_expiry_days: number;
    toggle_ghost_mode: () => void;
    set_ghost_expiry_days: (days: number) => void;
    error: string | null;
  };
}) {
  const { t } = use_i18n();

  return (
    <MobileBottomSheet is_open={is_open} on_close={on_close}>
      <div className="px-4 pb-4">
        <h3 className="mb-3 text-[16px] font-semibold text-[var(--text-primary)]">
          {t("common.ghost_mode_title")}
        </h3>
        <p className="mb-4 text-[13px] text-[var(--text-muted)]">
          {t("common.ghost_mode_description")}
        </p>
        <div
          className="mb-4 flex items-center justify-between rounded-xl px-4 py-3"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          <span className="text-[14px] text-[var(--text-primary)]">
            {ghost_mode.is_ghost_enabled
              ? t("common.enabled")
              : t("common.disabled")}
          </span>
          <button
            className={`relative h-7 w-12 rounded-full transition-colors ${ghost_mode.is_ghost_enabled ? "bg-purple-500" : "bg-[var(--bg-tertiary)]"}`}
            disabled={ghost_mode.is_creating}
            type="button"
            onClick={() => {
              ghost_mode.toggle_ghost_mode();
              if (ghost_mode.is_ghost_enabled) {
                on_close();
              }
            }}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${ghost_mode.is_ghost_enabled ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </button>
        </div>
        {ghost_mode.is_ghost_enabled && ghost_mode.ghost_sender && (
          <div
            className="mb-4 rounded-xl px-4 py-3"
            style={{ backgroundColor: "rgba(168, 85, 247, 0.08)" }}
          >
            <span className="text-[12px] text-purple-400">
              {t("common.sending_as")}
            </span>
            <p className="text-[14px] font-medium text-purple-500">
              {ghost_mode.ghost_sender.email}
            </p>
          </div>
        )}
        <div className="space-y-1">
          <span className="text-[12px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {t("common.auto_expire_after")}
          </span>
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              className="flex w-full items-center justify-between rounded-xl px-4 py-3 active:bg-[var(--bg-tertiary)]"
              type="button"
              onClick={() => ghost_mode.set_ghost_expiry_days(days)}
            >
              <span className="text-[14px] text-[var(--text-primary)]">
                {t("common.n_days", { count: days })}
              </span>
              {ghost_mode.ghost_expiry_days === days && (
                <CheckIcon className="h-5 w-5 text-purple-500" />
              )}
            </button>
          ))}
        </div>
        {ghost_mode.error && (
          <p className="mt-3 text-[13px] text-red-400">{ghost_mode.error}</p>
        )}
      </div>
    </MobileBottomSheet>
  );
}
