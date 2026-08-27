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
import type { Matcher } from "react-day-picker";

import { useCallback, useEffect, useState, useMemo } from "react";
import { Checkbox } from "@aster/ui";
import { Button } from "@aster/ui";
import { CalendarIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { show_toast } from "@/components/toast/simple_toast";
import { parse_calendar_date } from "@/utils/date_utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { ignore_error } from "@/lib/ignore_error";
import {
  app_locale,
  format_datetime_hint,
  get_zoned_parts,
  zoned_calendar_day,
  zoned_instant_from_calendar_day,
  get_display_time_zone,
} from "@/utils/date_format";

interface VacationDatePickerProps {
  label: string;
  date: Date | null;
  min_date?: Date | null;
  max_date?: Date | null;
  on_date_change: (date: Date | null) => void;
  on_clear: () => void;
}

function VacationDatePicker({
  label,
  date,
  min_date,
  max_date,
  on_date_change,
  on_clear,
}: VacationDatePickerProps) {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);

  const display_text = useMemo(() => {
    if (!date) return t("common.select_date");

    return format_datetime_hint(date, false, false);
  }, [date, t]);

  const disabled_days = useMemo(() => {
    const matchers: Matcher[] = [];

    if (min_date) matchers.push({ before: zoned_calendar_day(min_date) });
    if (max_date) matchers.push({ after: zoned_calendar_day(max_date) });

    return matchers.length > 0 ? matchers : undefined;
  }, [min_date, max_date]);

  return (
    <div>
      <label
        className="mb-1.5 block text-sm font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </label>
      <div className="relative">
        <Popover open={is_open} onOpenChange={set_is_open}>
          <PopoverTrigger asChild>
            <button
              className="w-full flex items-center gap-2 rounded-[14px] border px-3 py-2 text-sm text-start transition-colors"
              style={{
                backgroundColor: "var(--bg-primary)",
                borderColor: "var(--border-primary)",
                color: date ? "var(--text-primary)" : "var(--text-muted)",
              }}
              type="button"
            >
              <CalendarIcon className="w-4 h-4 flex-shrink-0 opacity-60" />
              <span className="flex-1 truncate">{display_text}</span>
              {date && <span className="w-3 flex-shrink-0" />}
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
                disabled={disabled_days}
                mode="single"
                selected={date ? zoned_calendar_day(date) : undefined}
                onSelect={(d) => {
                  if (d) {
                    on_date_change(zoned_instant_from_calendar_day(d, 0, 0));
                  }
                }}
              />
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
        {date && (
          <button
            aria-label={t("common.clear")}
            className="absolute end-2 top-1/2 -translate-y-1/2 text-xs opacity-60 hover:opacity-100 transition-opacity"
            type="button"
            onClick={on_clear}
          >
            ✕
          </button>
        )}
      </div>
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
  const [load_failed, set_load_failed] = useState(false);

  const [subject, set_subject] = useState("");
  const [body, set_body] = useState("");
  const [is_enabled, set_is_enabled] = useState(false);
  const [is_toggling, set_is_toggling] = useState(false);
  const [start_date, set_start_date] = useState<Date | null>(null);
  const [end_date, set_end_date] = useState<Date | null>(null);
  const [external_only, set_external_only] = useState(false);

  const load_vacation = useCallback(async () => {
    try {
      const result = await get_vacation_reply();

      if (result.error) {
        set_load_failed(true);
      } else {
        set_load_failed(false);
        set_vacation(result.data ?? null);
      }
    } catch (caught) {
      set_load_failed(true);
      ignore_error(
        "components/settings/vacation_reply_section:VacationReplySection",
        caught,
      );
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
          set_start_date(
            zoned_instant_from_calendar_day(
              parse_calendar_date(data.start_date),
              0,
              0,
            ),
          );
        } else {
          set_start_date(null);
        }
        if (data.end_date) {
          set_end_date(
            zoned_instant_from_calendar_day(
              parse_calendar_date(data.end_date),
              0,
              0,
            ),
          );
        } else {
          set_end_date(null);
        }
        set_external_only(data.external_only);
      } else {
        set_subject("");
        set_body("");
        set_is_enabled(true);
        set_start_date(null);
        set_end_date(null);
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
        const parts = get_zoned_parts(d);
        const month = String(parts.month).padStart(2, "0");
        const day = String(parts.day).padStart(2, "0");

        return `${parts.year}-${month}-${day}`;
      };
      const start_ymd = start_date ? format_ymd(start_date) : null;
      const end_ymd = end_date ? format_ymd(end_date) : null;
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
      } else {
        show_toast(
          result.error || t("common.something_went_wrong_try_again"),
          "error",
        );
      }
    } finally {
      set_is_saving(false);
    }
  }, [subject, body, is_enabled, start_date, end_date, external_only, t]);

  const [confirm_delete_open, set_confirm_delete_open] = useState(false);

  const handle_delete = useCallback(async () => {
    set_confirm_delete_open(false);
    set_is_deleting(true);
    try {
      const result = await delete_vacation_reply();

      if (result.data?.success) {
        set_vacation(null);
        show_toast(t("settings.vacation_reply_deleted"), "success");
        set_is_editor_open(false);
      } else {
        show_toast(t("common.delete_failed"), "error");
      }
    } catch {
      show_toast(t("common.delete_failed"), "error");
    } finally {
      set_is_deleting(false);
    }
  }, [t]);

  const handle_toggle = useCallback(
    async (enabled: boolean) => {
      if (is_toggling) return;
      set_is_enabled(enabled);
      if (vacation) {
        set_is_toggling(true);
        try {
          const result = await toggle_vacation_reply(enabled);

          if (result.data) {
            set_vacation(result.data);
            show_toast(
              enabled
                ? t("settings.vacation_reply_toggled_on")
                : t("settings.vacation_reply_toggled_off"),
              "success",
            );
          } else {
            set_is_enabled(!enabled);
            show_toast(
              result.error || t("common.something_went_wrong_try_again"),
              "error",
            );
          }
        } finally {
          set_is_toggling(false);
        }
      }
    },
    [vacation, t, is_toggling],
  );

  if (is_loading) {
    return <SettingsSkeleton variant="form" />;
  }

  if (load_failed) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-txt-secondary">
          {t("common.something_went_wrong_try_again")}
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            set_is_loading(true);
            set_load_failed(false);
            void load_vacation();
          }}
        >
          {t("common.retry")}
        </Button>
      </div>
    );
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
              disabled={is_toggling}
              variant="secondary"
              onClick={() => handle_toggle(!vacation.is_enabled)}
            >
              {is_toggling ? (
                <Spinner size="sm" />
              ) : vacation.is_enabled ? (
                t("common.disable")
              ) : (
                t("common.enable")
              )}
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
            {t("settings.vacation_reply_count", {
              count: vacation.reply_count,
            })}
            {vacation.last_replied_at &&
              ` · ${t("settings.vacation_reply_last", { date: new Date(vacation.last_replied_at).toLocaleDateString(app_locale(), { timeZone: get_display_time_zone(), month: "short", day: "numeric", year: "numeric" }) })}`}
          </div>
        )}

        <Button variant="depth" onClick={open_editor}>
          {vacation
            ? t("settings.vacation_reply_edit")
            : t("settings.vacation_reply_setup")}
        </Button>

        <Modal
          close_on_overlay={false}
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
                label={t("settings.vacation_reply_start_date")}
                max_date={end_date}
                on_clear={() => {
                  set_start_date(null);
                }}
                on_date_change={set_start_date}
              />
              <VacationDatePicker
                date={end_date}
                label={t("settings.vacation_reply_end_date")}
                min_date={start_date}
                on_clear={() => {
                  set_end_date(null);
                }}
                on_date_change={set_end_date}
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
                  is_loading={is_deleting}
                  variant="ghost"
                  onClick={() => set_confirm_delete_open(true)}
                >
                  {t("settings.vacation_reply_delete")}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => set_is_editor_open(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={is_saving || !subject.trim() || !body.trim()}
                is_loading={is_saving}
                variant="depth"
                onClick={handle_save}
              >
                {t("settings.vacation_reply_save")}
              </Button>
            </div>
          </ModalFooter>
        </Modal>

        <ConfirmationModal
          confirm_text={t("common.delete")}
          is_open={confirm_delete_open}
          message={t("common.action_cannot_be_undone")}
          on_cancel={() => set_confirm_delete_open(false)}
          on_confirm={handle_delete}
          title={t("settings.vacation_reply_delete")}
          variant="danger"
        />
      </div>
    </UpgradeGate>
  );
}
