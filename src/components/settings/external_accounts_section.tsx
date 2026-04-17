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
import { PlusIcon, ServerStackIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert_dialog";
import { use_external_accounts } from "@/components/settings/hooks/use_external_accounts";
import { AccountList } from "@/components/settings/external_accounts/account_list";
import { AddAccountForm } from "@/components/settings/external_accounts/add_account_form";

export function ExternalAccountsSection() {
  const state = use_external_accounts();

  if (state.is_loading) {
    return <SettingsSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4 overflow-x-hidden">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
            <ServerStackIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {state.t("settings.external_accounts")}
          </h3>
          {state.accounts.length < 5 && (
            <Button
              className="gap-2"
              size="md"
              variant="depth"
              onClick={state.open_add_form}
            >
              <PlusIcon className="w-4 h-4" />
              {state.t("settings.add_account")}
            </Button>
          )}
        </div>
        <div className="mt-2 h-px bg-edge-secondary" />
        <p className="text-sm mt-3 text-txt-muted">
          {state.t("settings.external_accounts_description")}
        </p>
      </div>

      {(state.show_add_form || state.editing_account) && (
        <AddAccountForm
          available_folders={state.available_folders}
          close_form={state.close_form}
          editing_account={state.editing_account}
          form_archive_sent={state.form_archive_sent}
          form_connection_timeout={state.form_connection_timeout}
          form_delete_after_fetch={state.form_delete_after_fetch}
          form_display_name={state.form_display_name}
          form_email={state.form_email}
          form_host={state.form_host}
          form_label_color={state.form_label_color}
          form_label_name={state.form_label_name}
          form_password={state.form_password}
          form_port={state.form_port}
          form_protocol={state.form_protocol}
          form_smtp_host={state.form_smtp_host}
          form_smtp_password={state.form_smtp_password}
          form_smtp_port={state.form_smtp_port}
          form_smtp_use_tls={state.form_smtp_use_tls}
          form_smtp_username={state.form_smtp_username}
          form_sync_frequency={state.form_sync_frequency}
          form_tls_method={state.form_tls_method}
          form_use_tls={state.form_use_tls}
          form_username={state.form_username}
          form_visible={state.form_visible}
          handle_connection_timeout_change={
            state.handle_connection_timeout_change
          }
          handle_email_change={state.handle_email_change}
          handle_fetch_folders={state.handle_fetch_folders}
          handle_folder_toggle={state.handle_folder_toggle}
          handle_host_change={state.handle_host_change}
          handle_label_color_change={state.handle_label_color_change}
          handle_label_color_input={state.handle_label_color_input}
          handle_password_change={state.handle_password_change}
          handle_port_change={state.handle_port_change}
          handle_protocol_change={state.handle_protocol_change}
          handle_smtp_host_change={state.handle_smtp_host_change}
          handle_smtp_password_change={state.handle_smtp_password_change}
          handle_smtp_port_change={state.handle_smtp_port_change}
          handle_smtp_same_toggle={state.handle_smtp_same_toggle}
          handle_smtp_username_change={state.handle_smtp_username_change}
          handle_submit={state.handle_submit}
          handle_test_connection={state.handle_test_connection}
          handle_test_smtp={state.handle_test_smtp}
          handle_username_change={state.handle_username_change}
          has_fetched_folders={state.has_fetched_folders}
          is_fetching_folders={state.is_fetching_folders}
          is_form_busy={state.is_form_busy}
          is_submitting={state.is_submitting}
          is_testing={state.is_testing}
          is_testing_smtp={state.is_testing_smtp}
          modal_ref={state.modal_ref}
          selected_folders={state.selected_folders}
          set_form_archive_sent={state.set_form_archive_sent}
          set_form_delete_after_fetch={state.set_form_delete_after_fetch}
          set_form_display_name={state.set_form_display_name}
          set_form_label_color={state.set_form_label_color}
          set_form_label_name={state.set_form_label_name}
          set_form_smtp_use_tls={state.set_form_smtp_use_tls}
          set_form_sync_frequency={state.set_form_sync_frequency}
          set_form_tls_method={state.set_form_tls_method}
          set_form_use_tls={state.set_form_use_tls}
          set_show_advanced={state.set_show_advanced}
          set_show_password={state.set_show_password}
          set_show_smtp_password={state.set_show_smtp_password}
          show_advanced={state.show_advanced}
          show_password={state.show_password}
          show_smtp_password={state.show_smtp_password}
          smtp_same_as_incoming={state.smtp_same_as_incoming}
          smtp_test_result={state.smtp_test_result}
          sync_frequency_options={state.sync_frequency_options}
          t={state.t}
          test_result={state.test_result}
          tls_method_options={state.tls_method_options}
          truncated_folders={state.truncated_folders}
        />
      )}

      <AccountList
        accounts={state.accounts.filter((a) => !a.email.endsWith("@import"))}
        expanded_error_ids={state.expanded_error_ids}
        failed_icons={state.failed_icons}
        format_sync_time={state.format_sync_time}
        handle_edit={state.handle_edit}
        handle_sync={state.handle_sync}
        handle_toggle={state.handle_toggle}
        set_failed_icons={state.set_failed_icons}
        set_purge_target={state.set_purge_target}
        t={state.t}
        toggle_error_expand={state.toggle_error_expand}
      />

      <ConfirmationModal
        cancel_text={state.t("common.cancel")}
        confirm_text={
          state.is_purging
            ? state.t("common.deleting")
            : state.t("common.delete_mail")
        }
        is_open={!!state.purge_target}
        message={state.t("settings.purge_confirm_message", {
          count: String(state.purge_target?.email_count ?? 0),
          email: state.purge_target?.email ?? state.t("settings.this_account"),
        })}
        on_cancel={() => state.set_purge_target(null)}
        on_confirm={state.handle_purge_confirm}
        title={state.t("common.delete_imported_emails")}
        variant="danger"
      />
      <AlertDialog
        open={state.show_quota_dialog}
        onOpenChange={state.set_show_quota_dialog}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="text-[16px] font-semibold">
              {state.t("settings.storage_limit_reached")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] leading-normal">
              {state.quota_sync_message ||
                state.t("settings.storage_limit_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 px-6 pb-6 pt-2 sm:justify-end">
            <Button
              className="max-sm:flex-1"
              variant="outline"
              onClick={() => state.set_show_quota_dialog(false)}
            >
              {state.t("common.close")}
            </Button>
            <Button
              className="max-sm:flex-1"
              variant="depth"
              onClick={() => {
                state.set_show_quota_dialog(false);
                window.dispatchEvent(
                  new CustomEvent("astermail:navigate-settings-section", {
                    detail: "billing",
                  }),
                );
              }}
            >
              {state.t("common.upgrade")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
