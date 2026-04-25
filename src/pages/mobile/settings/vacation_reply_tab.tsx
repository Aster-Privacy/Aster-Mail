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
import { useState, useCallback, useEffect } from "react";
import { Checkbox } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { show_toast } from "@/components/toast/simple_toast";
import {
  get_vacation_reply,
  upsert_vacation_reply,
  delete_vacation_reply as api_delete_vacation_reply,
  toggle_vacation_reply,
  type VacationReplyResponse,
} from "@/services/api/vacation_reply";

export function VacationReplyTab() {
  const { t } = use_i18n();
  const [vacation, set_vacation] = useState<VacationReplyResponse | null>(null);
  const [vacation_loading, set_vacation_loading] = useState(true);
  const [vacation_subject, set_vacation_subject] = useState("");
  const [vacation_body, set_vacation_body] = useState("");
  const [vacation_enabled, set_vacation_enabled] = useState(false);
  const [vacation_start, set_vacation_start] = useState("");
  const [vacation_end, set_vacation_end] = useState("");
  const [vacation_external_only, set_vacation_external_only] = useState(false);
  const [is_saving_vacation, set_is_saving_vacation] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load_vacation() {
      try {
        const result = await get_vacation_reply();

        if (cancelled) return;
        if (result.data) {
          set_vacation(result.data);
          set_vacation_subject(result.data.subject);
          set_vacation_body(result.data.body);
          set_vacation_enabled(result.data.is_enabled);
          set_vacation_start(
            result.data.start_date
              ? result.data.start_date.substring(0, 16)
              : "",
          );
          set_vacation_end(
            result.data.end_date ? result.data.end_date.substring(0, 16) : "",
          );
          set_vacation_external_only(result.data.external_only);
        }
      } catch {
      } finally {
        if (!cancelled) set_vacation_loading(false);
      }
    }
    load_vacation();

    return () => {
      cancelled = true;
    };
  }, []);

  const handle_save_vacation = useCallback(async () => {
    if (!vacation_subject.trim() || !vacation_body.trim()) return;
    set_is_saving_vacation(true);
    try {
      const result = await upsert_vacation_reply({
        subject: vacation_subject.trim(),
        body: vacation_body.trim(),
        is_enabled: vacation_enabled,
        start_date: vacation_start
          ? new Date(vacation_start).toISOString().slice(0, 10)
          : null,
        end_date: vacation_end
          ? new Date(vacation_end).toISOString().slice(0, 10)
          : null,
        external_only: vacation_external_only,
      });

      if (result.data) {
        set_vacation(result.data);
        show_toast(t("settings.vacation_reply_saved"), "success");
      } else if (result.error) {
        show_toast(result.error, "error");
      }
    } finally {
      set_is_saving_vacation(false);
    }
  }, [
    vacation_subject,
    vacation_body,
    vacation_enabled,
    vacation_start,
    vacation_end,
    vacation_external_only,
    t,
  ]);

  const handle_delete_vacation = useCallback(async () => {
    try {
      const result = await api_delete_vacation_reply();

      if (result.data?.success) {
        set_vacation(null);
        set_vacation_subject("");
        set_vacation_body("");
        set_vacation_enabled(false);
        set_vacation_start("");
        set_vacation_end("");
        set_vacation_external_only(false);
        show_toast(t("settings.vacation_reply_deleted"), "success");
      }
    } catch (err) {
      if (import.meta.env.DEV)
        console.error("failed to delete vacation reply", err);
    }
  }, [t]);

  const handle_toggle_vacation = useCallback(async () => {
    const new_enabled = !vacation_enabled;

    set_vacation_enabled(new_enabled);
    if (vacation) {
      const result = await toggle_vacation_reply(new_enabled);

      if (result.data) {
        set_vacation(result.data);
        show_toast(
          new_enabled
            ? t("settings.vacation_reply_toggled_on")
            : t("settings.vacation_reply_toggled_off"),
          "success",
        );
      } else if (result.error) {
        set_vacation_enabled(!new_enabled);
        show_toast(result.error, "error");
      }
    }
  }, [vacation, vacation_enabled, t]);

  return (
    <>
      {vacation_loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="md" />
        </div>
      ) : (
        <div className="px-4 pt-3 space-y-3">
          {vacation && (
            <div className="flex items-center justify-between rounded-xl bg-[var(--mobile-bg-card)] px-4 py-3">
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: vacation.is_enabled
                      ? "rgb(34, 197, 94)"
                      : "rgb(245, 158, 11)",
                  }}
                />
                <span className="text-[14px] font-medium text-[var(--mobile-text-primary)]">
                  {vacation.is_enabled
                    ? t("settings.vacation_reply_enabled")
                    : t("settings.vacation_reply_disabled")}
                </span>
              </div>
              <button
                className="rounded-lg px-3 py-1.5 text-[13px] font-medium bg-[var(--mobile-bg-card-hover)] text-[var(--mobile-text-secondary)]"
                type="button"
                onClick={handle_toggle_vacation}
              >
                {vacation.is_enabled ? t("common.disable") : t("common.enable")}
              </button>
            </div>
          )}

          <div className="rounded-xl bg-[var(--mobile-bg-card)] p-4 space-y-3">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-[var(--mobile-text-muted)]">
                {t("settings.vacation_reply_subject")}
              </label>
              <Input
                className="w-full"
                maxLength={500}
                placeholder={t("settings.vacation_reply_subject")}
                type="text"
                value={vacation_subject}
                onChange={(e) => set_vacation_subject(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-medium text-[var(--mobile-text-muted)]">
                {t("settings.vacation_reply_body")}
              </label>
              <textarea
                className="w-full rounded-lg bg-[var(--bg-tertiary)] px-3 py-2.5 text-[15px] text-[var(--mobile-text-primary)] outline-none placeholder:text-[var(--mobile-text-muted)] resize-none"
                maxLength={5000}
                placeholder={t("settings.vacation_reply_body")}
                rows={4}
                value={vacation_body}
                onChange={(e) => set_vacation_body(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[13px] font-medium text-[var(--mobile-text-muted)]">
                  {t("settings.vacation_reply_start_date")}
                </label>
                <Input
                  className="w-full"
                  type="date"
                  value={vacation_start ? vacation_start.substring(0, 10) : ""}
                  onChange={(e) => {
                    const time_part = vacation_start
                      ? vacation_start.substring(11, 16)
                      : "09:00";

                    set_vacation_start(
                      e.target.value ? `${e.target.value}T${time_part}` : "",
                    );
                  }}
                />
                {vacation_start && (
                  <Input
                    className="mt-1 w-full"
                    type="time"
                    value={vacation_start.substring(11, 16) || "09:00"}
                    onChange={(e) => {
                      const date_part = vacation_start.substring(0, 10);

                      set_vacation_start(`${date_part}T${e.target.value}`);
                    }}
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-medium text-[var(--mobile-text-muted)]">
                  {t("settings.vacation_reply_end_date")}
                </label>
                <Input
                  className="w-full"
                  type="date"
                  value={vacation_end ? vacation_end.substring(0, 10) : ""}
                  onChange={(e) => {
                    const time_part = vacation_end
                      ? vacation_end.substring(11, 16)
                      : "17:00";

                    set_vacation_end(
                      e.target.value ? `${e.target.value}T${time_part}` : "",
                    );
                  }}
                />
                {vacation_end && (
                  <Input
                    className="mt-1 w-full"
                    type="time"
                    value={vacation_end.substring(11, 16) || "17:00"}
                    onChange={(e) => {
                      const date_part = vacation_end.substring(0, 10);

                      set_vacation_end(`${date_part}T${e.target.value}`);
                    }}
                  />
                )}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5">
              <Checkbox
                checked={vacation_external_only}
                onCheckedChange={(checked) =>
                  set_vacation_external_only(checked === true)
                }
              />
              <span className="text-[14px] text-[var(--mobile-text-primary)]">
                {t("settings.vacation_reply_external_only")}
              </span>
            </label>
          </div>

          {vacation && vacation.reply_count > 0 && (
            <div className="rounded-xl bg-[var(--mobile-bg-card)] px-4 py-3 text-[13px] text-[var(--mobile-text-muted)]">
              {vacation.reply_count === 1
                ? t("settings.vacation_one_reply_sent")
                : t("settings.vacation_n_replies_sent", { count: vacation.reply_count })}
              {vacation.last_replied_at &&
                ` · ${new Date(vacation.last_replied_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
            </div>
          )}

          <div className="flex gap-2">
            <button
              className="flex-1 rounded-xl py-3 text-[14px] font-semibold text-white disabled:opacity-50"
              disabled={
                is_saving_vacation ||
                !vacation_subject.trim() ||
                !vacation_body.trim()
              }
              style={{
                background:
                  "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                boxShadow:
                  "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              type="button"
              onClick={handle_save_vacation}
            >
              {is_saving_vacation
                ? t("common.saving")
                : t("settings.vacation_reply_save")}
            </button>
            {vacation && (
              <button
                className="rounded-xl px-4 py-3 text-[14px] font-medium text-[var(--mobile-danger)] bg-[var(--mobile-bg-card)]"
                type="button"
                onClick={handle_delete_vacation}
              >
                {t("settings.vacation_reply_delete")}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
