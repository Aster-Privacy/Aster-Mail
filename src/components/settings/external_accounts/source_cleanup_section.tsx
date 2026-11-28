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
import type {
  CleanupAfterDays,
  CleanupPreview,
  CleanupRun,
  CleanupSettings,
  DecryptedExternalAccount,
} from "@/services/api/external_accounts";
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArchiveBoxXMarkIcon } from "@heroicons/react/24/outline";
import {
  Button,
  IslandRow,
  IslandSection,
  SettingControlRow,
  SettingNote,
  Spinner,
} from "@aster/ui";

import {
  confirm_cleanup,
  get_cleanup_settings,
  list_cleanup_runs,
  preview_cleanup,
  save_cleanup_settings,
} from "@/services/api/external_accounts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { show_toast } from "@/components/toast/simple_toast";
import { prompt_upgrade } from "@/components/settings/aliases/feature_lock";
import { PlanUpgradeButton } from "@/components/common/plan_locked";
import { format_date, format_time } from "@/utils/date_format";

const NEVER = "never";
const DAY_CHOICES: CleanupAfterDays[] = [7, 30, 90];

interface SourceCleanupSectionProps {
  account: DecryptedExternalAccount;
  is_two_way: boolean;
  is_locked: boolean;
  t: TranslationFn;
}

function format_stamp(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return `${format_date(date)} ${format_time(date)}`;
}

function format_day(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return format_date(date);
}

function skipped_lines(
  reasons: Record<string, number>,
  t: TranslationFn,
): string[] {
  const lines: string[] = [];

  if ((reasons.flagged ?? 0) > 0) {
    lines.push(
      t("settings.ext_v2_cleanup_skipped_flagged", { count: reasons.flagged }),
    );
  }
  if ((reasons.no_id ?? 0) > 0) {
    lines.push(
      t("settings.ext_v2_cleanup_skipped_no_id", { count: reasons.no_id }),
    );
  }

  return lines;
}

