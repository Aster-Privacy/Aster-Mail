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
import { FaMicrosoft, FaYahoo } from "react-icons/fa6";
import { SiGmail } from "react-icons/si";
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
  delete_external_account,
  get_sync_progress,
  purge_external_account_mail,
  toggle_external_account,
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
} from "@/hooks/use_folders";
import { create_folder } from "@/services/api/folders";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { ensure_default_labels } from "@/services/labels/ensure_defaults";

type OAuthProvider = "google" | "microsoft" | "yahoo";

const OAUTH_PROVIDERS: Set<string> = new Set(["gmail", "outlook", "yahoo"]);

const PROVIDER_TO_OAUTH: Record<string, OAuthProvider> = {
  gmail: "google",
  outlook: "microsoft",
  yahoo: "yahoo",
};

interface ProviderRow {
  id: ImportSource;
  icon: React.ReactNode;
  label_key: TranslationKey;
}

const PROVIDERS: ProviderRow[] = [
  {
    id: "gmail",
    icon: <SiGmail className="w-6 h-6" color="#EA4335" />,
    label_key: "settings.gmail_import",
  },
  {
    id: "outlook",
    icon: <FaMicrosoft className="w-6 h-6" color="#0078D4" />,
    label_key: "settings.outlook_import",
  },
  {
    id: "yahoo",
    icon: <FaYahoo className="w-6 h-6" color="#6001D2" />,
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
      return <Spinner className="text-brand" size="md" />;
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

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-surf-secondary">
      <div className="flex items-center gap-3">
        {get_status_icon(job.status)}
        <div>
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.source_import", { source: source_label })}
          </p>
          <p className="text-xs text-txt-muted">
            {t("settings.imported_skipped", {
              imported: String(job.processed_emails),
              skipped: skipped_text,
            })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-txt-muted">
          {get_status_label(job.status, t)}
        </span>
        <ClockIcon className="w-3 h-3 text-txt-muted" />
        <span className="text-xs text-txt-muted">
          {format_relative_time(job.created_at, t)}
        </span>
        {can_delete && (
          <button
            type="button"
            aria-label={t("common.delete")}
            className="ml-1 p-1 rounded hover:bg-surf-tertiary text-txt-muted"
            onClick={() => on_delete(job.id)}
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function get_provider_icon(protocol: string, email: string) {
  const lower = email.toLowerCase();

  if (protocol === "oauth_imap") {
    if (lower.includes("gmail") || lower.includes("google")) {
      return <SiGmail className="w-5 h-5" color="#EA4335" />;
    }

    if (
      lower.includes("outlook") ||
      lower.includes("hotmail") ||
      lower.includes("live")
    ) {
      return <FaMicrosoft className="w-5 h-5" color="#0078D4" />;
    }

    if (lower.includes("yahoo")) {
      return <FaYahoo className="w-5 h-5" color="#6001D2" />;
    }
  }

  return <LinkIcon className="w-5 h-5 text-txt-muted" />;
}

function ConnectedAccountCard({
  account,
  on_sync,
  on_disconnect,
  on_refresh,
  is_syncing,
  on_sync_finished,
  is_setting_up_folders,
  on_cancel_setup,
}: {
  account: DecryptedExternalAccount;
  on_sync: (token: string) => void;
  on_disconnect: (token: string) => void;
  on_refresh: () => void;
  is_syncing: boolean;
  on_sync_finished?: (token: string) => void;
  is_setting_up_folders: boolean;
  on_cancel_setup: () => void;
}) {
  const { t } = use_i18n();
  const has_error = account.last_sync_status === "error";
  const [progress, set_progress] = useState<SyncProgressEvent | null>(null);
  const should_poll =
    is_syncing ||
    account.last_sync_status === "syncing" ||
    account.last_sync_status === "pending";

  useEffect(() => {
    if (!should_poll) {
      set_progress(null);

      return;
    }

    let cancelled = false;
    let empty_ticks = 0;
    let finalized = false;
    let preparing_ticks = 0;
    const MAX_EMPTY_TICKS = 30;
    const MAX_PREPARING_TICKS = 40;

    const finalize = () => {
      finalized = true;
      set_progress(null);
      on_sync_finished?.(account.account_token);
      on_refresh();
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      window.dispatchEvent(new CustomEvent("astermail:folders-changed"));
      window.dispatchEvent(new CustomEvent("astermail:refresh-requested"));
    };

    const poll = async () => {
      if (finalized) return;
      const result = await get_sync_progress(account.account_token);

      if (cancelled) return;

      if (!result.data) {
        empty_ticks += 1;
        if (empty_ticks >= MAX_EMPTY_TICKS) {
          finalize();
        }

        return;
      }

      empty_ticks = 0;
      set_progress(result.data);

      if (result.data.status === "complete") {
        finalize();
      } else if (result.data.status === "error") {
        finalize();
      } else if (
        result.data.total_messages === 0 &&
        result.data.processed_messages === 0
      ) {
        preparing_ticks += 1;
        if (preparing_ticks >= MAX_PREPARING_TICKS) {
          finalize();
        }
      }
    };

    poll();
    const id = window.setInterval(poll, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [should_poll, account.account_token, on_refresh, on_sync_finished]);

  const total = progress?.total_messages ?? 0;
  const processed = progress?.processed_messages ?? 0;
  const show_progress =
    should_poll &&
    progress !== null &&
    progress.status !== "complete" &&
    progress.status !== "error" &&
    total > 0;
  const percent =
    total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  return (
    <div className="flex flex-col gap-3 px-4 py-3 rounded-xl border bg-surf-secondary border-edge-secondary">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {get_provider_icon(account.protocol, account.email)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-txt-primary truncate">
            {account.display_name}
          </p>
          <div className="flex items-center gap-2 text-xs text-txt-muted">
            {has_error ? (
              <span className="flex items-center gap-1 text-red-500">
                <ExclamationTriangleIcon className="w-3 h-3" />
                {t("settings.connected_accounts_error")}
              </span>
            ) : account.last_sync_at ? (
              <span className="flex items-center gap-1">
                <ClockIcon className="w-3 h-3" />
                {t("settings.connected_accounts_last_sync", {
                  time: format_relative_time(account.last_sync_at, t),
                })}
              </span>
            ) : (
              <span>{t("settings.connected_accounts_never_synced")}</span>
            )}
            {account.email_count > 0 && (
              <>
                <span>·</span>
                <span>
                  {t("settings.connected_accounts_emails", {
                    count: account.email_count,
                  })}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={is_setting_up_folders}
            size="sm"
            variant="outline"
            onClick={() => on_sync(account.account_token)}
          >
            {is_syncing || is_setting_up_folders ? (
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
          <Button
            disabled={is_setting_up_folders}
            size="sm"
            variant="outline"
            onClick={() => on_disconnect(account.account_token)}
          >
            <TrashIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {is_setting_up_folders && (
        <div className="w-full">
          <div className="flex items-center justify-between mb-1.5 text-xs gap-2">
            <span className="flex items-center gap-2 text-txt-secondary truncate">
              <Spinner className="text-brand" size="sm" />
              {t("settings.import_stage_setting_up_folders")}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={on_cancel_setup}
            >
              {t("settings.import_stage_cancel")}
            </Button>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surf-tertiary overflow-hidden">
            <div
              className="h-full rounded-full animate-pulse"
              style={{
                width: "30%",
                background: "var(--color-brand)",
              }}
            />
          </div>
        </div>
      )}
      {!is_setting_up_folders && show_progress && (
        <div className="w-full">
          <div className="flex items-center justify-between mb-1.5 text-xs gap-2">
            <span className="flex items-center gap-2 text-txt-secondary truncate min-w-0">
              <span className="font-medium text-txt-primary flex-shrink-0">
                {t("settings.import_stage_importing_emails")}
              </span>
              <span className="truncate">
                · {t("settings.sync_progress_count", { processed, total })}
                {progress?.current_folder ? ` · ${progress.current_folder}` : ""}
              </span>
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-txt-muted tabular-nums">{percent}%</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => on_sync(account.account_token)}
              >
                {t("common.stop")}
              </Button>
            </div>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surf-tertiary overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: total > 0 ? `${percent}%` : "15%",
                background: "var(--color-brand)",
                transition: "width 1s ease-out",
              }}
            />
          </div>
        </div>
      )}
      {!is_setting_up_folders && should_poll && !show_progress && (
        <div className="flex items-center justify-between gap-2 text-xs text-txt-muted">
          <span className="flex items-center gap-2">
            <Spinner className="text-brand" size="sm" />
            <span>{t("settings.connected_accounts_syncing")}</span>
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => on_sync(account.account_token)}
          >
            {t("common.stop")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ImportSection() {
  const { t } = use_i18n();
  const [selected_provider, set_selected_provider] =
    useState<ImportSource | null>(null);
  const [recent_jobs, set_recent_jobs] = useState<ImportJob[]>([]);
  const [is_loading_jobs, set_is_loading_jobs] = useState(true);
  const [has_error, set_has_error] = useState(false);
  const [oauth_loading] = useState<string | null>(null);
  const [connect_provider, set_connect_provider] =
    useState<ConnectProvider | null>(null);
  const [connected_accounts, set_connected_accounts] = useState<
    DecryptedExternalAccount[]
  >([]);
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
  const [stop_sync_token, set_stop_sync_token] = useState<string | null>(null);
  const setup_account_tokens_ref = useRef<Set<string>>(new Set());
  const oauth_cancelled_ref = useRef(false);
  const [oauth_setup_token, set_oauth_setup_token] = useState<string | null>(
    null,
  );

  const load_jobs = async () => {
    if (has_error) return;
    set_is_loading_jobs(true);

    try {
      const response = await list_import_jobs();

      if (response.data) {
        set_recent_jobs(response.data.jobs.slice(0, 5));
      } else if (response.error) {
        set_has_error(true);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_has_error(true);
    }

    set_is_loading_jobs(false);
  };

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
    } catch {}
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

              parent_token = parent_tokens[full_path];
            } else {
              if (parent_tokens[folder.name]) {
                mapping[folder.name] = parent_tokens[folder.name];
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
    [t, load_connected_accounts],
  );

  const handle_sync = useCallback(
    async (account_token: string) => {
      const account = connected_accounts.find(
        (a) => a.account_token === account_token,
      );

      if (syncing_accounts.has(account_token)) {
        set_stop_sync_token(account_token);

        return;
      }

      if (
        account?.protocol === "oauth_imap" &&
        !setup_account_tokens_ref.current.has(account_token)
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
    ],
  );

  const handle_stop_sync_confirm = useCallback(async () => {
    const token = stop_sync_token;
    set_stop_sync_token(null);
    if (!token) return;
    set_syncing_accounts((prev) => {
      const next = new Set(prev);
      next.delete(token);
      return next;
    });
    try {
      await toggle_external_account(token, false);
      window.setTimeout(() => {
        toggle_external_account(token, true).catch(() => {});
        load_connected_accounts();
      }, 1500);
    } catch {}
  }, [stop_sync_token, load_connected_accounts]);

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

    try {
      if (should_delete_messages) {
        const purge_result = await purge_external_account_mail(token);

        if (purge_result.error) {
          show_toast(purge_result.error, "error");
        } else {
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
        show_toast(t("settings.disconnect_success"), "success");
      }
    } catch {
      show_toast(t("settings.connected_accounts_error"), "error");
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
    if (!has_error) {
      load_jobs();
    }
  };

  useEffect(() => {
    load_jobs();
    load_connected_accounts();
  }, [load_connected_accounts]);

  useEffect(() => {
    if (connected_accounts.length === 0) return;
    const interval = window.setInterval(
      () => {
        for (const account of connected_accounts) {
          if (syncing_accounts.has(account.account_token)) continue;
          if (account.last_sync_status === "syncing") continue;
          if (account.last_sync_status === "pending") continue;
          if (
            setup_account_tokens_ref.current.has(account.account_token) ===
              false &&
            account.protocol === "oauth_imap"
          ) {
            continue;
          }
          set_syncing_accounts((prev) =>
            new Set(prev).add(account.account_token),
          );
          trigger_sync(account.account_token).catch(() => {});
        }
      },
      90 * 1000,
    );
    return () => window.clearInterval(interval);
  }, [connected_accounts, syncing_accounts]);

  const oauth_handled_ref = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (oauth_handled_ref.current) return;

    const params = new URLSearchParams(window.location.search);

    if (params.get("oauth") !== "success") return;

    oauth_handled_ref.current = true;

    const url = new URL(window.location.href);

    url.searchParams.delete("oauth");
    url.searchParams.delete("provider");
    window.history.replaceState({}, "", url.toString());

    const snapshot_tokens = new Set(
      connected_accounts.map((a) => a.account_token),
    );

    const poll_for_new_account = async () => {
      const response = await list_external_accounts();

      if (!response.data) return false;

      const oauth_accounts = response.data.filter(
        (a) => a.protocol === "oauth_imap",
      );

      set_connected_accounts(oauth_accounts);

      const new_account = oauth_accounts.find(
        (a) => !snapshot_tokens.has(a.account_token),
      );

      if (new_account) {
        setup_oauth_folders(new_account.account_token);

        return true;
      }

      return false;
    };

    let stopped = false;

    poll_for_new_account().then((found) => {
      if (found) {
        stopped = true;

        return;
      }

      const id = window.setInterval(async () => {
        if (stopped) return;
        const found = await poll_for_new_account();

        if (found) {
          stopped = true;
          window.clearInterval(id);
        }
      }, 2000);

      window.setTimeout(() => window.clearInterval(id), 30000);
    });
  }, [connected_accounts, setup_oauth_folders]);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
            <ArrowDownTrayIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.import_emails_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm text-txt-muted">
          {t("settings.import_emails_description")}
        </p>
      </div>

      <div className="space-y-3">
        {PROVIDERS.map((provider) => (
          <div
            key={provider.id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-surf-secondary border-edge-secondary"
          >
            <div className="flex-shrink-0">{provider.icon}</div>
            <span className="flex-1 text-sm font-medium text-txt-primary">
              {t(provider.label_key)}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="md"
                variant="outline"
                onClick={() => set_selected_provider(provider.id)}
              >
                {t("settings.import_manual_button")}
              </Button>
              {OAUTH_PROVIDERS.has(provider.id) && (
                <Button
                  disabled={oauth_loading !== null}
                  size="md"
                  variant="depth"
                  onClick={() => {
                    const mapped = PROVIDER_TO_OAUTH[provider.id];
                    if (mapped) set_connect_provider(mapped);
                  }}
                >
                  {oauth_loading === provider.id ? (
                    <Spinner className="text-current" size="sm" />
                  ) : (
                    t("settings.import_oauth_button")
                  )}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {connected_accounts.length > 0 && (
        <div>
          <div className="mb-4">
            <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
              <LinkIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
              {t("settings.connected_accounts_title")}
            </h3>
            <div className="mt-2 h-px bg-edge-secondary" />
          </div>
          <div className="space-y-2">
            {connected_accounts.map((account) => (
              <ConnectedAccountCard
                key={account.id}
                account={account}
                is_setting_up_folders={
                  folder_setup_status === "setting_up" &&
                  oauth_setup_token === account.account_token
                }
                is_syncing={syncing_accounts.has(account.account_token)}
                on_cancel_setup={handle_cancel_oauth_setup}
                on_disconnect={handle_disconnect_click}
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

      <div className="rounded-xl border p-4 space-y-4 bg-surf-secondary/50 border-edge-secondary">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-txt-primary">
          <InformationCircleIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
          {t("settings.import_how_it_works")}
        </h4>

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
          <ol className="list-none space-y-1.5 text-xs text-txt-secondary leading-relaxed">
            <li className="flex gap-2">
              <span className="font-medium text-txt-secondary flex-shrink-0">
                1.
              </span>
              {t("settings.import_manual_step_1")}
            </li>
            <li className="flex gap-2">
              <span className="font-medium text-txt-secondary flex-shrink-0">
                2.
              </span>
              {t("settings.import_manual_step_2")}
            </li>
            <li className="flex gap-2">
              <span className="font-medium text-txt-secondary flex-shrink-0">
                3.
              </span>
              {t("settings.import_manual_step_3")}
            </li>
            <li className="flex gap-2">
              <span className="font-medium text-txt-secondary flex-shrink-0">
                4.
              </span>
              {t("settings.import_manual_step_4")}
            </li>
          </ol>
        </div>
      </div>

      {!is_loading_jobs && recent_jobs.length > 0 && (
        <div>
          <div className="mb-4">
            <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
              <ClockIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
              {t("settings.recent_imports")}
            </h3>
            <div className="mt-2 h-px bg-edge-secondary" />
          </div>
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

      {selected_provider && (
        <ImportModal
          is_open={true}
          on_close={handle_modal_close}
          provider={selected_provider}
        />
      )}

      <ConnectProviderModal
        provider={connect_provider}
        on_close={() => set_connect_provider(null)}
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
              <AlertDialogTitle className="text-16 font-semibold">
                {t("settings.disconnect_title")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-14 leading-normal">
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
              <span className="text-13 leading-none text-txt-secondary">
                {t("settings.disconnect_delete_messages_label")}
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

      <AlertDialog
        open={stop_sync_token !== null}
        onOpenChange={(open) => {
          if (!open) set_stop_sync_token(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.stop_sync_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.stop_sync_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.no")}</AlertDialogCancel>
            <AlertDialogAction onClick={handle_stop_sync_confirm}>
              {t("common.yes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
