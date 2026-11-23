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
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

import type { OAuthFolderPickerResult } from "@/components/settings/oauth_folder_picker_modal";

import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { use_tags } from "@/hooks/use_tags";
import { use_folders } from "@/hooks/use_folders";
import { mirror_external_account_folders } from "@/services/external_folder_mirror";
import { apply_oauth_folder_selection } from "@/services/external_account_setup";
import {
  list_external_accounts,
  create_external_account,
  update_external_account,
  toggle_external_account,
  purge_external_account_mail,
  delete_external_account,
  trigger_sync,
  get_sync_progress,
  update_sync_settings,
  update_advanced_settings,
  type DecryptedExternalAccount,
} from "@/services/api/external_accounts";
import {
  start_sync_polling as global_start_sync_polling,
  stop_sync_polling as global_stop_sync_polling,
  subscribe_sync_manager,
  is_syncing as check_is_syncing,
} from "@/services/sync_manager";
import {
  type TlsMethod,
  type I18nTranslate,
  get_sync_frequency_options,
  get_tls_method_options,
  resolve_sync_since_date,
  sanitize_display_text,
} from "@/components/settings/hooks/external_accounts_utils";
import { show_plan_limit_upgrade } from "@/stores/upgrade_store";
import {
  parse_external_limit_error,
  upgrade_resource_for,
} from "@/lib/external_account_modes";
import { use_external_accounts_form } from "@/components/settings/hooks/use_external_accounts_form";
import {
  emit_folders_changed,
  emit_mail_changed,
  emit_refresh_requested,
} from "@/hooks/mail_events";
import { app_locale, get_display_time_zone } from "@/utils/date_format";
import { note_bulk_mail_removed } from "@/services/search/index_removals";
import { reset_external_sources_cache } from "@/hooks/use_external_sources";

export type { TlsMethod, I18nTranslate };
export {
  get_sync_frequency_options,
  get_tls_method_options,
  HEX_COLOR_REGEX,
  SYSTEM_FOLDER_NAMES,
  clamp_port,
  clamp_timeout,
  sanitize_hostname,
  is_private_hostname,
  sanitize_display_text,
  is_system_folder,
  get_folder_depth,
} from "@/components/settings/hooks/external_accounts_utils";

const OAUTH_ACCOUNT_POLL_MS = 2000;
const OAUTH_ACCOUNT_POLL_ATTEMPTS = 90;

