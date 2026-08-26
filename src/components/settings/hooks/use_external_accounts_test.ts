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
import type { I18nTranslate } from "@/components/settings/hooks/external_accounts_utils";

import { useState, useCallback, useRef, useEffect } from "react";

import { show_toast } from "@/components/toast/simple_toast";
import {
  HOSTNAME_REGEX,
  HEX_COLOR_REGEX,
  sanitize_hostname,
  is_private_hostname,
  sanitize_display_text,
  is_system_folder,
} from "@/components/settings/hooks/external_accounts_utils";
import {
  test_external_connection,
  test_smtp_connection,
  list_account_folders,
  type ExternalAccountCredentials,
  type ExternalAccountFolder,
} from "@/services/api/external_accounts";
import {
  list_oauth_folders,
  type OAuthFolderInfo,
} from "@/services/api/external_accounts/api";

interface FormFields {
  form_email: string;
  form_host: string;
  form_port: number;
  form_username: string;
  form_password: string;
  form_protocol: "imap" | "pop3";
  form_use_tls: boolean;
  form_smtp_host: string;
  form_smtp_port: number;
  form_smtp_username: string;
  form_smtp_password: string;
  smtp_same_as_incoming: boolean;
  form_label_color: string;
  form_connection_timeout: number;
  has_stored_password: boolean;
  has_stored_smtp_password: boolean;
  is_oauth_account: boolean;
  oauth_account_token: string | null;
}

interface SmtpEffective {
  get_effective_smtp_host: () => string;
  get_effective_smtp_port: () => number;
  get_effective_smtp_username: () => string;
  get_effective_smtp_password: () => string;
  get_effective_smtp_use_tls: () => boolean;
}

