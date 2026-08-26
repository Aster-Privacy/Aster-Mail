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
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { Button, Checkbox } from "@aster/ui";

import { ImportModal } from "../import_modal";
import {
  ConnectProviderModal,
  type ConnectProvider,
} from "../connect_provider_modal";

import { ConnectedAccountCard } from "./connected_account";

import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { ImportJobCard } from "./job_card";
import { OAUTH_PROVIDERS, PROVIDERS, PROVIDER_TO_OAUTH } from "./providers";

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
} from "@/services/api/email_import";
import {
  list_external_accounts,
  trigger_sync,
  cancel_sync,
  delete_external_account,
  get_sync_progress,
  purge_external_account_mail,
  type DecryptedExternalAccount,
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
import { ignore_error } from "@/lib/ignore_error";
import {
  emit_folders_changed,
  emit_mail_changed,
  emit_refresh_requested,
} from "@/hooks/mail_events";
import { app_locale } from "@/utils/date_format";

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
  const [jobs_load_failed, set_jobs_load_failed] = useState(false);
  const [accounts_load_failed, set_accounts_load_failed] = useState(false);
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
  const [purging_tokens, set_purging_tokens] = useState<Set<string>>(new Set());
  const setup_account_tokens_ref = useRef<Set<string>>(new Set());
  const oauth_cancelled_ref = useRef(false);
  const oauth_poll_interval_ref = useRef<number | null>(null);
  const oauth_poll_timeout_ref = useRef<number | null>(null);
  const [oauth_setup_token, set_oauth_setup_token] = useState<string | null>(
    null,
  );

  const load_jobs = useCallback(async (silent = false) => {
    if (!silent) set_is_loading_jobs(true);

    try {
      const response = await list_import_jobs();

      if (response.data) {
        set_recent_jobs(response.data.jobs.slice(0, 5));
        set_jobs_load_failed(false);
      } else {
        set_jobs_load_failed(true);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_jobs_load_failed(true);
    }

    if (!silent) set_is_loading_jobs(false);
  }, []);

  const handle_delete_recent_job = useCallback(
    async (id: string) => {
      set_recent_jobs((prev) => prev.filter((j) => j.id !== id));
      try {
        const response = await delete_import_job(id);

        if (response.error) {
          show_toast(t("common.delete_failed"), "error");
          await load_jobs(true);
        }
      } catch (caught) {
        ignore_error(
          "components/settings/import_section/import_section:ImportSection",
          caught,
        );
        show_toast(t("common.delete_failed"), "error");
        await load_jobs(true);
      }
    },
    [load_jobs, t],
  );

  const load_connected_accounts = useCallback(async () => {
    try {
      const response = await list_external_accounts();

      if (response.data) {
        const oauth_accounts = response.data.filter(
          (a) => a.protocol === "oauth_imap",
        );

        set_connected_accounts(oauth_accounts);
        set_accounts_load_failed(false);
      } else {
        set_accounts_load_failed(true);
      }
    } catch (caught) {
      ignore_error(
        "components/settings/import_section/import_section:ImportSection",
        caught,
      );
      set_accounts_load_failed(true);
    } finally {
      set_is_loading_accounts(false);
    }
  }, []);

  const clear_syncing_account = useCallback((account_token: string) => {
    set_syncing_accounts((prev) => {
      const next = new Set(prev);

      next.delete(account_token);

      return next;
    });
  }, []);

  const run_sync = useCallback(
    async (account_token: string) => {
      const result = await trigger_sync(account_token);

      if (result.error) {
        show_toast(result.error, "error");
        clear_syncing_account(account_token);
      }
    },
    [clear_syncing_account],
  );

  const setup_oauth_folders = useCallback(
    async (account_token: string) => {
      if (setup_account_tokens_ref.current.has(account_token)) return;

      const vault = get_vault_from_memory();

      if (!vault?.identity_key) {
        set_syncing_accounts((prev) => new Set(prev).add(account_token));
        await run_sync(account_token);
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
          await run_sync(account_token);
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

                    const created = await create_folder({
                      folder_token: token,
                      encrypted_name: encrypted,
                      name_nonce: nonce,
                      parent_token: parent_token,
                    });

                    if (created.error) {
                      folder_failures++;
                      aborted_branch = true;
                      continue;
                    }
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

                const created = await create_folder({
                  folder_token: token,
                  encrypted_name: encrypted,
                  name_nonce: nonce,
                  parent_token: parent_token,
                });

                if (created.error) {
                  folder_failures++;
                  continue;
                }
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
          const saved = await save_folder_mapping(account_token, mapping);

          if (saved.error) {
            show_toast(t("settings.oauth_folders_error"), "error");
          }
        }

        set_folder_setup_status("idle");
        set_oauth_setup_token(null);

        await run_sync(account_token);
      } catch {
        set_folder_setup_status("idle");
        set_oauth_setup_token(null);
        if (oauth_cancelled_ref.current) return;
        show_toast(t("settings.oauth_folders_error"), "error");

        await run_sync(account_token).catch((caught) =>
          ignore_error(
            "components/settings/import_section/import_section:ImportSection",
            caught,
          ),
        );
      }

      load_connected_accounts();
    },
    [t, load_connected_accounts, folders_state, run_sync],
  );

  const stop_sync = useCallback(
    async (account_token: string) => {
      set_syncing_accounts((prev) => {
        const next = new Set(prev);

        next.delete(account_token);

        return next;
      });
      try {
        const result = await cancel_sync(account_token);

        if (result.error) {
          show_toast(result.error, "error");
          set_syncing_accounts((prev) => new Set(prev).add(account_token));
        } else {
          show_toast(t("settings.sync_stopped"), "success");
        }
      } catch (caught) {
        ignore_error(
          "components/settings/import_section/import_section:ImportSection",
          caught,
        );
      }
      load_connected_accounts();
    },
    [load_connected_accounts, t],
  );

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
        await run_sync(account_token);
      } catch {
        show_toast(t("settings.connected_accounts_error"), "error");
        clear_syncing_account(account_token);
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
      run_sync,
      clear_syncing_account,
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
    let purge_failed = false;

    try {
      if (should_delete_messages) {
        const purge_result = await purge_external_account_mail(token);

        if (purge_result.error) {
          show_toast(purge_result.error, "error");
          purge_failed = true;
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

          emit_mail_changed();
          emit_folders_changed();
          emit_refresh_requested();
        }
      }

      if (purge_failed) {
        load_connected_accounts();

        return;
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
              count: purged_count.toLocaleString(app_locale()),
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

  const handle_cancel_oauth_setup = useCallback(() => {
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

      set_disconnect_token(token);
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

  const stop_oauth_polling = useCallback(() => {
    if (oauth_poll_interval_ref.current !== null) {
      window.clearInterval(oauth_poll_interval_ref.current);
      oauth_poll_interval_ref.current = null;
    }
    if (oauth_poll_timeout_ref.current !== null) {
      window.clearTimeout(oauth_poll_timeout_ref.current);
      oauth_poll_timeout_ref.current = null;
    }
  }, []);

  useEffect(() => () => stop_oauth_polling(), [stop_oauth_polling]);

  const trigger_post_oauth_setup = useCallback(() => {
    stop_oauth_polling();

    const snapshot_tokens = new Set(
      connected_accounts.map((a) => a.account_token),
    );
    const snapshot_error_tokens = new Set(
      connected_accounts
        .filter(
          (a) => a.protocol === "oauth_imap" && a.last_sync_status === "error",
        )
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
          trigger_sync(a.account_token).catch((caught) =>
            ignore_error(
              "components/settings/import_section/import_section:poll_for_new_account",
              caught,
            ),
          );
          kicked = true;
        }
      }
      if (kicked) return true;

      return false;
    };

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
          stop_oauth_polling();
        }
      }, 2000);

      oauth_poll_interval_ref.current = id;
      oauth_poll_timeout_ref.current = window.setTimeout(() => {
        stopped = true;
        stop_oauth_polling();
      }, 300000);
    });
  }, [connected_accounts, setup_oauth_folders, stop_oauth_polling]);

  // Fallback: handle redirect-path OAuth result (popup blocked / Tauri).
  // use_index_page_state clears the URL before we can read it, so it emits a custom event.
  useEffect(() => {
    const handler = () => trigger_post_oauth_setup();

    window.addEventListener("astermail:oauth-completed", handler);

    return () =>
      window.removeEventListener("astermail:oauth-completed", handler);
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
      {accounts_load_failed && !is_loading_accounts && (
        <LoadFailedNotice
          on_retry={() => {
            set_is_loading_accounts(true);
            load_connected_accounts();
          }}
        />
      )}

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
                is_purging={
                  purging_tokens.has(account.account_token) ||
                  account.last_sync_status === "purging"
                }
                is_setting_up_folders={
                  folder_setup_status === "setting_up" &&
                  oauth_setup_token === account.account_token
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
            const any_loading =
              oauth_loading !== null || connect_provider !== null;

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
                          {t("settings.import_oauth_button")}
                          <Spinner className="text-current" size="sm" />
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
      {!is_loading_jobs && jobs_load_failed && (
        <LoadFailedNotice on_retry={() => load_jobs()} />
      )}

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
        on_close={() => {
          set_connect_provider(null);
          set_oauth_loading(null);
        }}
        on_oauth_success={() => {
          set_connect_provider(null);
          set_oauth_loading(null);
          trigger_post_oauth_setup();
        }}
        provider={connect_provider}
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
                        count: target.email_count.toLocaleString(app_locale()),
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