export function use_external_accounts() {
  const { t } = use_i18n();
  const sync_frequency_options = useMemo(
    () => get_sync_frequency_options(t),
    [t],
  );
  const tls_method_options = useMemo(() => get_tls_method_options(t), [t]);
  const { create_new_tag, update_existing_tag, state: tags_state } = use_tags();
  const { state: folders_state } = use_folders();
  const folders_ref = useRef(folders_state.folders);

  const mirrored_accounts_ref = useRef(new Set<string>());

  folders_ref.current = folders_state.folders;

  const mirror_folders = useCallback(
    async (account_token: string) => {
      try {
        const outcome = await mirror_external_account_folders(
          account_token,
          folders_ref.current,
          t,
        );

        if (outcome.status === "error") {
          show_toast(t("settings.oauth_folders_error"), "error");
        } else if (outcome.status === "ok" && outcome.failures > 0) {
          show_toast(
            t("settings.oauth_folders_partial", { count: outcome.failures }),
            "warning",
          );
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        show_toast(t("settings.oauth_folders_error"), "error");
      }
    },
    [t],
  );

  const form = use_external_accounts_form(t);

  const [accounts, set_accounts] = useState<DecryptedExternalAccount[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [purge_target, set_purge_target] =
    useState<DecryptedExternalAccount | null>(null);
  const [is_purging, set_is_purging] = useState(false);
  const [purge_also_delete_messages, set_purge_also_delete_messages] =
    useState(false);
  const [show_quota_dialog, set_show_quota_dialog] = useState(false);
  const [quota_sync_message, set_quota_sync_message] = useState("");

  const [, set_sync_tick] = useState(0);

  const [expanded_error_ids, set_expanded_error_ids] = useState<Set<string>>(
    new Set(),
  );

  const [load_error, set_load_error] = useState(false);
  const [picker_account, set_picker_account] =
    useState<DecryptedExternalAccount | null>(null);
  const [is_applying_selection, set_is_applying_selection] = useState(false);
  const [connect_microsoft_open, set_connect_microsoft_open] = useState(false);
  const oauth_snapshot_ref = useRef<Set<string>>(new Set());
  const oauth_poll_ref = useRef<number | null>(null);

  const fetch_accounts = useCallback(async () => {
    try {
      const result = await list_external_accounts(
        t("settings.connected_accounts_fallback_name"),
      );

      if (!form.is_mounted_ref.current) return;

      if (result.data) {
        reset_external_sources_cache();
        set_accounts(result.data);
        set_load_error(false);
      } else {
        set_load_error(true);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      if (form.is_mounted_ref.current) set_load_error(true);
    } finally {
      if (form.is_mounted_ref.current) {
        set_is_loading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    fetch_accounts();
  }, [fetch_accounts]);

  useEffect(() => {
    return subscribe_sync_manager(() => set_sync_tick((c) => c + 1));
  }, []);

  useEffect(() => {
    const handle_mail_changed = () => {
      fetch_accounts();
    };
    const handle_quota = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;

      if (detail) {
        set_quota_sync_message(sanitize_display_text(detail));
        set_show_quota_dialog(true);
      }
    };

    window.addEventListener("astermail:mail-changed", handle_mail_changed);
    window.addEventListener("astermail:sync-quota-exceeded", handle_quota);

    return () => {
      window.removeEventListener("astermail:mail-changed", handle_mail_changed);
      window.removeEventListener("astermail:sync-quota-exceeded", handle_quota);
    };
  }, [fetch_accounts]);

  useEffect(() => {
    for (const account of accounts) {
      if (
        account.last_sync_status === "syncing" &&
        !check_is_syncing(account.id)
      ) {
        global_start_sync_polling(account.id, account.account_token);
      }
    }
  }, [accounts]);

  const save_account_settings = useCallback(
    async (
      account_token: string,
      sync_since_date: string | null,
    ): Promise<boolean> => {
      const results = await Promise.allSettled([
        update_sync_settings(account_token, {
          sync_frequency: form.form_sync_frequency,
          sync_folders: form.selected_folders,
          max_messages_per_sync: 500,
          sync_since_date,
        }),
        update_advanced_settings(account_token, {
          tls_method: form.form_tls_method,
          connection_timeout_seconds: form.form_connection_timeout,
          idle_timeout_seconds: 300,
          max_concurrent_connections: 1,
          archive_sent_to_remote: false,
          delete_after_fetch: false,
        }),
      ]);

      return results.every(
        (result) => result.status === "fulfilled" && !result.value.error,
      );
    },
    [
      form.form_sync_frequency,
      form.selected_folders,
      form.form_tls_method,
      form.form_connection_timeout,
    ],
  );

  const handle_submit = useCallback(async () => {
    if (form.is_form_busy) return;
    if (!form.validate_form()) return;

    form.set_is_submitting(true);

    try {
      const credentials = form.build_credentials();
      const label_name = form.form_label_name.trim() || form.form_email.trim();
      const display_name = form.form_display_name.trim();
      const sync_since_date = resolve_sync_since_date({
        is_editing: form.editing_account !== null,
        import_existing: form.form_import_existing,
        current_since_date: form.form_sync_since_date,
        now: new Date(),
      });

      if (form.editing_account) {
        const result = await update_external_account(
          form.editing_account.account_token,
          form.form_email.trim(),
          display_name,
          label_name,
          form.form_label_color,
          form.is_oauth_account ? undefined : credentials,
          form.editing_account.is_enabled,
          undefined,
          form.is_oauth_account ? undefined : form.form_protocol,
        );

        if (!form.is_mounted_ref.current) return;

        if (result.data) {
          const linked_tag = tags_state.tags.find(
            (candidate) =>
              candidate.name.toLowerCase() === label_name.toLowerCase(),
          );

          if (linked_tag && !linked_tag.icon) {
            await update_existing_tag(
              linked_tag.id,
              undefined,
              undefined,
              "envelope",
            );
          }

          const settings_saved = await save_account_settings(
            form.editing_account.account_token,
            sync_since_date,
          );

          if (!form.is_mounted_ref.current) return;

          show_toast(
            settings_saved
              ? t("settings.account_updated")
              : t("settings.account_settings_not_saved"),
            settings_saved ? "success" : "warning",
          );
          await fetch_accounts();
          form.close_form();
        } else {
          show_toast(
            sanitize_display_text(
              result.error || t("settings.failed_update_account"),
            ),
            "error",
          );
        }
      } else {
        let tag_token: string | undefined;
        const tag = await create_new_tag(
          label_name,
          form.form_label_color,
          "envelope",
        );

        if (tag) {
          tag_token = tag.tag_token;
        } else {
          const existing = tags_state.tags.find(
            (candidate) =>
              candidate.name.toLowerCase() === label_name.toLowerCase(),
          );

          if (existing) tag_token = existing.tag_token;
        }

        const result = await create_external_account(
          form.form_email.trim(),
          display_name,
          label_name,
          form.form_label_color,
          credentials,
          form.form_protocol,
          tag_token,
          sync_since_date,
        );

        if (!form.is_mounted_ref.current) return;

        if (result.data) {
          const account_token = result.data.account_token;

          const settings_saved = await save_account_settings(
            account_token,
            sync_since_date,
          );

          if (!form.is_mounted_ref.current) return;

          show_toast(
            settings_saved
              ? t("settings.account_added")
              : t("settings.account_settings_not_saved"),
            settings_saved ? "success" : "warning",
          );
          await fetch_accounts();
          form.close_form();

          const account_id = result.data.id;

          if (form.form_protocol === "imap") {
            await mirror_folders(account_token);
          }

          trigger_sync(account_token).then((sync_result) => {
            if (sync_result.data?.success) {
              global_start_sync_polling(account_id, account_token);
            }
          });
        } else {
          const limit_error = parse_external_limit_error(result);

          if (limit_error) {
            form.close_form();
            show_plan_limit_upgrade({
              resource: upgrade_resource_for(limit_error.cap_class),
            });

            return;
          }

          show_toast(
            sanitize_display_text(
              result.error || t("settings.failed_add_account"),
            ),
            "error",
          );
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      if (form.is_mounted_ref.current) {
        show_toast(t("settings.unexpected_error"), "error");
      }
    } finally {
      if (form.is_mounted_ref.current) {
        form.set_is_submitting(false);
      }
    }
  }, [
    form.is_form_busy,
    form.validate_form,
    form.build_credentials,
    form.form_label_name,
    form.form_email,
    form.form_display_name,
    form.form_label_color,
    form.form_protocol,
    form.editing_account,
    form.form_import_existing,
    form.form_sync_since_date,
    form.close_form,
    form.set_is_submitting,
    form.is_mounted_ref,
    form.form_sync_frequency,
    form.selected_folders,
    form.form_tls_method,
    form.form_connection_timeout,
    create_new_tag,
    update_existing_tag,
    tags_state.tags,
    fetch_accounts,
    save_account_settings,
    mirror_folders,
    t,
  ]);

  const toggling_ids = useRef<Set<string>>(new Set());

  const handle_toggle = useCallback(
    async (account: DecryptedExternalAccount) => {
      if (toggling_ids.current.has(account.id)) return;
      toggling_ids.current.add(account.id);

      const new_enabled = !account.is_enabled;

      if (!new_enabled) {
        global_stop_sync_polling(account.id);
      }

      set_accounts((prev) =>
        prev.map((a) =>
          a.id === account.id ? { ...a, is_enabled: new_enabled } : a,
        ),
      );

      try {
        const result = await toggle_external_account(
          account.account_token,
          new_enabled,
        );

        if (result.error) {
          set_accounts((prev) =>
            prev.map((a) =>
              a.id === account.id ? { ...a, is_enabled: !new_enabled } : a,
            ),
          );
          show_toast(t("settings.failed_update_account"), "error");
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        set_accounts((prev) =>
          prev.map((a) =>
            a.id === account.id ? { ...a, is_enabled: !new_enabled } : a,
          ),
        );
      } finally {
        toggling_ids.current.delete(account.id);
      }
    },
    [t],
  );

  const handle_sync = useCallback(
    async (account: DecryptedExternalAccount) => {
      if (check_is_syncing(account.id)) return;

      if (
        account.protocol === "oauth_imap" &&
        account.has_folder_mapping === false &&
        !account.last_sync_at &&
        !mirrored_accounts_ref.current.has(account.id)
      ) {
        set_picker_account(account);

        return;
      }

      try {
        if (
          account.has_folder_mapping === false &&
          !mirrored_accounts_ref.current.has(account.id) &&
          (account.protocol === "imap" || account.protocol === "oauth_imap")
        ) {
          mirrored_accounts_ref.current.add(account.id);
          await mirror_folders(account.account_token);
        }

        const result = await trigger_sync(account.account_token);

        if (result.data?.success) {
          global_start_sync_polling(account.id, account.account_token);
        } else {
          show_toast(
            sanitize_display_text(result.error || t("settings.failed_sync")),
            "error",
          );
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        show_toast(t("settings.failed_sync"), "error");
      }
    },
    [t, mirror_folders],
  );

  const handle_picker_confirm = useCallback(
    async (selection: OAuthFolderPickerResult) => {
      const account = picker_account;

      if (!account || is_applying_selection) return;

      set_is_applying_selection(true);
      try {
        const outcome = await apply_oauth_folder_selection({
          account_token: account.account_token,
          selected_folders: selection.selected_folders,
          import_existing: selection.import_existing,
          existing_folders: folders_ref.current,
          listed: selection.listed,
          t,
        });

        if (outcome.status !== "ok") {
          show_toast(t("settings.oauth_folders_error"), "error");

          return;
        }
        if (outcome.failures > 0) {
          show_toast(
            t("settings.oauth_folders_partial", { count: outcome.failures }),
            "warning",
          );
        }

        mirrored_accounts_ref.current.add(account.id);
        set_picker_account(null);

        const result = await trigger_sync(account.account_token);

        if (result.data?.success) {
          global_start_sync_polling(account.id, account.account_token);
        } else {
          show_toast(
            sanitize_display_text(result.error || t("settings.failed_sync")),
            "error",
          );
        }
        fetch_accounts();
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        show_toast(t("settings.oauth_folders_error"), "error");
      } finally {
        if (form.is_mounted_ref.current) set_is_applying_selection(false);
      }
    },
    [t, picker_account, is_applying_selection, fetch_accounts],
  );

  const close_picker = useCallback(() => {
    if (is_applying_selection) return;
    set_picker_account(null);
  }, [is_applying_selection]);

  const stop_oauth_account_poll = useCallback(() => {
    if (oauth_poll_ref.current !== null) {
      window.clearInterval(oauth_poll_ref.current);
      oauth_poll_ref.current = null;
    }
  }, []);

  useEffect(() => () => stop_oauth_account_poll(), [stop_oauth_account_poll]);

  const open_microsoft_connect = useCallback(() => {
    oauth_snapshot_ref.current = new Set(accounts.map((a) => a.account_token));
    set_connect_microsoft_open(true);
  }, [accounts]);

  const close_microsoft_connect = useCallback(() => {
    set_connect_microsoft_open(false);
  }, []);

  const handle_microsoft_connected = useCallback(() => {
    set_connect_microsoft_open(false);
    stop_oauth_account_poll();

    const snapshot = oauth_snapshot_ref.current;
    let attempts = 0;
    let in_flight = false;

    const poll = async () => {
      if (in_flight) return;
      in_flight = true;
      attempts += 1;
      try {
        const result = await list_external_accounts(
          t("settings.connected_accounts_fallback_name"),
        );

        if (!form.is_mounted_ref.current) {
          stop_oauth_account_poll();

          return;
        }
        if (result.data) {
          set_accounts(result.data);
          const added = result.data.find(
            (a) =>
              a.protocol === "oauth_imap" && !snapshot.has(a.account_token),
          );

          if (added) {
            stop_oauth_account_poll();
            if (!added.last_sync_at) set_picker_account(added);

            return;
          }
        }
        if (attempts >= OAUTH_ACCOUNT_POLL_ATTEMPTS) stop_oauth_account_poll();
      } finally {
        in_flight = false;
      }
    };

    oauth_poll_ref.current = window.setInterval(poll, OAUTH_ACCOUNT_POLL_MS);
    poll();
  }, [t, stop_oauth_account_poll]);

  const handle_purge_confirm = useCallback(async () => {
    if (!purge_target || is_purging) return;

    set_is_purging(true);
    const target = purge_target;
    const also_delete = purge_also_delete_messages;

    let purged_count = 0;

    try {
      if (also_delete) {
        const purge_result = await purge_external_account_mail(
          target.account_token,
        );

        if (purge_result.error) {
          if (form.is_mounted_ref.current) {
            show_toast(
              sanitize_display_text(
                purge_result.error ||
                  t("settings.failed_delete_emails_external"),
              ),
              "error",
            );
          }

          return;
        } else {
          purged_count = purge_result.data?.deleted_count ?? 0;

          // The purge runs server-side in batches; wait for it to drain
          // before deleting the account so the imported mail keeps its job
          // lineage until every message is gone.
          if (purged_count > 0) {
            let poll_errors = 0;

            for (let i = 0; i < 2400; i++) {
              await new Promise((resolve) => setTimeout(resolve, 1500));
              const prog = await get_sync_progress(target.account_token);

              if (prog.data) {
                poll_errors = 0;
                if (prog.data.status !== "purging") break;
              } else {
                poll_errors += 1;
                if (poll_errors >= 5) break;
              }
            }
          }

          note_bulk_mail_removed();
          emit_mail_changed();
          emit_folders_changed();
          emit_refresh_requested();
        }
      }

      const delete_result = await delete_external_account(target.account_token);

      if (!form.is_mounted_ref.current) return;

      if (delete_result.error) {
        show_toast(sanitize_display_text(delete_result.error), "error");
      } else {
        reset_external_sources_cache();
        set_accounts((prev) => prev.filter((a) => a.id !== target.id));
        if (also_delete && purged_count > 0) {
          show_toast(
            t("settings.disconnect_deleted_success", {
              count: purged_count,
            }),
            "success",
          );
        } else {
          show_toast(t("settings.disconnect_success"), "success");
        }
        invalidate_mail_stats();
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      if (form.is_mounted_ref.current) {
        show_toast(t("settings.failed_delete_emails_external"), "error");
      }
    } finally {
      if (form.is_mounted_ref.current) {
        set_is_purging(false);
        set_purge_target(null);
        set_purge_also_delete_messages(false);
      }
    }
  }, [purge_target, is_purging, purge_also_delete_messages, t]);

  const toggle_error_expand = useCallback((account_id: string) => {
    set_expanded_error_ids((prev) => {
      const next = new Set(prev);

      if (next.has(account_id)) {
        next.delete(account_id);
      } else {
        next.add(account_id);
      }

      return next;
    });
  }, []);

  const format_sync_time = useCallback(
    (date_string: string | null) => {
      if (!date_string) return null;
      const date = new Date(date_string);

      if (Number.isNaN(date.getTime())) return null;

      const now = new Date();
      const diff_ms = now.getTime() - date.getTime();
      const diff_minutes = Math.floor(diff_ms / 60000);

      if (diff_minutes < 1) return t("common.just_now");
      if (diff_minutes < 60)
        return t("common.minutes_ago_short", { count: diff_minutes });

      const diff_hours = Math.floor(diff_minutes / 60);

      if (diff_hours < 24)
        return t("common.hours_ago_short", { count: diff_hours });

      return date.toLocaleDateString(app_locale(), {
        timeZone: get_display_time_zone(),
        month: "short",
        day: "numeric",
      });
    },
    [t],
  );

  const close_form = useCallback(() => {
    const was_editing = form.editing_account !== null;

    form.close_form();
    if (was_editing) void fetch_accounts();
  }, [form.editing_account, form.close_form, fetch_accounts]);

  return {
    t,
    sync_frequency_options,
    tls_method_options,
    accounts,
    is_loading,
    load_error,
    reload_accounts: fetch_accounts,
    show_add_form: form.show_add_form,
    editing_account: form.editing_account,
    is_oauth_account: form.is_oauth_account,
    is_submitting: form.is_submitting,
    is_testing: form.is_testing,
    test_result: form.test_result,
    form_visible: form.form_visible,
    purge_target,
    set_purge_target,
    is_purging,
    purge_also_delete_messages,
    set_purge_also_delete_messages,
    show_quota_dialog,
    set_show_quota_dialog,
    quota_sync_message,
    form_email: form.form_email,
    form_display_name: form.form_display_name,
    set_form_display_name: form.set_form_display_name,
    form_protocol: form.form_protocol,
    form_host: form.form_host,
    form_port: form.form_port,
    form_username: form.form_username,
    form_password: form.form_password,
    has_stored_password: form.has_stored_password,
    has_stored_smtp_password: form.has_stored_smtp_password,
    is_loading_account_settings: form.is_loading_account_settings,
    prefill_failed: form.prefill_failed,
    retry_prefill: form.retry_prefill,
    form_use_tls: form.form_use_tls,
    set_form_use_tls: form.set_form_use_tls,
    form_label_name: form.form_label_name,
    set_form_label_name: form.set_form_label_name,
    form_label_color: form.form_label_color,
    set_form_label_color: form.set_form_label_color,
    show_password: form.show_password,
    set_show_password: form.set_show_password,
    form_smtp_host: form.form_smtp_host,
    form_smtp_port: form.form_smtp_port,
    form_smtp_username: form.form_smtp_username,
    form_smtp_password: form.form_smtp_password,
    show_smtp_password: form.show_smtp_password,
    set_show_smtp_password: form.set_show_smtp_password,
    form_smtp_use_tls: form.form_smtp_use_tls,
    set_form_smtp_use_tls: form.set_form_smtp_use_tls,
    smtp_same_as_incoming: form.smtp_same_as_incoming,
    is_testing_smtp: form.is_testing_smtp,
    smtp_test_result: form.smtp_test_result,
    form_sync_frequency: form.form_sync_frequency,
    set_form_sync_frequency: form.set_form_sync_frequency,
    form_import_existing: form.form_import_existing,
    set_form_import_existing: form.set_form_import_existing,
    available_folders: form.available_folders,
    selected_folders: form.selected_folders,
    is_fetching_folders: form.is_fetching_folders,
    has_fetched_folders: form.has_fetched_folders,
    show_advanced: form.show_advanced,
    set_show_advanced: form.set_show_advanced,
    form_tls_method: form.form_tls_method,
    set_form_tls_method: form.set_form_tls_method,
    form_connection_timeout: form.form_connection_timeout,
    expanded_error_ids,
    is_form_busy: form.is_form_busy,
    truncated_folders: form.truncated_folders,
    open_add_form: form.open_add_form,
    close_form,
    handle_protocol_change: form.handle_protocol_change,
    handle_email_change: form.handle_email_change,
    active_preset: form.active_preset,
    handle_host_change: form.handle_host_change,
    handle_port_change: form.handle_port_change,
    handle_username_change: form.handle_username_change,
    handle_password_change: form.handle_password_change,
    handle_smtp_host_change: form.handle_smtp_host_change,
    handle_smtp_port_change: form.handle_smtp_port_change,
    handle_smtp_username_change: form.handle_smtp_username_change,
    handle_smtp_password_change: form.handle_smtp_password_change,
    handle_smtp_same_toggle: form.handle_smtp_same_toggle,
    handle_connection_timeout_change: form.handle_connection_timeout_change,
    handle_test_connection: form.handle_test_connection,
    handle_test_smtp: form.handle_test_smtp,
    handle_fetch_folders: form.handle_fetch_folders,
    handle_folder_toggle: form.handle_folder_toggle,
    handle_submit,
    handle_toggle,
    handle_sync,
    handle_purge_confirm,
    picker_account,
    is_applying_selection,
    handle_picker_confirm,
    close_picker,
    connect_microsoft_open,
    open_microsoft_connect,
    close_microsoft_connect,
    handle_microsoft_connected,
    handle_edit: form.handle_edit,
    toggle_error_expand,
    format_sync_time,
    handle_label_color_change: form.handle_label_color_change,
    handle_label_color_input: form.handle_label_color_input,
  };
}

export type UseExternalAccountsReturn = ReturnType<
  typeof use_external_accounts
>;
