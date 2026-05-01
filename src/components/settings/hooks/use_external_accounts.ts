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
import { useState, useEffect, useCallback, useMemo } from "react";

import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { use_tags } from "@/hooks/use_tags";
import {
  list_external_accounts,
  create_external_account,
  update_external_account,
  toggle_external_account,
  purge_external_account_mail,
  trigger_sync,
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
  sanitize_display_text,
} from "@/components/settings/hooks/external_accounts_utils";
import { use_external_accounts_form } from "@/components/settings/hooks/use_external_accounts_form";

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

export function use_external_accounts() {
  const { t } = use_i18n();
  const sync_frequency_options = useMemo(
    () => get_sync_frequency_options(t),
    [t],
  );
  const tls_method_options = useMemo(() => get_tls_method_options(t), [t]);
  const { create_new_tag } = use_tags();

  const form = use_external_accounts_form(t);

  const [accounts, set_accounts] = useState<DecryptedExternalAccount[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [purge_target, set_purge_target] =
    useState<DecryptedExternalAccount | null>(null);
  const [is_purging, set_is_purging] = useState(false);
  const [show_quota_dialog, set_show_quota_dialog] = useState(false);
  const [quota_sync_message, set_quota_sync_message] = useState("");
  const [failed_icons, set_failed_icons] = useState<Set<string>>(new Set());

  const [, set_sync_tick] = useState(0);

  const [expanded_error_ids, set_expanded_error_ids] = useState<Set<string>>(
    new Set(),
  );

  const fetch_accounts = useCallback(async () => {
    try {
      const result = await list_external_accounts();

      if (result.data && form.is_mounted_ref.current) {
        set_accounts(result.data);
      }
    } finally {
      if (form.is_mounted_ref.current) {
        set_is_loading(false);
      }
    }
  }, []);

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

  const handle_submit = useCallback(async () => {
    if (form.is_form_busy) return;
    if (!form.validate_form()) return;

    form.set_is_submitting(true);

    try {
      const credentials = form.build_credentials();
      const label_name = form.form_label_name.trim() || form.form_email.trim();
      const display_name = form.form_display_name.trim();

      if (form.editing_account) {
        const result = await update_external_account(
          form.editing_account.account_token,
          form.form_email.trim(),
          display_name,
          label_name,
          form.form_label_color,
          credentials,
          form.editing_account.is_enabled,
        );

        if (!form.is_mounted_ref.current) return;

        if (result.data) {
          show_toast(t("settings.account_updated"), "success");
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
        const tag = await create_new_tag(label_name, form.form_label_color);

        if (tag) {
          tag_token = tag.tag_token;
        }

        const result = await create_external_account(
          form.form_email.trim(),
          display_name,
          label_name,
          form.form_label_color,
          credentials,
          form.form_protocol,
          tag_token,
        );

        if (!form.is_mounted_ref.current) return;

        if (result.data) {
          const account_token = result.data.account_token;

          show_toast(t("settings.account_added"), "success");
          await fetch_accounts();
          form.close_form();

          const account_id = result.data.id;

          trigger_sync(account_token).then((sync_result) => {
            if (sync_result.data?.success) {
              global_start_sync_polling(account_id, account_token);
            }
          });
        } else {
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
    form.close_form,
    form.set_is_submitting,
    form.is_mounted_ref,
    create_new_tag,
    fetch_accounts,
  ]);

  const handle_toggle = useCallback(
    async (account: DecryptedExternalAccount) => {
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
      }
    },
    [],
  );

  const handle_sync = useCallback(async (account: DecryptedExternalAccount) => {
    if (check_is_syncing(account.id)) return;

    try {
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
  }, []);

  const handle_purge_confirm = useCallback(async () => {
    if (!purge_target || is_purging) return;

    set_is_purging(true);

    try {
      const result = await purge_external_account_mail(
        purge_target.account_token,
      );

      if (!form.is_mounted_ref.current) return;

      if (result.data?.success) {
        set_accounts((prev) =>
          prev.map((a) =>
            a.id === purge_target.id ? { ...a, email_count: 0 } : a,
          ),
        );
        show_toast(
          t("settings.deleted_emails_count", {
            count: String(result.data.deleted_count),
          }),
          "success",
        );
        invalidate_mail_stats();
      } else {
        show_toast(
          sanitize_display_text(
            result.error || t("settings.failed_delete_emails_external"),
          ),
          "error",
        );
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
      }
    }
  }, [purge_target, is_purging]);

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

  const format_sync_time = useCallback((date_string: string | null) => {
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

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }, []);

  return {
    t,
    sync_frequency_options,
    tls_method_options,
    accounts,
    is_loading,
    show_add_form: form.show_add_form,
    editing_account: form.editing_account,
    is_submitting: form.is_submitting,
    is_testing: form.is_testing,
    test_result: form.test_result,
    form_visible: form.form_visible,
    purge_target,
    set_purge_target,
    is_purging,
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
    form_use_tls: form.form_use_tls,
    set_form_use_tls: form.set_form_use_tls,
    form_label_name: form.form_label_name,
    set_form_label_name: form.set_form_label_name,
    form_label_color: form.form_label_color,
    set_form_label_color: form.set_form_label_color,
    show_password: form.show_password,
    set_show_password: form.set_show_password,
    failed_icons,
    set_failed_icons,
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
    available_folders: form.available_folders,
    selected_folders: form.selected_folders,
    is_fetching_folders: form.is_fetching_folders,
    has_fetched_folders: form.has_fetched_folders,
    show_advanced: form.show_advanced,
    set_show_advanced: form.set_show_advanced,
    form_tls_method: form.form_tls_method,
    set_form_tls_method: form.set_form_tls_method,
    form_connection_timeout: form.form_connection_timeout,
    form_archive_sent: form.form_archive_sent,
    set_form_archive_sent: form.set_form_archive_sent,
    form_delete_after_fetch: form.form_delete_after_fetch,
    set_form_delete_after_fetch: form.set_form_delete_after_fetch,
    expanded_error_ids,
    modal_ref: form.modal_ref,
    is_form_busy: form.is_form_busy,
    truncated_folders: form.truncated_folders,
    open_add_form: form.open_add_form,
    close_form: form.close_form,
    handle_protocol_change: form.handle_protocol_change,
    handle_email_change: form.handle_email_change,
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
