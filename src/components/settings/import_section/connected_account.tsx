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
import type { } from "@/lib/i18n/types";

import { useState, useEffect,  useRef } from "react";
import {
  ArrowPathIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button, } from "@aster/ui";


import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import {
  get_sync_progress,
  type DecryptedExternalAccount,
  type SyncProgressEvent,
} from "@/services/api/external_accounts";

import { get_provider_icon } from "./provider_icon";
import { format_relative_time } from "./status";

export function ConnectedAccountCard({
  account,
  on_sync,
  on_disconnect,
  on_refresh,
  on_reconnect,
  is_syncing,
  is_purging,
  on_sync_finished,
  is_setting_up_folders,
  on_cancel_setup,
}: {
  account: DecryptedExternalAccount;
  on_sync: (token: string) => void;
  on_disconnect: (token: string) => void;
  on_refresh: () => void;
  on_reconnect: (provider: string) => void;
  is_syncing: boolean;
  is_purging: boolean;
  on_sync_finished?: (token: string) => void;
  is_setting_up_folders: boolean;
  on_cancel_setup: () => void;
}) {
  const { t } = use_i18n();
  const has_error = account.last_sync_status === "error";
  const needs_reauth = account.needs_reauth && account.protocol === "oauth_imap";
  const [progress, set_progress] = useState<SyncProgressEvent | null>(null);
  const should_poll =
    is_syncing ||
    is_purging ||
    account.last_sync_status === "syncing" ||
    account.last_sync_status === "pending" ||
    account.last_sync_status === "purging";

  // Callbacks go through refs so the polling effect only restarts when the
  // sync state actually changes, not on every parent re-render (which reset
  // the tick counters and re-issued the first poll each time).
  const on_refresh_ref = useRef(on_refresh);
  const on_sync_finished_ref = useRef(on_sync_finished);
  const t_ref = useRef(t);

  useEffect(() => {
    on_refresh_ref.current = on_refresh;
    on_sync_finished_ref.current = on_sync_finished;
    t_ref.current = t;
  }, [on_refresh, on_sync_finished, t]);

  useEffect(() => {
    if (!should_poll) {
      set_progress(null);

      return;
    }

    let cancelled = false;
    let finalized = false;
    let empty_ticks = 0;
    let total_ticks = 0;
    let saw_activity = false;
    let max_total = 0;
    const MAX_EMPTY_TICKS = 30;
    // ~4h at 1.5s per tick; a backstop, not an expected sync duration.
    const MAX_TOTAL_TICKS = 9600;
    const STALE_GRACE_TICKS = 8;
    const started_with_server_sync =
      account.last_sync_status === "syncing" ||
      account.last_sync_status === "pending" ||
      account.last_sync_status === "purging";
    const user_triggered = is_syncing;

    const finalize = (notify: boolean, final?: SyncProgressEvent) => {
      if (finalized) return;
      finalized = true;
      set_progress(null);
      on_sync_finished_ref.current?.(account.account_token);
      on_refresh_ref.current();
      if (notify) {
        window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
        window.dispatchEvent(new CustomEvent("astermail:folders-changed"));
        window.dispatchEvent(new CustomEvent("astermail:refresh-requested"));
      }
      // Outcome toast only for a sync the user started from this card, so
      // background cron syncs observed in an open settings tab stay silent.
      if (user_triggered && final?.status === "complete" && !final.error_message) {
        const imported = final.imported_messages ?? 0;
        if (imported > 0) {
          show_toast(
            t_ref.current("settings.sync_result_imported", {
              count: imported.toLocaleString(),
            }),
            "success",
          );
        } else {
          show_toast(
            t_ref.current("settings.sync_result_up_to_date"),
            "success",
          );
        }
      }
    };

    const poll = async () => {
      if (finalized || cancelled) return;
      total_ticks += 1;
      if (total_ticks > MAX_TOTAL_TICKS) {
        finalize(saw_activity);

        return;
      }

      const result = await get_sync_progress(account.account_token);

      if (cancelled || finalized) return;

      if (!result.data) {
        empty_ticks += 1;
        if (empty_ticks >= MAX_EMPTY_TICKS) {
          finalize(saw_activity);
        }

        return;
      }

      empty_ticks = 0;
      const data = result.data;

      if (data.status === "complete" || data.status === "error") {
        // Right after a manual trigger the backend can briefly report the
        // previous sync's final status. Hold off finalizing until the new
        // sync becomes visible, bounded by a short grace window.
        const stale_window =
          !started_with_server_sync &&
          !saw_activity &&
          total_ticks <= STALE_GRACE_TICKS;

        if (!stale_window) {
          finalize(saw_activity || data.processed_messages > 0, data);
        }

        return;
      }

      saw_activity = true;
      if (data.status === "purging") {
        set_progress(data);

        return;
      }
      max_total = Math.max(max_total, data.total_messages);
      set_progress({ ...data, total_messages: max_total });
    };

    poll();
    const id = window.setInterval(poll, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [should_poll, account.account_token]);

  const total = progress?.total_messages ?? 0;
  const processed = progress?.processed_messages ?? 0;
  const purging_active = is_purging || progress?.status === "purging";
  const show_progress =
    should_poll &&
    progress !== null &&
    progress.status !== "complete" &&
    progress.status !== "error" &&
    progress.status !== "purging" &&
    !purging_active &&
    total > 0;
  const percent =
    total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  // For OAuth accounts, the display_name is just the provider label ("Gmail").
  // Show the actual email address as the primary identifier instead.
  const primary_label =
    account.protocol === "oauth_imap" && account.email && !account.email.endsWith("@import")
      ? account.email
      : account.display_name;

  const sync_active = (is_syncing || should_poll) && !purging_active;

  return (
    <div
      className={[
        "flex flex-col gap-0 rounded-xl border overflow-hidden",
        needs_reauth
          ? "border-amber-400/40 bg-amber-50/30 dark:bg-amber-900/10"
          : has_error && !sync_active
            ? "border-red-400/30 bg-surf-secondary"
            : "border-edge-secondary bg-surf-secondary",
      ].join(" ")}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-shrink-0 relative">
          {get_provider_icon(account.protocol, account.email, account.oauth_provider)}
          {needs_reauth && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 ring-1 ring-surf-secondary" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-txt-primary truncate leading-tight">
            {primary_label}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-txt-muted leading-tight">
            {needs_reauth ? (
              <span className="flex items-center gap-1 text-amber-500 font-medium">
                <ExclamationTriangleIcon className="w-3 h-3 flex-shrink-0" />
                {t("settings.connected_accounts_reauth_needed")}
              </span>
            ) : has_error && !sync_active ? (
              <span className="flex items-center gap-1 text-red-500">
                <ExclamationTriangleIcon className="w-3 h-3 flex-shrink-0" />
                <span className="truncate max-w-[220px]">
                  {account.last_sync_error
                    ? account.last_sync_error.replace(/^IMAP authentication failed:\s*/i, "").slice(0, 70)
                    : t("settings.connected_accounts_error")}
                </span>
              </span>
            ) : sync_active ? null : account.last_sync_at ? (
              <span className="flex items-center gap-1">
                <ClockIcon className="w-3 h-3 flex-shrink-0" />
                {t("settings.connected_accounts_last_sync", {
                  time: format_relative_time(account.last_sync_at, t),
                })}
              </span>
            ) : (
              <span>{t("settings.connected_accounts_never_synced")}</span>
            )}
            {account.email_count > 0 && !sync_active && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {t("settings.connected_accounts_emails", {
                    count: account.email_count.toLocaleString(),
                  })}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {needs_reauth && account.oauth_provider ? (
            <Button
              size="sm"
              variant="depth"
              onClick={() => on_reconnect(account.oauth_provider!)}
            >
              {t("settings.connected_accounts_reconnect")}
            </Button>
          ) : is_setting_up_folders ? (
            <Button size="sm" variant="outline" onClick={on_cancel_setup}>
              {t("settings.import_stage_cancel")}
            </Button>
          ) : purging_active ? null : (
            <Button
              size="sm"
              variant="outline"
              aria-label={sync_active ? t("common.stop") : t("settings.connected_accounts_sync_now")}
              onClick={() => on_sync(account.account_token)}
            >
              {sync_active ? (
                <span className="flex items-center gap-1.5">
                  {t("common.stop")}
                  <Spinner className="text-current" size="sm" />
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <ArrowPathIcon className="w-4 h-4" />
                  {t("settings.connected_accounts_sync_now")}
                </span>
              )}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            aria-label={t("settings.connected_accounts_disconnect")}
            disabled={(is_setting_up_folders && !needs_reauth) || purging_active}
            onClick={() => on_disconnect(account.account_token)}
          >
            <TrashIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Progress / status strip */}
      {is_setting_up_folders && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 mb-1.5 text-xs text-txt-secondary">
            <Spinner className="text-brand flex-shrink-0" size="sm" />
            {t("settings.import_stage_setting_up_folders")}
          </div>
          <div className="h-1 w-full rounded-full bg-surf-tertiary overflow-hidden">
            <div className="h-full rounded-full bg-brand animate-[sync_bar_indeterminate_1.5s_ease-in-out_infinite]"
              style={{ width: "40%" }} />
          </div>
        </div>
      )}
      {!is_setting_up_folders && show_progress && (
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between mb-1.5 text-xs gap-2">
            <span className="flex items-center gap-1.5 text-txt-secondary truncate min-w-0">
              <span className="font-medium text-txt-primary flex-shrink-0 tabular-nums">
                {percent}%
              </span>
              <span className="truncate text-txt-muted">
                {t("settings.sync_progress_count", { processed, total })}
                {progress?.current_folder ? ` · ${progress.current_folder}` : ""}
              </span>
            </span>
          </div>
          <div className="h-1 w-full rounded-full bg-surf-tertiary overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: `${Math.max(4, percent)}%`,
                background: "var(--color-brand)",
              }}
            />
          </div>
        </div>
      )}
      {!is_setting_up_folders && purging_active && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 mb-1.5 text-xs text-txt-secondary">
            <Spinner className="text-brand flex-shrink-0" size="sm" />
            <span className="flex-1 truncate">
              {progress?.status === "purging" && total > 0
                ? t("settings.purging_progress", {
                    current: processed.toLocaleString(),
                    total: total.toLocaleString(),
                  })
                : t("settings.purging_simple")}
            </span>
            {progress?.status === "purging" && total > 0 && (
              <span className="font-medium text-txt-primary tabular-nums flex-shrink-0">
                {percent}%
              </span>
            )}
          </div>
          <div className="h-1 w-full rounded-full bg-surf-tertiary overflow-hidden">
            {progress?.status === "purging" && total > 0 ? (
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${Math.max(4, percent)}%`,
                  background: "var(--color-brand)",
                }}
              />
            ) : (
              <div
                className="h-full rounded-full bg-brand animate-[sync_bar_indeterminate_1.5s_ease-in-out_infinite]"
                style={{ width: "40%" }}
              />
            )}
          </div>
        </div>
      )}
      {!is_setting_up_folders && !purging_active && sync_active && !show_progress && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 text-xs text-txt-muted">
            <Spinner className="text-brand flex-shrink-0" size="sm" />
            <span className="flex-1">
              {progress?.status === "checking"
                ? t("settings.sync_checking_new")
                : progress === null || progress.status === "fetching"
                  ? t("settings.sync_progress_preparing")
                  : t("settings.connected_accounts_syncing")}
              {processed > 0
                ? ` · ${t("settings.connected_accounts_emails", {
                    count: processed.toLocaleString(),
                  })}`
                : ""}
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full rounded-full bg-surf-tertiary overflow-hidden">
            <div
              className="h-full rounded-full bg-brand animate-[sync_bar_indeterminate_1.5s_ease-in-out_infinite]"
              style={{ width: "40%" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

