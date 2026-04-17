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
import { useCallback, useEffect, useState, useMemo } from "react";
import { format, setHours, setMinutes, startOfDay } from "date-fns";
import { Checkbox } from "@aster/ui";
import { Button } from "@aster/ui";
import { CalendarIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";
import { show_toast } from "@/components/toast/simple_toast";
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
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  get_vacation_reply,
  upsert_vacation_reply,
  delete_vacation_reply,
  toggle_vacation_reply,
  type VacationReplyResponse,
} from "@/services/api/vacation_reply";
import { UpgradeGate } from "@/components/common/upgrade_gate";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function format_hour(hour: number, am: string, pm: string) {
  const period = hour >= 12 ? pm : am;
  const display = hour % 12 || 12;

  return `${display} ${period}`;
}

interface VacationDatePickerProps {
  label: string;
  date: Date | null;
  hour: number;
  minute: number;
  on_date_change: (date: Date | null) => void;
  on_hour_change: (hour: number) => void;
  on_minute_change: (minute: number) => void;
  on_clear: () => void;
}

function VacationDatePicker({
  label,
  date,
  hour,
  minute,
  on_date_change,
  on_hour_change,
  on_minute_change,
  on_clear,
}: VacationDatePickerProps) {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);

  const display_text = useMemo(() => {
    if (!date) return t("common.select_date");
    const full = setMinutes(setHours(date, hour), minute);

    return format(full, "MMM d, yyyy 'at' h:mm a");
  }, [date, hour, minute, t]);

  return (
    <div>
      <label
        className="mb-1.5 block text-sm font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </label>
      <Popover open={is_open} onOpenChange={set_is_open}>
        <PopoverTrigger asChild>
          <button
            className="w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-left transition-colors"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-primary)",
              color: date ? "var(--text-primary)" : "var(--text-muted)",
            }}
            type="button"
          >
            <CalendarIcon className="w-4 h-4 flex-shrink-0 opacity-60" />
            <span className="flex-1 truncate">{display_text}</span>
            {date && (
              <span
                className="text-xs opacity-60 hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  on_clear();
                }}
              >
                ✕
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto min-w-[280px] p-0 bg-surf-primary border-edge-primary z-[70]"
          side="bottom"
          sideOffset={4}
        >
          <div className="p-3">
            <Calendar
              mode="single"
              selected={date ?? undefined}
              onSelect={(d) => {
                if (d) {
                  on_date_change(startOfDay(d));
                }
              }}
            />
            <div className="my-3 h-px bg-edge-secondary" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-txt-muted shrink-0">
                {t("common.time_label")}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="h-8 min-w-[76px] px-2 text-sm"
                    size="md"
                    variant="outline"
                  >
                    {format_hour(hour, t("common.am"), t("common.pm"))}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-52 overflow-y-auto bg-surf-primary border-edge-primary z-[80]">
                  {HOURS.map((h) => (
                    <DropdownMenuItem key={h} onClick={() => on_hour_change(h)}>
                      {format_hour(h, t("common.am"), t("common.pm"))}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-txt-muted">:</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="h-8 min-w-[56px] px-2 text-sm"
                    size="md"
                    variant="outline"
                  >
                    {minute.toString().padStart(2, "0")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-52 overflow-y-auto bg-surf-primary border-edge-primary z-[80]">
                  {MINUTES.map((m) => (
                    <DropdownMenuItem
                      key={m}
                      onClick={() => on_minute_change(m)}
                    >
                      {m.toString().padStart(2, "0")}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="mt-3">
              <Button
                className="w-full"
                size="md"
                onClick={() => set_is_open(false)}
              >
                {t("common.done")}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function VacationReplySection() {
  const { t } = use_i18n();
  const { is_feature_locked } = use_plan_limits();
  const [vacation, set_vacation] = useState<VacationReplyResponse | null>(null);
  const [is_loading, set_is_loading] = useState(true);
  const [is_saving, set_is_saving] = useState(false);
  const [is_deleting, set_is_deleting] = useState(false);
  const [is_editor_open, set_is_editor_open] = useState(false);

  const [subject, set_subject] = useState("");
  const [body, set_body] = useState("");
  const [is_enabled, set_is_enabled] = useState(false);
  const [start_date, set_start_date] = useState<Date | null>(null);
  const [start_hour, set_start_hour] = useState(9);
  const [start_minute, set_start_minute] = useState(0);
  const [end_date, set_end_date] = useState<Date | null>(null);
  const [end_hour, set_end_hour] = useState(17);
  const [end_minute, set_end_minute] = useState(0);
  const [external_only, set_external_only] = useState(false);

  const load_vacation = useCallback(async () => {
    try {
      const result = await get_vacation_reply();

      if (result.data) {
        set_vacation(result.data);
      }
    } catch {
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    load_vacation();
  }, [load_vacation]);

  const populate_form_from_vacation = useCallback(
    (data: VacationReplyResponse | null) => {
      if (data) {
        set_subject(data.subject);
        set_body(data.body);
        set_is_enabled(data.is_enabled);
        if (data.start_date) {
          const sd = new Date(data.start_date);

          set_start_date(sd);
          set_start_hour(sd.getHours());
          set_start_minute(sd.getMinutes());
        } else {
          set_start_date(null);
          set_start_hour(9);
          set_start_minute(0);
        }
        if (data.end_date) {
          const ed = new Date(data.end_date);

          set_end_date(ed);
          set_end_hour(ed.getHours());
          set_end_minute(ed.getMinutes());
        } else {
          set_end_date(null);
          set_end_hour(17);
          set_end_minute(0);
        }
        set_external_only(data.external_only);
      } else {
        set_subject("");
        set_body("");
        set_is_enabled(false);
        set_start_date(null);
        set_start_hour(9);
        set_start_minute(0);
        set_end_date(null);
        set_end_hour(17);
        set_end_minute(0);
        set_external_only(false);
      }
    },
    [],
  );

  const open_editor = useCallback(() => {
    populate_form_from_vacation(vacation);
    set_is_editor_open(true);
  }, [vacation, populate_form_from_vacation]);

  const handle_save = useCallback(async () => {
    if (!subject.trim() || !body.trim()) return;
    set_is_saving(true);
    try {
      const format_ymd = (d: Date): string => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");

        return `${y}-${m}-${day}`;
      };
      const start_ymd = start_date
        ? format_ymd(setMinutes(setHours(start_date, start_hour), start_minute))
        : null;
      const end_ymd = end_date
        ? format_ymd(setMinutes(setHours(end_date, end_hour), end_minute))
        : null;
      const result = await upsert_vacation_reply({
        subject: subject.trim(),
        body: body.trim(),
        is_enabled,
        start_date: start_ymd,
        end_date: end_ymd,
        external_only,
      });

      if (result.data) {
        set_vacation(result.data);
        show_toast(t("settings.vacation_reply_saved"), "success");
        set_is_editor_open(false);
      } else if (result.error) {
        show_toast(result.error, "error");
      }
    } finally {
      set_is_saving(false);
    }
  }, [
    subject,
    body,
    is_enabled,
    start_date,
    start_hour,
    start_minute,
    end_date,
    end_hour,
    end_minute,
    external_only,
    t,
  ]);

  const handle_delete = useCallback(async () => {
    set_is_deleting(true);
    try {
      const result = await delete_vacation_reply();

      if (result.data?.success) {
        set_vacation(null);
        show_toast(t("settings.vacation_reply_deleted"), "success");
        set_is_editor_open(false);
      }
    } finally {
      set_is_deleting(false);
    }
  }, [t]);

  const handle_toggle = useCallback(
    async (enabled: boolean) => {
      set_is_enabled(enabled);
      if (vacation) {
        const result = await toggle_vacation_reply(enabled);

        if (result.data) {
          set_vacation(result.data);
          show_toast(
            enabled
              ? t("settings.vacation_reply_toggled_on")
              : t("settings.vacation_reply_toggled_off"),
            "success",
          );
        } else if (result.error) {
          set_is_enabled(!enabled);
          show_toast(result.error, "error");
        }
      }
    },
    [vacation, t],
  );

  if (is_loading) {
    return <SettingsSkeleton variant="form" />;
  }

  return (
    <UpgradeGate
      description={t("settings.vacation_reply_locked")}
      feature_name={t("settings.vacation_reply_title")}
      is_locked={is_feature_locked("has_vacation_reply")}
      min_plan="Star"
    >
      <div className="space-y-4">
        <div>
          <div className="mb-4">
            <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
              <PaperAirplaneIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
              {t("settings.vacation_reply_title")}
            </h3>
            <div className="mt-2 h-px bg-edge-secondary" />
          </div>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            {t("settings.vacation_reply_description")}
          </p>
        </div>

        {vacation && (
          <div
            className="flex items-center justify-between rounded-lg p-3"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: vacation.is_enabled
                    ? "rgb(34, 197, 94)"
                    : "rgb(245, 158, 11)",
                }}
              />
              <span
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {vacation.is_enabled
                  ? t("settings.vacation_reply_enabled")
                  : t("settings.vacation_reply_disabled")}
              </span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handle_toggle(!vacation.is_enabled)}
            >
              {vacation.is_enabled ? t("common.disable") : t("common.enable")}
            </Button>
          </div>
        )}

        {vacation && vacation.reply_count > 0 && (
          <div
            className="rounded-lg p-3 text-sm"
            style={{
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-secondary)",
            }}
          >
            {vacation.reply_count}{" "}
            {vacation.reply_count === 1 ? "reply" : "replies"} sent
            {vacation.last_replied_at &&
              ` · Last: ${new Date(vacation.last_replied_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
          </div>
        )}

        <Button variant="depth" onClick={open_editor}>
          {vacation
            ? t("settings.vacation_reply_edit")
            : t("settings.vacation_reply_setup")}
        </Button>

        <Modal
          is_open={is_editor_open}
          on_close={() => set_is_editor_open(false)}
          size="lg"
        >
          <ModalHeader>
            <ModalTitle>{t("settings.vacation_reply_title")}</ModalTitle>
          </ModalHeader>
          <ModalBody className="space-y-3">
            <div>
              <label
                className="mb-1.5 block text-sm font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                {t("settings.vacation_reply_subject")}
              </label>
              <Input
                className="w-full"
                maxLength={500}
                placeholder={t("settings.vacation_reply_subject")}
                type="text"
                value={subject}
                onChange={(e) => set_subject(e.target.value)}
              />
            </div>

            <div>
              <label
                className="mb-1.5 block text-sm font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                {t("settings.vacation_reply_body")}
              </label>
              <textarea
                className="aster_input resize-none py-2"
                maxLength={5000}
                placeholder={t("settings.vacation_reply_body")}
                rows={5}
                value={body}
                onChange={(e) => set_body(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <VacationDatePicker
                date={start_date}
                hour={start_hour}
                label={t("settings.vacation_reply_start_date")}
                minute={start_minute}
                on_clear={() => {
                  set_start_date(null);
                  set_start_hour(9);
                  set_start_minute(0);
                }}
                on_date_change={set_start_date}
                on_hour_change={set_start_hour}
                on_minute_change={set_start_minute}
              />
              <VacationDatePicker
                date={end_date}
                hour={end_hour}
                label={t("settings.vacation_reply_end_date")}
                minute={end_minute}
                on_clear={() => {
                  set_end_date(null);
                  set_end_hour(17);
                  set_end_minute(0);
                }}
                on_date_change={set_end_date}
                on_hour_change={set_end_hour}
                on_minute_change={set_end_minute}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2.5">
              <Checkbox
                checked={external_only}
                onCheckedChange={(checked) =>
                  set_external_only(checked === true)
                }
              />
              <span
                className="text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {t("settings.vacation_reply_external_only")}
              </span>
            </label>
          </ModalBody>
          <ModalFooter className="justify-between">
            <div>
              {vacation && (
                <Button
                  className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  disabled={is_deleting}
                  variant="ghost"
                  onClick={handle_delete}
                >
                  {is_deleting
                    ? t("common.deleting")
                    : t("settings.vacation_reply_delete")}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => set_is_editor_open(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={is_saving || !subject.trim() || !body.trim()}
                variant="depth"
                onClick={handle_save}
              >
                {is_saving
                  ? t("common.saving")
                  : t("settings.vacation_reply_save")}
              </Button>
            </div>
          </ModalFooter>
        </Modal>
      </div>
    </UpgradeGate>
  );
}
