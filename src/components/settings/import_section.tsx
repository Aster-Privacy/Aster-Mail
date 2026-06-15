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
import type { TranslationKey } from "@/lib/i18n/types";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentArrowUpIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LinkIcon,
  TrashIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { Button, Checkbox } from "@aster/ui";

import { ImportModal } from "./import_modal";
import {
  ConnectProviderModal,
  type ConnectProvider,
} from "./connect_provider_modal";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert_dialog";
import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import {
  list_import_jobs,
  delete_import_job,
  type ImportJob,
  type ImportSource,
  type ImportStatus,
} from "@/services/api/email_import";
import {
  list_external_accounts,
  trigger_sync,
  cancel_sync,
  delete_external_account,
  get_sync_progress,
  purge_external_account_mail,
  type DecryptedExternalAccount,
  type SyncProgressEvent,
} from "@/services/api/external_accounts";
import { stop_sync_polling } from "@/services/sync_manager";
import {
  list_oauth_folders,
  save_folder_mapping,
} from "@/services/api/external_accounts/api";
import {
  generate_folder_token,
  encrypt_folder_field,
  use_folders,
} from "@/hooks/use_folders";
import { create_folder } from "@/services/api/folders";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { ensure_default_labels } from "@/services/labels/ensure_defaults";

type OAuthProvider = "google" | "microsoft" | "yahoo";

const OAUTH_PROVIDERS: Set<string> = new Set(["gmail", "outlook"]);

const PROVIDER_TO_OAUTH: Record<string, OAuthProvider> = {
  gmail: "google",
  outlook: "microsoft",
};

interface ProviderRow {
  id: ImportSource;
  icon: React.ReactNode;
  label_key: TranslationKey;
}

const PROVIDERS: ProviderRow[] = [
  {
    id: "gmail",
    icon: (
      <img alt="" aria-hidden="true" className="w-6 h-6 object-contain" src="/providers/gmail_logo.svg" />
    ),
    label_key: "settings.gmail_import",
  },
  {
    id: "outlook",
    icon: (
      <img alt="" aria-hidden="true" className="w-6 h-6 object-contain" src="/providers/outlook_logo.svg" />
    ),
    label_key: "settings.outlook_import",
  },
  {
    id: "yahoo",
    icon: (
      <img alt="" aria-hidden="true" className="w-6 h-6 object-contain" src="/providers/yahoo_mail_logo.svg" />
    ),
    label_key: "settings.yahoo_import",
  },
  {
    id: "mbox",
    icon: <DocumentArrowUpIcon className="w-6 h-6 text-txt-secondary" />,
    label_key: "settings.manual_import",
  },
];

function get_status_icon(status: ImportStatus) {
  switch (status) {
    case "completed":
      return (
        <CheckCircleIcon
          className="w-4 h-4"
          style={{ color: "var(--color-success)" }}
        />
      );
    case "processing":
    case "pending":
      return <Spinner className="text-brand" size="sm" />;
    case "failed":
    case "cancelled":
      return (
        <XCircleIcon
          className="w-4 h-4"
          style={{ color: "var(--color-danger)" }}
        />
      );
  }
}

function get_status_label(
  status: ImportStatus,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  switch (status) {
    case "pending":
      return t("settings.status_pending");
    case "processing":
      return t("settings.status_in_progress");
    case "completed":
      return t("settings.status_completed");
    case "failed":
      return t("settings.status_failed");
    case "cancelled":
      return t("settings.status_cancelled");
  }
}

function format_relative_time(
  date_string: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const date = new Date(date_string);
  const now = new Date();
  const diff_ms = now.getTime() - date.getTime();
  const diff_minutes = Math.floor(diff_ms / 60000);
  const diff_hours = Math.floor(diff_minutes / 60);
  const diff_days = Math.floor(diff_hours / 24);

  if (diff_minutes < 1) return t("settings.just_now");
  if (diff_minutes < 60)
    return t("common.minutes_ago_short", { count: diff_minutes });
  if (diff_hours < 24)
    return t("common.hours_ago_short", { count: diff_hours });
  if (diff_days < 7) return t("common.days_ago_short", { count: diff_days });

  return date.toLocaleDateString();
}