export function SourceCleanupSection({
  account,
  is_two_way,
  is_locked,
  t,
}: SourceCleanupSectionProps) {
  const [settings, set_settings] = useState<CleanupSettings | null>(null);
  const [runs, set_runs] = useState<CleanupRun[]>([]);
  const [preview, set_preview] = useState<CleanupPreview | null>(null);
  const [busy, set_busy] = useState<"save" | "preview" | "confirm" | null>(
    null,
  );
  const mounted_ref = useRef(true);
  const active = is_two_way && !is_locked;

  useEffect(() => {
    mounted_ref.current = true;

    return () => {
      mounted_ref.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const [settings_response, runs_response] = await Promise.all([
      get_cleanup_settings(account.account_token),
      list_cleanup_runs(account.account_token),
    ]);

    if (!mounted_ref.current) return;
    if (settings_response.data) set_settings(settings_response.data);
    if (runs_response.data) set_runs(runs_response.data);
  }, [account.account_token]);

  useEffect(() => {
    void load();
  }, [load, is_two_way]);

  const handle_days_change = async (value: string) => {
    if (busy) return;
    const after_days =
      value === NEVER ? null : (Number(value) as CleanupAfterDays);

    set_busy("save");
    set_preview(null);
    const response = await save_cleanup_settings(
      account.account_token,
      after_days,
    );

    if (!mounted_ref.current) return;
    set_busy(null);

    if (response.error || !response.data) {
      if (response.server_code === "PLAN_LIMIT_EXCEEDED") {
        prompt_upgrade(
          t("settings.feature_requires_upgrade"),
          undefined,
          "has_source_cleanup",
        );

        return;
      }
      show_toast(response.error || t("common.save_failed"), "error");

      return;
    }

    set_settings(response.data);
    show_toast(t("settings.ext_v2_cleanup_saved"), "success");
  };

  const handle_preview = async () => {
    if (busy) return;
    set_busy("preview");
    const response = await preview_cleanup(account.account_token);

    if (!mounted_ref.current) return;
    set_busy(null);

    if (response.error || !response.data) {
      show_toast(response.error || t("errors.load_failed"), "error");

      return;
    }

    set_preview(response.data);
  };

  const handle_confirm = async () => {
    if (busy || !preview) return;
    set_busy("confirm");
    const response = await confirm_cleanup(
      account.account_token,
      preview.preview_run_id,
    );

    if (!mounted_ref.current) return;
    set_busy(null);

    if (response.error || !response.data) {
      set_preview(null);
      show_toast(response.error || t("common.save_failed"), "error");

      return;
    }

    set_settings(response.data);
    set_preview(null);
    show_toast(t("settings.ext_v2_cleanup_confirmed"), "success");
  };

  const after_days = settings?.after_days ?? null;
  const select_value = after_days === null ? NEVER : String(after_days);
  const needs_review =
    active && after_days !== null && settings?.confirmed !== true;

  const pause_note =
    settings?.paused_reason === "plan"
      ? t("settings.ext_v2_cleanup_paused_plan")
      : settings?.paused_reason === "no_trash"
        ? t("settings.ext_v2_cleanup_paused_no_trash", {
            email: account.email,
          })
        : null;

  const control = is_locked ? (
    <PlanUpgradeButton
      feature="has_source_cleanup"
      message={t("settings.feature_requires_upgrade")}
    />
  ) : (
    <Select
      disabled={!is_two_way || busy !== null || !settings}
      value={select_value}
      onValueChange={(value: string) => void handle_days_change(value)}
    >
      <SelectTrigger
        aria-label={t("settings.ext_v2_cleanup_label")}
        className="w-full"
        id="ext-account-cleanup-days"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NEVER}>
          {t("settings.ext_v2_cleanup_never")}
        </SelectItem>
        {DAY_CHOICES.map((days) => (
          <SelectItem key={days} value={String(days)}>
            {t("settings.ext_v2_cleanup_days", { count: days })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const finished_runs = runs.filter((run) => run.kind === "run");

  return (
    <IslandSection
      divided
      description={t("settings.ext_v2_cleanup_description", {
        email: account.email,
      })}
      icon={<ArchiveBoxXMarkIcon />}
      title={t("settings.ext_v2_cleanup_title")}
    >
      <SettingControlRow
        control={control}
        label={t("settings.ext_v2_cleanup_label")}
        note={
          !is_locked && !is_two_way ? (
            <SettingNote>
              {t("settings.ext_v2_cleanup_needs_two_way")}
            </SettingNote>
          ) : active && pause_note ? (
            <SettingNote tone="warning">{pause_note}</SettingNote>
          ) : active && after_days !== null && settings?.confirmed ? (
            <SettingNote>
              {t("settings.ext_v2_cleanup_active", {
                count: after_days,
                email: account.email,
              })}
            </SettingNote>
          ) : undefined
        }
      />

      {needs_review && !preview && (
        <SettingControlRow
          control={
            <Button
              is_loading={busy === "preview"}
              size="sm"
              variant="outline"
              onClick={() => void handle_preview()}
            >
              {t("settings.ext_v2_cleanup_preview")}
            </Button>
          }
          description={t("settings.ext_v2_cleanup_review_description")}
          label={t("settings.ext_v2_cleanup_review_title")}
        />
      )}

      {needs_review && preview && (
        <div
          className="flex flex-col gap-3 px-4 py-3"
          data-testid="ext-cleanup-preview"
        >
          <p className="text-[14px] font-medium leading-5 text-txt-primary">
            {preview.eligible_count > 0
              ? t("settings.ext_v2_cleanup_summary_count", {
                  count: preview.eligible_count,
                  email: account.email,
                })
              : t("settings.ext_v2_cleanup_summary_none")}
          </p>
          <div className="flex flex-col gap-1 text-[13px] leading-5 text-txt-secondary">
            {preview.oldest && preview.eligible_count > 0 && (
              <span>
                {t("settings.ext_v2_cleanup_summary_oldest", {
                  date: format_day(preview.oldest),
                })}
              </span>
            )}
            {preview.folders.length > 0 && preview.eligible_count > 0 && (
              <span className="break-words">
                {t("settings.ext_v2_cleanup_summary_folders", {
                  folders: preview.folders.join(", "),
                })}
              </span>
            )}
            {skipped_lines(preview.skipped_reasons, t).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              disabled={busy !== null}
              size="sm"
              variant="ghost"
              onClick={() => set_preview(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              is_loading={busy === "confirm"}
              size="sm"
              onClick={() => void handle_confirm()}
            >
              {t("settings.ext_v2_cleanup_confirm")}
            </Button>
          </div>
        </div>
      )}

      {busy === "save" && (
        <div className="flex justify-center py-2">
          <Spinner size="sm" />
        </div>
      )}

      {(finished_runs.length > 0 || (active && settings?.confirmed)) && (
        <div className="flex flex-col" data-testid="ext-cleanup-history">
          <p className="px-4 pb-1 pt-3 text-[12px] font-medium uppercase tracking-wide text-txt-tertiary">
            {t("settings.ext_v2_cleanup_history")}
          </p>
          {finished_runs.length === 0 ? (
            <p className="px-4 pb-3 text-[13px] text-txt-secondary">
              {t("settings.ext_v2_cleanup_history_empty")}
            </p>
          ) : (
            finished_runs.map((run) => {
              const skipped =
                run.skipped_count > 0
                  ? t("settings.ext_v2_cleanup_run_skipped", {
                      count: run.skipped_count,
                    })
                  : null;

              return (
                <IslandRow
                  key={run.id}
                  description={
                    run.finished_at
                      ? [
                          t("settings.ext_v2_cleanup_run_moved", {
                            moved: run.moved_count,
                            eligible: run.eligible_count,
                          }),
                          skipped,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : t("settings.ext_v2_cleanup_run_in_progress")
                  }
                  label={format_stamp(run.started_at)}
                />
              );
            })
          )}
        </div>
      )}
    </IslandSection>
  );
}
