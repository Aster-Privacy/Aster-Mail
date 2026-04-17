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
import type { RefObject } from "react";
import type {
  DecryptedExternalAccount,
  ExternalAccountFolder,
  SyncFrequency,
} from "@/services/api/external_accounts";
import type {
  TlsMethod,
  UseExternalAccountsReturn,
} from "@/components/settings/hooks/use_external_accounts";

export interface AddAccountFormProps {
  editing_account: DecryptedExternalAccount | null;
  form_visible: boolean;
  modal_ref: RefObject<HTMLDivElement>;
  close_form: () => void;
  form_email: string;
  form_display_name: string;
  set_form_display_name: (value: string) => void;
  form_protocol: "imap" | "pop3";
  form_host: string;
  form_port: number;
  form_username: string;
  form_password: string;
  form_use_tls: boolean;
  set_form_use_tls: (value: boolean) => void;
  form_label_name: string;
  set_form_label_name: (value: string) => void;
  form_label_color: string;
  set_form_label_color: (value: string) => void;
  show_password: boolean;
  set_show_password: (value: boolean) => void;
  form_smtp_host: string;
  form_smtp_port: number;
  form_smtp_username: string;
  form_smtp_password: string;
  show_smtp_password: boolean;
  set_show_smtp_password: (value: boolean) => void;
  form_smtp_use_tls: boolean;
  set_form_smtp_use_tls: (value: boolean) => void;
  smtp_same_as_incoming: boolean;
  is_testing: boolean;
  is_testing_smtp: boolean;
  is_submitting: boolean;
  test_result: { success: boolean; message: string } | null;
  smtp_test_result: { success: boolean; message: string } | null;
  form_sync_frequency: SyncFrequency;
  set_form_sync_frequency: (value: SyncFrequency) => void;
  sync_frequency_options: { value: SyncFrequency; label: string }[];
  available_folders: ExternalAccountFolder[];
  truncated_folders: ExternalAccountFolder[];
  selected_folders: string[];
  is_fetching_folders: boolean;
  has_fetched_folders: boolean;
  show_advanced: boolean;
  set_show_advanced: (value: boolean) => void;
  form_tls_method: TlsMethod;
  set_form_tls_method: (value: TlsMethod) => void;
  tls_method_options: { value: TlsMethod; label: string }[];
  form_connection_timeout: number;
  form_archive_sent: boolean;
  set_form_archive_sent: (value: boolean) => void;
  form_delete_after_fetch: boolean;
  set_form_delete_after_fetch: (value: boolean) => void;
  is_form_busy: boolean;
  handle_protocol_change: (protocol: "imap" | "pop3") => void;
  handle_email_change: (email: string) => void;
  handle_host_change: (value: string) => void;
  handle_port_change: (value: string) => void;
  handle_username_change: (value: string) => void;
  handle_password_change: (value: string) => void;
  handle_smtp_host_change: (value: string) => void;
  handle_smtp_port_change: (value: string) => void;
  handle_smtp_username_change: (value: string) => void;
  handle_smtp_password_change: (value: string) => void;
  handle_smtp_same_toggle: (checked: boolean) => void;
  handle_connection_timeout_change: (value: string) => void;
  handle_test_connection: () => void;
  handle_test_smtp: () => void;
  handle_fetch_folders: () => void;
  handle_folder_toggle: (folder_path: string) => void;
  handle_submit: () => void;
  handle_label_color_change: (value: string) => void;
  handle_label_color_input: (value: string) => void;
  t: UseExternalAccountsReturn["t"];
}

export type TranslationFn = UseExternalAccountsReturn["t"];
