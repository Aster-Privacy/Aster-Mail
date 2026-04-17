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
  I18nTranslate,
  TlsMethod,
} from "@/components/settings/hooks/external_accounts_utils";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

import {
  clamp_port,
  clamp_timeout,
  sanitize_hostname,
} from "@/components/settings/hooks/external_accounts_utils";
import {
  type DecryptedExternalAccount,
  type ExternalAccountCredentials,
  type SyncFrequency,
} from "@/services/api/external_accounts";
import { use_external_accounts_test } from "@/components/settings/hooks/use_external_accounts_test";

export function use_external_accounts_form(t: I18nTranslate) {
  const [show_add_form, set_show_add_form] = useState(false);
  const [editing_account, set_editing_account] =
    useState<DecryptedExternalAccount | null>(null);
  const [is_submitting, set_is_submitting] = useState(false);
  const [form_visible, set_form_visible] = useState(false);

  const [form_email, set_form_email] = useState("");
  const [form_display_name, set_form_display_name] = useState("");
  const [form_protocol, set_form_protocol] = useState<"imap" | "pop3">("imap");
  const [form_host, set_form_host] = useState("");
  const [form_port, set_form_port] = useState(993);
  const [form_username, set_form_username] = useState("");
  const [form_password, set_form_password] = useState("");
  const [form_use_tls, set_form_use_tls] = useState(true);
  const [form_label_name, set_form_label_name] = useState("");
  const [form_label_color, set_form_label_color] = useState("#3B82F6");
  const [show_password, set_show_password] = useState(false);

  const [form_smtp_host, set_form_smtp_host] = useState("");
  const [form_smtp_port, set_form_smtp_port] = useState(587);
  const [form_smtp_username, set_form_smtp_username] = useState("");
  const [form_smtp_password, set_form_smtp_password] = useState("");
  const [show_smtp_password, set_show_smtp_password] = useState(false);
  const [form_smtp_use_tls, set_form_smtp_use_tls] = useState(true);
  const [smtp_same_as_incoming, set_smtp_same_as_incoming] = useState(true);

  const [form_sync_frequency, set_form_sync_frequency] =
    useState<SyncFrequency>("15m");

  const [show_advanced, set_show_advanced] = useState(false);
  const [form_tls_method, set_form_tls_method] = useState<TlsMethod>("auto");
  const [form_connection_timeout, set_form_connection_timeout] = useState(30);
  const [form_archive_sent, set_form_archive_sent] = useState(false);
  const [form_delete_after_fetch, set_form_delete_after_fetch] =
    useState(false);

  const modal_ref = useRef<HTMLDivElement>(null);
  const previous_focus_ref = useRef<HTMLElement | null>(null);

  const get_effective_smtp_host = useCallback(
    () => (smtp_same_as_incoming ? form_host.trim() : form_smtp_host.trim()),
    [smtp_same_as_incoming, form_host, form_smtp_host],
  );
  const get_effective_smtp_port = useCallback(
    () => (smtp_same_as_incoming ? 587 : form_smtp_port),
    [smtp_same_as_incoming, form_smtp_port],
  );
  const get_effective_smtp_username = useCallback(
    () =>
      smtp_same_as_incoming ? form_username.trim() : form_smtp_username.trim(),
    [smtp_same_as_incoming, form_username, form_smtp_username],
  );
  const get_effective_smtp_password = useCallback(
    () => (smtp_same_as_incoming ? form_password : form_smtp_password),
    [smtp_same_as_incoming, form_password, form_smtp_password],
  );
  const get_effective_smtp_use_tls = useCallback(
    () => (smtp_same_as_incoming ? form_use_tls : form_smtp_use_tls),
    [smtp_same_as_incoming, form_use_tls, form_smtp_use_tls],
  );

  const build_credentials = useCallback(
    (): ExternalAccountCredentials => ({
      host: sanitize_hostname(form_host),
      port: form_port,
      username: form_username.trim(),
      password: form_password,
      use_tls: form_use_tls,
      smtp_host: smtp_same_as_incoming
        ? sanitize_hostname(form_host)
        : sanitize_hostname(form_smtp_host),
      smtp_port: smtp_same_as_incoming ? 587 : form_smtp_port,
      smtp_username: smtp_same_as_incoming
        ? form_username.trim()
        : form_smtp_username.trim(),
      smtp_password: smtp_same_as_incoming ? form_password : form_smtp_password,
    }),
    [
      form_host,
      form_port,
      form_username,
      form_password,
      form_use_tls,
      smtp_same_as_incoming,
      form_smtp_host,
      form_smtp_port,
      form_smtp_username,
      form_smtp_password,
    ],
  );

  const fields = useMemo(
    () => ({
      form_email,
      form_host,
      form_port,
      form_username,
      form_password,
      form_protocol,
      form_use_tls,
      form_smtp_host,
      form_smtp_port,
      form_smtp_username,
      form_smtp_password,
      smtp_same_as_incoming,
      form_label_color,
      form_connection_timeout,
    }),
    [
      form_email,
      form_host,
      form_port,
      form_username,
      form_password,
      form_protocol,
      form_use_tls,
      form_smtp_host,
      form_smtp_port,
      form_smtp_username,
      form_smtp_password,
      smtp_same_as_incoming,
      form_label_color,
      form_connection_timeout,
    ],
  );

  const smtp_effective = useMemo(
    () => ({
      get_effective_smtp_host,
      get_effective_smtp_port,
      get_effective_smtp_username,
      get_effective_smtp_password,
      get_effective_smtp_use_tls,
    }),
    [
      get_effective_smtp_host,
      get_effective_smtp_port,
      get_effective_smtp_username,
      get_effective_smtp_password,
      get_effective_smtp_use_tls,
    ],
  );

  const test_hook = use_external_accounts_test(
    t,
    fields,
    smtp_effective,
    build_credentials,
  );

  const clear_sensitive_form_fields = useCallback(() => {
    set_form_password("");
    set_form_smtp_password("");
    set_show_password(false);
    set_show_smtp_password(false);
  }, []);

  const reset_form = useCallback(() => {
    set_form_email("");
    set_form_display_name("");
    set_form_protocol("imap");
    set_form_host("");
    set_form_port(993);
    set_form_username("");
    set_form_use_tls(true);
    set_form_label_name("");
    set_form_label_color("#3B82F6");
    set_form_smtp_host("");
    set_form_smtp_port(587);
    set_form_smtp_username("");
    set_form_smtp_use_tls(true);
    set_smtp_same_as_incoming(true);
    set_form_sync_frequency("15m");
    set_show_advanced(false);
    set_form_tls_method("auto");
    set_form_connection_timeout(30);
    set_form_archive_sent(false);
    set_form_delete_after_fetch(false);
    clear_sensitive_form_fields();
    test_hook.reset_test_state();
  }, [clear_sensitive_form_fields, test_hook.reset_test_state]);

  const open_add_form = useCallback(() => {
    previous_focus_ref.current = document.activeElement as HTMLElement | null;
    reset_form();
    set_editing_account(null);
    set_show_add_form(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        set_form_visible(true);
        modal_ref.current?.focus();
      });
    });
  }, [reset_form]);

  const close_form = useCallback(() => {
    test_hook.set_is_testing(false);
    test_hook.set_is_testing_smtp(false);
    set_is_submitting(false);
    set_form_visible(false);
    setTimeout(() => {
      set_show_add_form(false);
      set_editing_account(null);
      reset_form();
      if (previous_focus_ref.current) {
        previous_focus_ref.current.focus();
        previous_focus_ref.current = null;
      }
    }, 200);
  }, [reset_form, test_hook.set_is_testing, test_hook.set_is_testing_smtp]);

  useEffect(() => {
    const handle_keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (show_add_form || editing_account)) {
        close_form();
      }
    };

    document.addEventListener("keydown", handle_keydown);

    return () => document.removeEventListener("keydown", handle_keydown);
  }, [show_add_form, editing_account, close_form]);

  const handle_protocol_change = useCallback(
    (protocol: "imap" | "pop3") => {
      set_form_protocol(protocol);
      set_form_port(protocol === "imap" ? 993 : 995);
      test_hook.clear_test_results();
    },
    [test_hook.clear_test_results],
  );

  const handle_email_change = useCallback(
    (email: string) => {
      set_form_email(email);
      set_form_username(email);
      if (!form_label_name || form_label_name === form_email) {
        set_form_label_name(email);
      }
      if (smtp_same_as_incoming) {
        set_form_smtp_username(email);
      }
      test_hook.clear_test_results();
    },
    [
      form_label_name,
      form_email,
      smtp_same_as_incoming,
      test_hook.clear_test_results,
    ],
  );

  const handle_host_change = useCallback(
    (value: string) => {
      set_form_host(value);
      test_hook.clear_test_results();
    },
    [test_hook.clear_test_results],
  );

  const handle_port_change = useCallback(
    (value: string) => {
      set_form_port(clamp_port(parseInt(value, 10)));
      test_hook.clear_test_results();
    },
    [test_hook.clear_test_results],
  );

  const handle_username_change = useCallback(
    (value: string) => {
      set_form_username(value);
      test_hook.clear_test_results();
    },
    [test_hook.clear_test_results],
  );

  const handle_password_change = useCallback(
    (value: string) => {
      set_form_password(value);
      test_hook.clear_test_results();
    },
    [test_hook.clear_test_results],
  );

  const handle_smtp_host_change = useCallback((value: string) => {
    set_form_smtp_host(value);
  }, []);

  const handle_smtp_port_change = useCallback((value: string) => {
    set_form_smtp_port(clamp_port(parseInt(value, 10)));
  }, []);

  const handle_smtp_username_change = useCallback((value: string) => {
    set_form_smtp_username(value);
  }, []);

  const handle_smtp_password_change = useCallback((value: string) => {
    set_form_smtp_password(value);
  }, []);

  const handle_label_color_change = useCallback((value: string) => {
    if (value.startsWith("#") && value.length <= 7) {
      set_form_label_color(value);
    }
  }, []);

  const handle_label_color_input = useCallback((value: string) => {
    const trimmed = value.trim();

    if (trimmed === "" || trimmed === "#") {
      set_form_label_color(trimmed || "#");

      return;
    }

    if (/^#[0-9a-fA-F]{0,6}$/.test(trimmed)) {
      set_form_label_color(trimmed);
    }
  }, []);

  const handle_smtp_same_toggle = useCallback(
    (checked: boolean | "indeterminate") => {
      const is_same = checked === true;

      set_smtp_same_as_incoming(is_same);
    },
    [],
  );

  const handle_connection_timeout_change = useCallback((value: string) => {
    set_form_connection_timeout(clamp_timeout(parseInt(value, 10)));
  }, []);

  const handle_edit = useCallback((account: DecryptedExternalAccount) => {
    previous_focus_ref.current = document.activeElement as HTMLElement | null;
    set_editing_account(account);
    set_form_email(account.email);
    set_form_display_name(account.display_name);
    set_form_protocol(account.protocol as "imap" | "pop3");
    set_form_host("");
    set_form_port(account.protocol === "imap" ? 993 : 995);
    set_form_username(account.email);
    set_form_password("");
    set_form_use_tls(true);
    set_form_label_name(account.label_name);
    set_form_label_color(account.label_color);
    set_show_password(false);
    set_form_smtp_host("");
    set_form_smtp_port(587);
    set_form_smtp_username(account.email);
    set_form_smtp_password("");
    set_show_smtp_password(false);
    set_form_smtp_use_tls(true);
    set_smtp_same_as_incoming(true);
    set_form_sync_frequency("15m");
    set_show_advanced(false);
    set_form_tls_method("auto");
    set_form_connection_timeout(30);
    set_form_archive_sent(false);
    set_form_delete_after_fetch(false);
    set_show_add_form(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        set_form_visible(true);
        modal_ref.current?.focus();
      });
    });
  }, []);

  const is_form_busy =
    is_submitting || test_hook.is_testing || test_hook.is_testing_smtp;

  const truncated_folders = useMemo(() => {
    const max_display = 200;

    return test_hook.available_folders.slice(0, max_display);
  }, [test_hook.available_folders]);

  return {
    show_add_form,
    editing_account,
    is_submitting,
    set_is_submitting,
    is_testing: test_hook.is_testing,
    test_result: test_hook.test_result,
    form_visible,
    form_email,
    form_display_name,
    set_form_display_name,
    form_protocol,
    form_host,
    form_port,
    form_username,
    form_password,
    form_use_tls,
    set_form_use_tls,
    form_label_name,
    set_form_label_name,
    form_label_color,
    set_form_label_color,
    show_password,
    set_show_password,
    form_smtp_host,
    form_smtp_port,
    form_smtp_username,
    form_smtp_password,
    show_smtp_password,
    set_show_smtp_password,
    form_smtp_use_tls,
    set_form_smtp_use_tls,
    smtp_same_as_incoming,
    is_testing_smtp: test_hook.is_testing_smtp,
    smtp_test_result: test_hook.smtp_test_result,
    form_sync_frequency,
    set_form_sync_frequency,
    available_folders: test_hook.available_folders,
    selected_folders: test_hook.selected_folders,
    is_fetching_folders: test_hook.is_fetching_folders,
    has_fetched_folders: test_hook.has_fetched_folders,
    show_advanced,
    set_show_advanced,
    form_tls_method,
    set_form_tls_method,
    form_connection_timeout,
    form_archive_sent,
    set_form_archive_sent,
    form_delete_after_fetch,
    set_form_delete_after_fetch,
    modal_ref,
    is_mounted_ref: test_hook.is_mounted_ref,
    is_form_busy,
    truncated_folders,
    open_add_form,
    close_form,
    validate_form: test_hook.validate_form,
    build_credentials,
    handle_protocol_change,
    handle_email_change,
    handle_host_change,
    handle_port_change,
    handle_username_change,
    handle_password_change,
    handle_smtp_host_change,
    handle_smtp_port_change,
    handle_smtp_username_change,
    handle_smtp_password_change,
    handle_smtp_same_toggle,
    handle_connection_timeout_change,
    handle_test_connection: test_hook.handle_test_connection,
    handle_test_smtp: test_hook.handle_test_smtp,
    handle_fetch_folders: test_hook.handle_fetch_folders,
    handle_folder_toggle: test_hook.handle_folder_toggle,
    handle_label_color_change,
    handle_label_color_input,
    handle_edit,
  };
}
