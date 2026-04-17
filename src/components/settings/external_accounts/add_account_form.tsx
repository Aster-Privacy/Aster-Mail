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
import type { AddAccountFormProps } from "@/components/settings/external_accounts/form_types";

import { AccountInfoSection } from "@/components/settings/external_accounts/account_info_section";
import { IncomingMailSection } from "@/components/settings/external_accounts/incoming_mail_section";
import { OutgoingMailSection } from "@/components/settings/external_accounts/outgoing_mail_section";
import { LabelSection } from "@/components/settings/external_accounts/label_section";
import { SyncSettingsSection } from "@/components/settings/external_accounts/sync_settings_section";
import { FolderSelectionSection } from "@/components/settings/external_accounts/folder_selection_section";
import { AdvancedSettingsSection } from "@/components/settings/external_accounts/advanced_settings_section";
import { TestResultBanner } from "@/components/settings/external_accounts/test_result_banner";
import { FormFooter } from "@/components/settings/external_accounts/form_footer";

export type { AddAccountFormProps } from "@/components/settings/external_accounts/form_types";

export function AddAccountForm({
  editing_account,
  form_visible,
  modal_ref,
  close_form,
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
  is_testing,
  is_testing_smtp,
  is_submitting,
  test_result,
  smtp_test_result,
  form_sync_frequency,
  set_form_sync_frequency,
  sync_frequency_options,
  available_folders,
  truncated_folders,
  selected_folders,
  is_fetching_folders,
  has_fetched_folders,
  show_advanced,
  set_show_advanced,
  form_tls_method,
  set_form_tls_method,
  tls_method_options,
  form_connection_timeout,
  form_archive_sent,
  set_form_archive_sent,
  form_delete_after_fetch,
  set_form_delete_after_fetch,
  is_form_busy,
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
  handle_test_connection,
  handle_test_smtp,
  handle_fetch_folders,
  handle_folder_toggle,
  handle_submit,
  handle_label_color_change,
  handle_label_color_input,
  t,
}: AddAccountFormProps) {
  return (
    <div
      aria-label={
        editing_account
          ? t("settings.edit_external_account")
          : t("settings.add_external_account")
      }
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="dialog"
      style={{ opacity: form_visible ? 1 : 0, transition: "opacity 200ms" }}
    >
      <div
        className="absolute inset-0 backdrop-blur-md bg-modal-overlay"
        onClick={close_form}
      />
      <div
        ref={modal_ref}
        className="relative w-full max-w-xl mx-4 rounded-xl border shadow-xl transition-all duration-200 max-h-[90vh] overflow-y-auto bg-modal-bg border-edge-primary"
        style={{
          transform: form_visible
            ? "scale(1) translateY(0)"
            : "scale(0.97) translateY(4px)",
          opacity: form_visible ? 1 : 0,
        }}
        tabIndex={-1}
      >
        <div className="sticky top-0 z-10 px-6 pt-6 pb-4 border-b rounded-t-xl bg-modal-bg border-edge-primary">
          <h4 className="text-[15px] font-semibold text-txt-primary">
            {editing_account
              ? t("settings.edit_account")
              : t("settings.add_external_account")}
          </h4>
          <p className="text-[12px] mt-1 text-txt-muted">
            {editing_account
              ? t("settings.edit_external_account_description")
              : t("settings.add_external_account_description")}
          </p>
        </div>

        <div className="p-6 space-y-6">
          <AccountInfoSection
            form_display_name={form_display_name}
            form_email={form_email}
            handle_email_change={handle_email_change}
            set_form_display_name={set_form_display_name}
            t={t}
          />

          <IncomingMailSection
            editing_account={editing_account}
            form_host={form_host}
            form_password={form_password}
            form_port={form_port}
            form_protocol={form_protocol}
            form_use_tls={form_use_tls}
            form_username={form_username}
            handle_host_change={handle_host_change}
            handle_password_change={handle_password_change}
            handle_port_change={handle_port_change}
            handle_protocol_change={handle_protocol_change}
            handle_username_change={handle_username_change}
            set_form_use_tls={set_form_use_tls}
            set_show_password={set_show_password}
            show_password={show_password}
            t={t}
          />

          <OutgoingMailSection
            editing_account={editing_account}
            form_smtp_host={form_smtp_host}
            form_smtp_password={form_smtp_password}
            form_smtp_port={form_smtp_port}
            form_smtp_use_tls={form_smtp_use_tls}
            form_smtp_username={form_smtp_username}
            handle_smtp_host_change={handle_smtp_host_change}
            handle_smtp_password_change={handle_smtp_password_change}
            handle_smtp_port_change={handle_smtp_port_change}
            handle_smtp_same_toggle={handle_smtp_same_toggle}
            handle_smtp_username_change={handle_smtp_username_change}
            set_form_smtp_use_tls={set_form_smtp_use_tls}
            set_show_smtp_password={set_show_smtp_password}
            show_smtp_password={show_smtp_password}
            smtp_same_as_incoming={smtp_same_as_incoming}
            t={t}
          />

          <LabelSection
            form_label_color={form_label_color}
            form_label_name={form_label_name}
            handle_label_color_change={handle_label_color_change}
            handle_label_color_input={handle_label_color_input}
            set_form_label_color={set_form_label_color}
            set_form_label_name={set_form_label_name}
            t={t}
          />

          <SyncSettingsSection
            form_sync_frequency={form_sync_frequency}
            set_form_sync_frequency={set_form_sync_frequency}
            sync_frequency_options={sync_frequency_options}
            t={t}
          />

          {form_protocol === "imap" && (
            <FolderSelectionSection
              available_folders={available_folders}
              handle_fetch_folders={handle_fetch_folders}
              handle_folder_toggle={handle_folder_toggle}
              has_fetched_folders={has_fetched_folders}
              is_fetching_folders={is_fetching_folders}
              selected_folders={selected_folders}
              t={t}
              truncated_folders={truncated_folders}
            />
          )}

          <AdvancedSettingsSection
            form_archive_sent={form_archive_sent}
            form_connection_timeout={form_connection_timeout}
            form_delete_after_fetch={form_delete_after_fetch}
            form_tls_method={form_tls_method}
            handle_connection_timeout_change={handle_connection_timeout_change}
            set_form_archive_sent={set_form_archive_sent}
            set_form_delete_after_fetch={set_form_delete_after_fetch}
            set_form_tls_method={set_form_tls_method}
            set_show_advanced={set_show_advanced}
            show_advanced={show_advanced}
            t={t}
            tls_method_options={tls_method_options}
          />

          {test_result && (
            <TestResultBanner
              label={form_protocol.toUpperCase()}
              result={test_result}
            />
          )}

          {smtp_test_result && (
            <TestResultBanner label="SMTP" result={smtp_test_result} />
          )}
        </div>

        <FormFooter
          close_form={close_form}
          editing_account={editing_account}
          handle_submit={handle_submit}
          handle_test_connection={handle_test_connection}
          handle_test_smtp={handle_test_smtp}
          is_form_busy={is_form_busy}
          is_submitting={is_submitting}
          is_testing={is_testing}
          is_testing_smtp={is_testing_smtp}
          t={t}
        />
      </div>
    </div>
  );
}