function ImportJobCard({
  job,
  on_delete,
}: {
  job: ImportJob;
  on_delete: (id: string) => void;
}) {
  const { t } = use_i18n();
  const source_label = job.source.charAt(0).toUpperCase() + job.source.slice(1);
  const skipped_text =
    job.skipped_emails > 0 ? `, ${t("settings.n_skipped", { count: job.skipped_emails })}` : "";
  const can_delete = job.status !== "processing" && job.status !== "pending";

  const is_failed = job.status === "failed" || job.status === "cancelled";

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-surf-secondary border-edge-secondary">
      <div className="flex-shrink-0">{get_status_icon(job.status)}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-txt-primary truncate">
          {t("settings.source_import", { source: source_label })}
        </p>
        <p
          className={`text-xs ${is_failed ? "text-red-500" : "text-txt-muted"}`}
        >
          {job.status === "completed"
            ? t("settings.imported_skipped", {
                imported: job.processed_emails.toLocaleString(),
                skipped: skipped_text,
              })
            : get_status_label(job.status, t)}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 text-xs text-txt-muted">
        <ClockIcon className="w-3 h-3" />
        <span>{format_relative_time(job.created_at, t)}</span>
        {can_delete && (
          <button
            type="button"
            aria-label={t("common.delete")}
            className="p-1 rounded hover:bg-surf-tertiary text-txt-muted ml-1"
            onClick={() => on_delete(job.id)}
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function get_provider_icon(protocol: string, email: string, oauth_provider?: string | null) {
  if (protocol === "oauth_imap") {
    const p = oauth_provider ?? "";
    if (p === "google") {
      return (
        <img alt="" aria-hidden="true" className="w-5 h-5 object-contain" src="/providers/gmail_logo.svg" />
      );
    }
    if (p === "microsoft") {
      return (
        <img alt="" aria-hidden="true" className="w-5 h-5 object-contain" src="/providers/outlook_logo.svg" />
      );
    }
    if (p === "yahoo") {
      return (
        <img alt="" aria-hidden="true" className="w-5 h-5 object-contain" src="/providers/yahoo_mail_logo.svg" />
      );
    }
    // Fallback: infer from email domain for legacy rows
    const lower = email.toLowerCase();
    if (lower.includes("gmail") || lower.includes("google")) {
      return <img alt="" aria-hidden="true" className="w-5 h-5 object-contain" src="/providers/gmail_logo.svg" />;
    }
    if (lower.includes("outlook") || lower.includes("hotmail") || lower.includes("live")) {
      return <img alt="" aria-hidden="true" className="w-5 h-5 object-contain" src="/providers/outlook_logo.svg" />;
    }
    if (lower.includes("yahoo")) {
      return <img alt="" aria-hidden="true" className="w-5 h-5 object-contain" src="/providers/yahoo_mail_logo.svg" />;
    }
  }

  return <LinkIcon className="w-5 h-5 text-txt-muted" />;
}

function ConnectedAccountCard({
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
                  <Spinner className="text-current" size="sm" />
                  {t("common.stop")}
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

export function ImportSection() {
  const { t } = use_i18n();
  const { state: folders_state } = use_folders();
  const [selected_provider, set_selected_provider] =
    useState<ImportSource | null>(null);
  const [recent_jobs, set_recent_jobs] = useState<ImportJob[]>([]);
  const [is_loading_jobs, set_is_loading_jobs] = useState(true);
  const [oauth_loading, set_oauth_loading] = useState<string | null>(null);
  const [connect_provider, set_connect_provider] =
    useState<ConnectProvider | null>(null);
  const [connected_accounts, set_connected_accounts] = useState<
    DecryptedExternalAccount[]
  >([]);
  const [is_loading_accounts, set_is_loading_accounts] = useState(true);
  const [syncing_accounts, set_syncing_accounts] = useState<Set<string>>(
    new Set(),
  );
  const [folder_setup_status, set_folder_setup_status] = useState<
    "idle" | "setting_up" | "done" | "error"
  >("idle");
  const [disconnect_token, set_disconnect_token] = useState<string | null>(
    null,
  );
  const [delete_messages_on_disconnect, set_delete_messages_on_disconnect] =
    useState(false);
  const [purging_tokens, set_purging_tokens] = useState<Set<string>>(
    new Set(),
  );
  const setup_account_tokens_ref = useRef<Set<string>>(new Set());
  const oauth_cancelled_ref = useRef(false);
  const [oauth_setup_token, set_oauth_setup_token] = useState<string | null>(
    null,
  );

  const load_jobs = useCallback(async (silent = false) => {
    if (!silent) set_is_loading_jobs(true);

    try {
      const response = await list_import_jobs();

      if (response.data) {
        set_recent_jobs(response.data.jobs.slice(0, 5));
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    }

    if (!silent) set_is_loading_jobs(false);
  }, []);

  const handle_delete_recent_job = useCallback(async (id: string) => {
    set_recent_jobs((prev) => prev.filter((j) => j.id !== id));
    try {
      await delete_import_job(id);
    } catch {}
  }, []);

  const load_connected_accounts = useCallback(async () => {
    try {
      const response = await list_external_accounts();

      if (response.data) {
        const oauth_accounts = response.data.filter(
          (a) => a.protocol === "oauth_imap",
        );

        set_connected_accounts(oauth_accounts);
      }
    } catch {
    } finally {
      set_is_loading_accounts(false);
    }
  }, []);

  const setup_oauth_folders = useCallback(
    async (account_token: string) => {
      if (setup_account_tokens_ref.current.has(account_token)) return;

      const vault = get_vault_from_memory();

      if (!vault?.identity_key) {
        set_syncing_accounts((prev) => new Set(prev).add(account_token));
        await trigger_sync(account_token);
        load_connected_accounts();

        return;
      }

      setup_account_tokens_ref.current.add(account_token);
      oauth_cancelled_ref.current = false;
      set_oauth_setup_token(account_token);
      set_folder_setup_status("setting_up");
      set_syncing_accounts((prev) => new Set(prev).add(account_token));

      try {
        await ensure_default_labels(vault, t);

        const folders_result = await list_oauth_folders(account_token);

        if (!folders_result.data?.folders?.length) {
          set_folder_setup_status("idle");
          await trigger_sync(account_token);
          load_connected_accounts();

          return;
        }

        const normalize_name = (name: string) => {
          if (name.toUpperCase() === "INBOX") return t("mail.inbox");

          return name;
        };

        // Reuse an existing folder with the same name instead of creating a
        // duplicate (e.g. when setup runs again after a reload, or the user
        // already has a folder by that name).
        const find_existing_token = (name: string) =>
          folders_state.folders.find(
            (f) => f.name.toLowerCase() === name.toLowerCase(),
          )?.folder_token;

        const included_folders = folders_result.data.folders
          .filter((f) => !f.excluded && f.name.toUpperCase() !== "INBOX")
          .sort((a, b) => {
            const depth_a = a.delimiter ? a.name.split(a.delimiter).length : 1;
            const depth_b = b.delimiter ? b.name.split(b.delimiter).length : 1;

            return depth_a - depth_b;
          });

        const mapping: Record<string, string> = {};
        const parent_tokens: Record<string, string> = {};
        let folder_failures = 0;

        for (const folder of included_folders) {
          if (oauth_cancelled_ref.current) break;

          const parts = folder.delimiter
            ? folder.name.split(folder.delimiter)
            : [folder.name];

          let parent_token: string | undefined;
          let aborted_branch = false;

          for (let i = 0; i < parts.length; i++) {
            if (aborted_branch) break;

            const full_path = parts
              .slice(0, i + 1)
              .join(folder.delimiter || "/");
            const display_name = normalize_name(parts[i]);
            const is_leaf = i === parts.length - 1;

            if (!is_leaf) {
              if (!parent_tokens[full_path]) {
                const existing = find_existing_token(display_name);

                if (existing) {
                  parent_tokens[full_path] = existing;
                } else {
                  try {
                    const token = generate_folder_token();
                    const { encrypted, nonce } = await encrypt_folder_field(
                      display_name,
                      vault.identity_key,
                    );

                    await create_folder({
                      folder_token: token,
                      encrypted_name: encrypted,
                      name_nonce: nonce,
                      parent_token: parent_token,
                    });

                    parent_tokens[full_path] = token;
                  } catch {
                    folder_failures++;
                    aborted_branch = true;
                    continue;
                  }
                }
              }

              parent_token = parent_tokens[full_path];
            } else {
              if (parent_tokens[folder.name]) {
                mapping[folder.name] = parent_tokens[folder.name];
                continue;
              }

              const existing = find_existing_token(display_name);

              if (existing) {
                mapping[folder.name] = existing;
                parent_tokens[folder.name] = existing;
                continue;
              }

              try {
                const token = generate_folder_token();
                const { encrypted, nonce } = await encrypt_folder_field(
                  display_name,
                  vault.identity_key,
                );

                await create_folder({
                  folder_token: token,
                  encrypted_name: encrypted,
                  name_nonce: nonce,
                  parent_token: parent_token,
                });

                mapping[folder.name] = token;
                parent_tokens[folder.name] = token;
              } catch {
                folder_failures++;
                continue;
              }
            }
          }
        }

        if (folder_failures > 0) {
          show_toast(
            t("settings.oauth_folders_partial", { count: folder_failures }),
            "warning",
          );
        }

        if (oauth_cancelled_ref.current) return;

        if (Object.keys(mapping).length > 0) {
          await save_folder_mapping(account_token, mapping);
        }

        set_folder_setup_status("idle");
        set_oauth_setup_token(null);

        await trigger_sync(account_token);
      } catch {
        set_folder_setup_status("idle");
        set_oauth_setup_token(null);
        if (oauth_cancelled_ref.current) return;
        show_toast(t("settings.oauth_folders_error"), "error");

        await trigger_sync(account_token).catch(() => {});
      }

      load_connected_accounts();
    },
    [t, load_connected_accounts, folders_state],
  );

  const stop_sync = useCallback(async (account_token: string) => {
    set_syncing_accounts((prev) => {
      const next = new Set(prev);
      next.delete(account_token);
      return next;
    });
    try {
      const result = await cancel_sync(account_token);
      if (result.error) {
        show_toast(result.error, "error");
      } else {
        show_toast(t("settings.sync_stopped"), "success");
      }
    } catch {}
    load_connected_accounts();
  }, [load_connected_accounts, t]);

  const handle_sync = useCallback(
    async (account_token: string) => {
      const account = connected_accounts.find(
        (a) => a.account_token === account_token,
      );

      // The button shows "Stop" whenever the card is in an active sync state,
      // which includes the server-reported status. Match that here, otherwise
      // pressing the button during a server-side sync would start another one.
      if (
        account?.last_sync_status === "purging" ||
        purging_tokens.has(account_token)
      ) {
        return;
      }

      const sync_active =
        syncing_accounts.has(account_token) ||
        account?.last_sync_status === "syncing" ||
        account?.last_sync_status === "pending";

      if (sync_active) {
        await stop_sync(account_token);
        return;
      }

      // Only run first-time folder setup for an OAuth account that has never
      // synced. Re-running it (e.g. after a reload, when the setup ref is empty)
      // would create duplicate folders, since setup does not check for existing
      // ones. Established accounts go straight to a normal sync.
      if (
        account?.protocol === "oauth_imap" &&
        !setup_account_tokens_ref.current.has(account_token) &&
        !account.last_sync_at
      ) {
        await setup_oauth_folders(account_token);
        return;
      }

      set_syncing_accounts((prev) => new Set(prev).add(account_token));

      try {
        const result = await trigger_sync(account_token);
        if (result.error) {
          show_toast(result.error, "error");
          set_syncing_accounts((prev) => {
            const next = new Set(prev);
            next.delete(account_token);
            return next;
          });
        }
      } catch {
        show_toast(t("settings.connected_accounts_error"), "error");
        set_syncing_accounts((prev) => {
          const next = new Set(prev);
          next.delete(account_token);
          return next;
        });
      }

      load_connected_accounts();
    },
    [
      t,
      load_connected_accounts,
      connected_accounts,
      setup_oauth_folders,
      syncing_accounts,
      purging_tokens,
      stop_sync,
    ],
  );


  const handle_disconnect_click = useCallback((account_token: string) => {
    set_delete_messages_on_disconnect(false);
    set_disconnect_token(account_token);
  }, []);

  const handle_disconnect_confirm = useCallback(async () => {
    if (!disconnect_token) return;

    const token = disconnect_token;
    const should_delete_messages = delete_messages_on_disconnect;

    set_disconnect_token(null);
    set_delete_messages_on_disconnect(false);

    const account = connected_accounts.find((a) => a.account_token === token);
    if (account) {
      stop_sync_polling(account.id);
    }

    set_syncing_accounts((prev) => {
      const next = new Set(prev);
      next.delete(token);
      return next;
    });

    let purged_count = 0;

    try {
      if (should_delete_messages) {
        const purge_result = await purge_external_account_mail(token);

        if (purge_result.error) {
          show_toast(purge_result.error, "error");
        } else {
          purged_count = purge_result.data?.deleted_count ?? 0;

          if (purged_count > 0) {
            set_purging_tokens((prev) => new Set(prev).add(token));

            // The purge runs server-side in batches; wait for it to finish
            // before deleting the account so the imported mail keeps its
            // job lineage until every message is gone. The card shows live
            // progress from the same polling endpoint meanwhile.
            let poll_errors = 0;
            for (let i = 0; i < 2400; i++) {
              await new Promise((resolve) => setTimeout(resolve, 1500));
              const prog = await get_sync_progress(token);

              if (prog.data) {
                poll_errors = 0;
                if (prog.data.status !== "purging") break;
              } else {
                poll_errors += 1;
                if (poll_errors >= 5) break;
              }
            }
          }

          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
          window.dispatchEvent(new CustomEvent("astermail:folders-changed"));
          window.dispatchEvent(
            new CustomEvent("astermail:refresh-requested"),
          );
        }
      }

      const result = await delete_external_account(token);

      if (result.error) {
        show_toast(result.error, "error");
      } else {
        set_connected_accounts((prev) =>
          prev.filter((a) => a.account_token !== token),
        );
        // Clear from setup tracker so reconnecting the same account runs folder setup again
        setup_account_tokens_ref.current.delete(token);
        if (should_delete_messages && purged_count > 0) {
          show_toast(
            t("settings.disconnect_deleted_success", {
              count: purged_count.toLocaleString(),
            }),
            "success",
          );
        } else {
          show_toast(t("settings.disconnect_success"), "success");
        }
      }
    } catch {
      show_toast(t("settings.connected_accounts_error"), "error");
    } finally {
      set_purging_tokens((prev) => {
        const next = new Set(prev);
        next.delete(token);
        return next;
      });
    }

    load_connected_accounts();
  }, [
    disconnect_token,
    delete_messages_on_disconnect,
    t,
    connected_accounts,
    load_connected_accounts,
  ]);

  const handle_cancel_oauth_setup = useCallback(async () => {
    oauth_cancelled_ref.current = true;
    const token = oauth_setup_token;

    set_oauth_setup_token(null);
    set_folder_setup_status("idle");

    if (token) {
      set_syncing_accounts((prev) => {
        const next = new Set(prev);
        next.delete(token);
        return next;
      });

      // Clear from setup tracker so a reconnect attempt runs setup again
      setup_account_tokens_ref.current.delete(token);

      try {
        await delete_external_account(token);
        set_connected_accounts((prev) =>
          prev.filter((a) => a.account_token !== token),
        );
      } catch {}
    }
  }, [oauth_setup_token]);

  const handle_modal_close = () => {
    set_selected_provider(null);
    load_jobs();
  };

  useEffect(() => {
    load_jobs();
    load_connected_accounts();
  }, [load_jobs, load_connected_accounts]);

  const has_active_job = recent_jobs.some(
    (job) => job.status === "processing" || job.status === "pending",
  );

  useEffect(() => {
    if (!has_active_job) return;
    const id = window.setInterval(() => {
      load_jobs(true);
    }, 3000);
    return () => window.clearInterval(id);
  }, [has_active_job, load_jobs]);

  // The backend cron planner re-syncs verified accounts on its own schedule;
  // triggering syncs from here every 90 seconds duplicated that work and made
  // progress strips appear and disappear constantly. Just refresh the account
  // list so server-driven syncs become visible.
  useEffect(() => {
    const id = window.setInterval(() => {
      load_connected_accounts();
    }, 60 * 1000);
    return () => window.clearInterval(id);
  }, [load_connected_accounts]);

  const trigger_post_oauth_setup = useCallback(() => {
    const snapshot_tokens = new Set(
      connected_accounts.map((a) => a.account_token),
    );
    const snapshot_error_tokens = new Set(
      connected_accounts
        .filter((a) => a.protocol === "oauth_imap" && a.last_sync_status === "error")
        .map((a) => a.account_token),
    );

    let stopped = false;

    const poll_for_new_account = async () => {
      const response = await list_external_accounts();
      if (!response.data) return false;

      const oauth_accounts = response.data.filter(
        (a) => a.protocol === "oauth_imap",
      );
      set_connected_accounts(oauth_accounts);

      // New account connected
      const new_account = oauth_accounts.find(
        (a) => !snapshot_tokens.has(a.account_token),
      );
      if (new_account) {
        setup_oauth_folders(new_account.account_token);
        return true;
      }

      // Re-auth: kick any account that was previously in error state.
      // last_sync_status won't have changed yet (it updates only after a sync runs),
      // so we can't detect re-auth by status change. Instead, trigger sync for all
      // previously-errored oauth accounts and let the backend handle dedup.
      let kicked = false;
      for (const a of oauth_accounts) {
        if (snapshot_error_tokens.has(a.account_token)) {
          set_syncing_accounts((prev) => new Set(prev).add(a.account_token));
          trigger_sync(a.account_token).catch(() => {});
          kicked = true;
        }
      }
      if (kicked) return true;

      return false;
    };

    poll_for_new_account().then((found) => {
      if (found) { stopped = true; return; }

      const id = window.setInterval(async () => {
        if (stopped) return;
        const found = await poll_for_new_account();
        if (found) { stopped = true; window.clearInterval(id); }
      }, 2000);

      window.setTimeout(() => window.clearInterval(id), 60000);
    });
  }, [connected_accounts, setup_oauth_folders]);

  // Fallback: handle redirect-path OAuth result (popup blocked / Tauri).
  // use_index_page_state clears the URL before we can read it, so it emits a custom event.
  useEffect(() => {
    const handler = () => trigger_post_oauth_setup();
    window.addEventListener("astermail:oauth-completed", handler);
    return () => window.removeEventListener("astermail:oauth-completed", handler);
  }, [trigger_post_oauth_setup]);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
          <ArrowDownTrayIcon className="w-[18px] h-[18px] flex-shrink-0" />
          {t("settings.import_emails_title")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
        <p className="text-sm text-txt-muted mt-2">
          {t("settings.import_emails_description")}
        </p>
      </div>

      {/* Connected accounts - shown at top when present */}
      {(is_loading_accounts || connected_accounts.length > 0) && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-txt-muted mb-2">
            {t("settings.connected_accounts_title")}
          </h4>
          {is_loading_accounts ? (
            <div className="rounded-xl border border-edge-secondary bg-surf-secondary h-16 animate-pulse" />
          ) : null}
          <div className="space-y-2">
            {connected_accounts.map((account) => (
              <ConnectedAccountCard
                key={account.id}
                account={account}
                is_setting_up_folders={
                  folder_setup_status === "setting_up" &&
                  oauth_setup_token === account.account_token
                }
                is_purging={
                  purging_tokens.has(account.account_token) ||
                  account.last_sync_status === "purging"
                }
                is_syncing={syncing_accounts.has(account.account_token)}
                on_cancel_setup={handle_cancel_oauth_setup}
                on_disconnect={handle_disconnect_click}
                on_reconnect={(provider) => {
                  const mapped = provider as ConnectProvider;
                  set_oauth_loading(provider);
                  set_connect_provider(mapped);
                }}
                on_refresh={load_connected_accounts}
                on_sync={handle_sync}
                on_sync_finished={(token) => {
                  set_syncing_accounts((prev) => {
                    const next = new Set(prev);
                    next.delete(token);
                    return next;
                  });
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Import options */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-txt-muted mb-2">
          {!is_loading_accounts && connected_accounts.length > 0
            ? t("settings.import_add_another")
            : t("settings.import_choose_source")}
        </h4>
        <div className="space-y-2">
          {PROVIDERS.map((provider) => {
            const is_oauth = OAUTH_PROVIDERS.has(provider.id);
            const is_loading = oauth_loading === provider.id;
            const any_loading = oauth_loading !== null || connect_provider !== null;
            return (
              <div
                key={provider.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-surf-secondary border-edge-secondary"
              >
                <div className="flex-shrink-0 w-6 flex items-center justify-center">
                  {provider.icon}
                </div>
                <span className="flex-1 min-w-0 truncate text-sm font-medium text-txt-primary">
                  {t(provider.label_key)}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {is_oauth && (
                    <Button
                      disabled={any_loading}
                      size="sm"
                      variant="depth"
                      onClick={() => {
                        const mapped = PROVIDER_TO_OAUTH[provider.id];
                        if (mapped) {
                          set_oauth_loading(provider.id);
                          set_connect_provider(mapped);
                        }
                      }}
                    >
                      {is_loading ? (
                        <span className="flex items-center gap-1.5">
                          <Spinner className="text-current" size="sm" />
                          {t("settings.import_oauth_button")}
                        </span>
                      ) : (
                        t("settings.import_oauth_button")
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => set_selected_provider(provider.id)}
                  >
                    {t("settings.import_manual_button")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent one-time imports */}
      {!is_loading_jobs && recent_jobs.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-txt-muted mb-2">
            {t("settings.recent_imports")}
          </h4>
          <div className="space-y-2">
            {recent_jobs.map((job) => (
              <ImportJobCard
                key={job.id}
                job={job}
                on_delete={handle_delete_recent_job}
              />
            ))}
          </div>
        </div>
      )}

      {/* "How it works" - always expanded */}
      <div className="rounded-xl border border-edge-secondary overflow-hidden bg-surf-secondary/30">
        <div className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-txt-secondary border-b border-edge-secondary">
          <InformationCircleIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
          {t("settings.import_how_it_works")}
        </div>
        <div className="px-4 py-4 space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-txt-secondary">
              {t("settings.import_oauth_title")}
            </p>
            <p className="text-xs text-txt-muted leading-relaxed">
              {t("settings.import_oauth_description")}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-txt-secondary">
              {t("settings.import_manual_title")}
            </p>
            <ol className="list-none space-y-1.5 text-xs text-txt-muted leading-relaxed">
              {[1, 2, 3, 4].map((n) => (
                <li key={n} className="flex gap-2">
                  <span className="font-medium text-txt-secondary flex-shrink-0 tabular-nums">
                    {n}.
                  </span>
                  {t(("settings.import_manual_step_" + n) as TranslationKey)}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <ImportModal
        is_open={selected_provider !== null}
        on_close={handle_modal_close}
        provider={selected_provider}
      />

      <ConnectProviderModal
        provider={connect_provider}
        on_close={() => { set_connect_provider(null); set_oauth_loading(null); }}
        on_oauth_success={() => {
          set_connect_provider(null);
          set_oauth_loading(null);
          trigger_post_oauth_setup();
        }}
      />

      <AlertDialog
        open={disconnect_token !== null}
        onOpenChange={(open) => {
          if (!open) {
            set_disconnect_token(null);
            set_delete_messages_on_disconnect(false);
          }
        }}
      >
        <AlertDialogContent
          className="gap-0 p-0 overflow-hidden max-w-[380px]"
          on_overlay_click={() => {
            set_disconnect_token(null);
            set_delete_messages_on_disconnect(false);
          }}
        >
          <div className="px-6 pt-6 pb-5">
            <AlertDialogHeader className="space-y-2">
              <AlertDialogTitle className="text-base font-semibold">
                {t("settings.disconnect_title")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm leading-normal">
                {t("settings.disconnect_confirm")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <label className="mt-4 flex items-center gap-2.5 cursor-pointer select-none">
              <Checkbox
                checked={delete_messages_on_disconnect}
                onCheckedChange={(v) =>
                  set_delete_messages_on_disconnect(v === true)
                }
              />
              <span className="text-[13px] leading-none text-txt-secondary">
                {(() => {
                  const target = connected_accounts.find(
                    (a) => a.account_token === disconnect_token,
                  );

                  return target && target.email_count > 0
                    ? t("settings.disconnect_delete_messages_label_count", {
                        count: target.email_count.toLocaleString(),
                      })
                    : t("settings.disconnect_delete_messages_label");
                })()}
              </span>
            </label>
          </div>
          <AlertDialogFooter className="flex-row gap-3 px-6 pb-6 pt-2 sm:justify-end">
            <AlertDialogCancel asChild>
              <Button
                className="mt-0 max-sm:flex-1"
                size="xl"
                variant="outline"
              >
                {t("common.cancel")}
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                className="max-sm:flex-1"
                size="xl"
                variant="destructive"
                onClick={handle_disconnect_confirm}
              >
                {t("settings.disconnect_button")}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