export function use_external_accounts_test(
  t: I18nTranslate,
  fields: FormFields,
  smtp_effective: SmtpEffective,
  build_credentials: () => ExternalAccountCredentials,
) {
  const [is_testing, set_is_testing] = useState(false);
  const [test_result, set_test_result] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [is_testing_smtp, set_is_testing_smtp] = useState(false);
  const [smtp_test_result, set_smtp_test_result] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [available_folders, set_available_folders] = useState<
    ExternalAccountFolder[]
  >([]);
  const [selected_folders, set_selected_folders] = useState<string[]>([
    "INBOX",
  ]);
  const [is_fetching_folders, set_is_fetching_folders] = useState(false);
  const [has_fetched_folders, set_has_fetched_folders] = useState(false);

  const is_mounted_ref = useRef(true);

  useEffect(() => {
    is_mounted_ref.current = true;

    return () => {
      is_mounted_ref.current = false;
    };
  }, []);

  const clear_test_results = useCallback(() => {
    set_test_result(null);
    set_smtp_test_result(null);
  }, []);

  const clear_smtp_test_result = useCallback(() => {
    set_smtp_test_result(null);
  }, []);

  const validate_hostname_fn = useCallback(
    (host: string, label: string): boolean => {
      const sanitized = sanitize_hostname(host);

      if (!sanitized) {
        show_toast(t("settings.host_required", { label }), "error");

        return false;
      }

      if (!HOSTNAME_REGEX.test(sanitized)) {
        show_toast(t("settings.host_invalid_characters", { label }), "error");

        return false;
      }

      if (is_private_hostname(sanitized)) {
        show_toast(t("settings.host_private_address", { label }), "error");

        return false;
      }

      return true;
    },
    [t],
  );

  const validate_form = useCallback((): boolean => {
    const errors: string[] = [];

    if (!fields.form_email.trim()) {
      errors.push(t("settings.email_required"));
    } else {
      const email_regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!email_regex.test(fields.form_email.trim())) {
        errors.push(t("settings.valid_email_required"));
      }
    }

    if (!fields.is_oauth_account) {
      const sanitized_host = sanitize_hostname(fields.form_host);

      if (!sanitized_host) {
        errors.push(t("settings.incoming_server_required"));
      } else if (!HOSTNAME_REGEX.test(sanitized_host)) {
        errors.push(t("settings.incoming_server_invalid"));
      } else if (is_private_hostname(sanitized_host)) {
        errors.push(t("settings.private_address_error"));
      }

      if (fields.form_port < 1 || fields.form_port > 65535) {
        errors.push(t("settings.incoming_port_error"));
      }

      if (!fields.form_username.trim()) {
        errors.push(t("settings.username_required"));
      }

      if (!fields.form_password.trim() && !fields.has_stored_password) {
        errors.push(t("settings.password_required"));
      }
    }

    if (!fields.is_oauth_account && !fields.smtp_same_as_incoming) {
      const sanitized_smtp_host = sanitize_hostname(fields.form_smtp_host);

      if (!sanitized_smtp_host) {
        errors.push(t("settings.smtp_server_required"));
      } else if (!HOSTNAME_REGEX.test(sanitized_smtp_host)) {
        errors.push(t("settings.smtp_server_invalid"));
      } else if (is_private_hostname(sanitized_smtp_host)) {
        errors.push(t("settings.smtp_private_address_error"));
      }

      if (fields.form_smtp_port < 1 || fields.form_smtp_port > 65535) {
        errors.push(t("settings.smtp_port_error"));
      }
      if (!fields.form_smtp_username.trim()) {
        errors.push(t("settings.smtp_username_required"));
      }
      if (
        !fields.form_smtp_password.trim() &&
        !fields.has_stored_smtp_password
      ) {
        errors.push(t("settings.smtp_password_required"));
      }
    }

    if (!HEX_COLOR_REGEX.test(fields.form_label_color)) {
      errors.push(t("settings.label_color_invalid"));
    }

    if (
      fields.form_connection_timeout < 5 ||
      fields.form_connection_timeout > 120
    ) {
      errors.push(t("settings.connection_timeout_error"));
    }

    if (errors.length > 0) {
      show_toast(errors[0], "error");

      return false;
    }

    return true;
  }, [
    fields.is_oauth_account,
    fields.form_email,
    fields.form_host,
    fields.form_port,
    fields.form_username,
    fields.form_password,
    fields.smtp_same_as_incoming,
    fields.form_smtp_host,
    fields.form_smtp_port,
    fields.form_smtp_username,
    fields.form_smtp_password,
    fields.form_label_color,
    fields.form_connection_timeout,
    fields.has_stored_password,
    fields.has_stored_smtp_password,
    t,
  ]);

  const handle_test_connection = useCallback(async () => {
    if (!fields.form_host.trim() || !fields.form_username.trim()) {
      show_toast(t("settings.fill_server_first"), "error");

      return;
    }

    if (!fields.form_password.trim()) {
      show_toast(t("settings.password_required"), "error");

      return;
    }

    if (
      !validate_hostname_fn(
        fields.form_host,
        t("settings.incoming_mail_server"),
      )
    )
      return;

    set_is_testing(true);
    set_test_result(null);
    set_smtp_test_result(null);

    try {
      const credentials = build_credentials();
      const result = await test_external_connection({
        ...credentials,
        protocol: fields.form_protocol,
      });

      if (!is_mounted_ref.current) return;

      if (result.data) {
        set_test_result({
          success: result.data.success,
          message: sanitize_display_text(result.data.message),
        });
      } else {
        set_test_result({
          success: false,
          message: sanitize_display_text(
            result.error || t("settings.connection_test_failed"),
          ),
        });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      if (is_mounted_ref.current) {
        set_test_result({
          success: false,
          message: t("settings.connection_test_failed"),
        });
      }
    } finally {
      if (is_mounted_ref.current) {
        set_is_testing(false);
      }
    }
  }, [
    fields.form_host,
    fields.form_username,
    fields.form_password,
    fields.form_protocol,
    build_credentials,
    validate_hostname_fn,
    t,
  ]);

  const handle_test_smtp = useCallback(async () => {
    const smtp_host = smtp_effective.get_effective_smtp_host();
    const smtp_username = smtp_effective.get_effective_smtp_username();
    const smtp_password = smtp_effective.get_effective_smtp_password();

    if (!smtp_host || !smtp_username || !smtp_password) {
      show_toast(t("settings.fill_smtp_first"), "error");

      return;
    }

    if (!validate_hostname_fn(smtp_host, t("settings.smtp_server"))) return;

    set_is_testing_smtp(true);
    set_smtp_test_result(null);
    set_test_result(null);

    try {
      const result = await test_smtp_connection({
        smtp_host: sanitize_hostname(smtp_host),
        smtp_port: smtp_effective.get_effective_smtp_port(),
        smtp_username,
        smtp_password,
        use_tls: smtp_effective.get_effective_smtp_use_tls(),
      });

      if (!is_mounted_ref.current) return;

      if (result.data) {
        set_smtp_test_result({
          success: result.data.success,
          message: sanitize_display_text(result.data.message),
        });
      } else {
        set_smtp_test_result({
          success: false,
          message: sanitize_display_text(
            result.error || t("settings.smtp_test_failed"),
          ),
        });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      if (is_mounted_ref.current) {
        set_smtp_test_result({
          success: false,
          message: t("settings.smtp_test_failed"),
        });
      }
    } finally {
      if (is_mounted_ref.current) {
        set_is_testing_smtp(false);
      }
    }
  }, [
    smtp_effective.get_effective_smtp_host,
    smtp_effective.get_effective_smtp_username,
    smtp_effective.get_effective_smtp_password,
    smtp_effective.get_effective_smtp_port,
    smtp_effective.get_effective_smtp_use_tls,
    validate_hostname_fn,
    t,
  ]);

  const fetch_oauth_folders = useCallback(
    async (account_token: string) => {
      set_is_fetching_folders(true);

      try {
        const result = await list_oauth_folders(account_token);

        if (!is_mounted_ref.current) return;

        if (result.data?.folders) {
          const custom_folders = result.data.folders
            .filter((f: OAuthFolderInfo) => !is_system_folder(f.name))
            .map((f: OAuthFolderInfo) => ({
              name: f.name,
              path: f.name,
              delimiter: f.delimiter,
              message_count: 0,
              unseen_count: 0,
              hasChildren: false,
              is_selectable: true,
            }));

          set_available_folders(custom_folders);
          set_has_fetched_folders(true);
        } else {
          show_toast(
            sanitize_display_text(
              result.error || t("settings.failed_fetch_folders_external"),
            ),
            "error",
          );
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        if (is_mounted_ref.current) {
          show_toast(t("settings.failed_fetch_folders_external"), "error");
        }
      } finally {
        if (is_mounted_ref.current) {
          set_is_fetching_folders(false);
        }
      }
    },
    [t],
  );

  const handle_fetch_folders = useCallback(async () => {
    if (fields.oauth_account_token) {
      await fetch_oauth_folders(fields.oauth_account_token);

      return;
    }

    const host = sanitize_hostname(fields.form_host.trim());
    const username = fields.form_username.trim();
    const password = fields.form_password;

    if (!host || !username) {
      show_toast(t("settings.fill_connection_first"), "error");

      return;
    }

    if (!password) {
      show_toast(t("settings.password_required"), "error");

      return;
    }

    set_is_fetching_folders(true);

    try {
      const result = await list_account_folders({
        host,
        port: fields.form_port,
        username,
        password,
        protocol: fields.form_protocol,
        use_tls: fields.form_use_tls,
      });

      if (!is_mounted_ref.current) return;

      if (result.data?.folders) {
        const custom_folders = result.data.folders.filter(
          (f: ExternalAccountFolder) => !is_system_folder(f.name),
        );

        set_available_folders(custom_folders);
        set_has_fetched_folders(true);
      } else {
        show_toast(
          sanitize_display_text(
            result.error || t("settings.failed_fetch_folders_external"),
          ),
          "error",
        );
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      if (is_mounted_ref.current) {
        show_toast(t("settings.failed_fetch_folders_external"), "error");
      }
    } finally {
      if (is_mounted_ref.current) {
        set_is_fetching_folders(false);
      }
    }
  }, [
    fields.form_host,
    fields.form_port,
    fields.form_username,
    fields.form_password,
    fields.form_protocol,
    fields.form_use_tls,
    t,
  ]);

  const handle_folder_toggle = useCallback((folder_path: string) => {
    set_selected_folders((prev) =>
      prev.includes(folder_path)
        ? prev.filter((f) => f !== folder_path)
        : [...prev, folder_path],
    );
  }, []);

  const reset_test_state = useCallback(() => {
    set_test_result(null);
    set_smtp_test_result(null);
    set_is_testing(false);
    set_is_testing_smtp(false);
    set_available_folders([]);
    set_selected_folders(["INBOX"]);
    set_is_fetching_folders(false);
    set_has_fetched_folders(false);
  }, []);

  return {
    is_testing,
    test_result,
    is_testing_smtp,
    smtp_test_result,
    available_folders,
    selected_folders,
    set_selected_folders,
    is_fetching_folders,
    has_fetched_folders,
    is_mounted_ref,
    clear_test_results,
    clear_smtp_test_result,
    validate_form,
    handle_test_connection,
    handle_test_smtp,
    handle_fetch_folders,
    handle_folder_toggle,
    reset_test_state,
    set_is_testing,
    set_is_testing_smtp,
  };
}
