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
import type { SettingsSection } from "@/components/settings/settings_panel";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EnvelopeIcon, NoSymbolIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Sidebar } from "@/components/layout/sidebar";
import { ComposeManager } from "@/components/compose/compose_manager";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { ForwardModal } from "@/components/modals/forward_modal";
import { ReplyModal } from "@/components/modals/reply_modal";
import { ViewSourceModal } from "@/components/modals/view_source_modal";
import { SettingsPanel } from "@/components/settings/settings_panel";
import { use_should_reduce_motion } from "@/provider";
import { use_email_detail } from "@/components/email/hooks/use_email_detail";
import { EmailDetailHeader } from "@/components/email/email_detail/email_detail_header";
import { EmailDetailBody } from "@/components/email/email_detail/email_detail_body";

export default function EmailDetailPage() {
  const reduce_motion = use_should_reduce_motion();
  const detail = use_email_detail();

  useEffect(() => {
    const handle_navigate = (e: Event) => {
      const section = (e as CustomEvent<string>).detail as SettingsSection;

      detail.set_settings_section(section);
      detail.set_is_settings_open(true);
    };

    window.addEventListener("navigate-settings", handle_navigate);

    return () => {
      window.removeEventListener("navigate-settings", handle_navigate);
    };
  }, [detail]);

  return (
    <>
      <div className="h-dvh w-full flex transition-colors duration-200 overflow-hidden bg-[var(--bg-secondary)]">
        <Sidebar
          is_mobile_open={detail.is_mobile_sidebar_open}
          on_compose={detail.open_compose}
          on_mobile_toggle={detail.toggle_mobile_sidebar}
          on_settings_click={(section) => {
            detail.set_settings_section(section);
            detail.set_is_settings_open(true);
          }}
        />
        <div className="flex-1 p-1 md:p-2 min-h-0 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 w-full rounded-lg md:rounded-xl border overflow-hidden flex flex-col transition-colors duration-200 bg-[var(--bg-primary)] border-[var(--border-primary)]">
            <EmailDetailHeader
              can_go_newer={detail.can_go_newer}
              can_go_older={detail.can_go_older}
              current_email_index={detail.current_email_index}
              email_list={detail.email_list}
              handle_archive={detail.handle_archive}
              handle_go_newer={detail.handle_go_newer}
              handle_go_older={detail.handle_go_older}
              handle_print={detail.handle_print}
              handle_trash={detail.handle_trash}
              is_archive_loading={detail.is_archive_loading}
              is_trash_loading={detail.is_trash_loading}
              navigate={detail.navigate}
              preferences={detail.preferences}
              set_is_archive_confirm_open={detail.set_is_archive_confirm_open}
              set_is_trash_confirm_open={detail.set_is_trash_confirm_open}
              t={detail.t}
              toggle_mobile_sidebar={detail.toggle_mobile_sidebar}
            />

            <EmailDetailBody
              current_user_email={detail.current_user_email}
              email={detail.email}
              error={detail.error}
              handle_copy_text={detail.handle_copy_text}
              handle_edit_thread_draft={detail.handle_edit_thread_draft}
              handle_per_message_archive={detail.handle_per_message_archive}
              handle_per_message_forward={detail.handle_per_message_forward}
              handle_per_message_not_spam={
                detail.mail_item?.is_spam
                  ? detail.handle_per_message_not_spam
                  : undefined
              }
              handle_per_message_print={detail.handle_per_message_print}
              handle_per_message_reply={detail.handle_per_message_reply}
              handle_per_message_reply_all={detail.handle_per_message_reply_all}
              handle_per_message_report_phishing={
                detail.handle_per_message_report_phishing
              }
              handle_per_message_trash={detail.handle_per_message_trash}
              handle_per_message_view_source={
                detail.handle_per_message_view_source
              }
              handle_thread_draft_deleted={detail.handle_thread_draft_deleted}
              handle_toggle_message_read={detail.handle_toggle_message_read}
              is_loading={detail.is_loading}
              is_sender_dropdown_open={detail.is_sender_dropdown_open}
              mail_item={detail.mail_item}
              navigate={detail.navigate}
              on_external_content_detected={
                detail.handle_external_content_detected
              }
              set_is_block_sender_modal_open={
                detail.set_is_block_sender_modal_open
              }
              set_is_sender_dropdown_open={detail.set_is_sender_dropdown_open}
              t={detail.t}
              thread_draft={detail.thread_draft}
              thread_messages={detail.thread_messages}
              user={detail.user}
            />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {detail.is_block_sender_modal_open && detail.email && (
          <motion.div
            key="block-sender-modal"
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
          >
            <div
              className="fixed inset-0 bg-black/50 z-50"
              role="button"
              tabIndex={0}
              onClick={() => detail.set_is_block_sender_modal_open(false)}
              onKeyDown={(e) => {
                if (e["key"] === "Enter" || e["key"] === " ") {
                  e.preventDefault();
                  detail.set_is_block_sender_modal_open(false);
                }
              }}
            />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm z-50 px-4 sm:px-0">
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl border p-4 sm:p-6 shadow-xl bg-[var(--bg-primary)] border-[var(--border-secondary)]"
                exit={{ opacity: 0, scale: 0.95 }}
                initial={reduce_motion ? false : { opacity: 0, scale: 0.95 }}
                transition={{ duration: reduce_motion ? 0 : 0.15 }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <NoSymbolIcon className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
                  </div>
                  <h2 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
                    {detail.t("mail.block_sender")}
                  </h2>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 mb-4 p-2 sm:p-3 rounded-lg bg-[var(--bg-secondary)]">
                  <ProfileAvatar
                    use_domain_logo
                    email={detail.email.sender_email}
                    name={detail.email.sender}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs sm:text-sm text-[var(--text-primary)]">
                      {detail.email.sender}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      {detail.email.sender_email}
                    </p>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-4 sm:mb-6">
                  {detail.t("mail.block_sender_spam_warning")}
                </p>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:justify-end">
                  <Button
                    className="w-full sm:w-auto"
                    variant="outline"
                    onClick={() => detail.set_is_block_sender_modal_open(false)}
                  >
                    {detail.t("common.cancel")}
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    variant="destructive"
                    onClick={() => {
                      detail.set_is_block_sender_modal_open(false);
                    }}
                  >
                    {detail.t("mail.block_sender")}
                  </Button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {detail.is_unsubscribe_modal_open && (
          <motion.div
            key="unsubscribe-modal"
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
          >
            <div
              className="fixed inset-0 bg-black/50 z-50"
              role="button"
              tabIndex={0}
              onClick={() => detail.set_is_unsubscribe_modal_open(false)}
              onKeyDown={(e) => {
                if (e["key"] === "Enter" || e["key"] === " ") {
                  e.preventDefault();
                  detail.set_is_unsubscribe_modal_open(false);
                }
              }}
            />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm z-50 px-4 sm:px-0">
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl border p-4 sm:p-6 shadow-xl bg-[var(--bg-primary)] border-[var(--border-secondary)]"
                exit={{ opacity: 0, scale: 0.95 }}
                initial={reduce_motion ? false : { opacity: 0, scale: 0.95 }}
                transition={{ duration: reduce_motion ? 0 : 0.15 }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <EnvelopeIcon className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                  </div>
                  <h2 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
                    {detail.t("mail.unsubscribe_title")}
                  </h2>
                </div>

                <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-4">
                  {detail.t("mail.unsubscribe_confirm_message")}
                </p>

                <div className="p-2 sm:p-3 rounded-lg mb-4 sm:mb-6 bg-[var(--bg-secondary)]">
                  <p className="text-xs text-[var(--text-muted)] mb-2">
                    {detail.t("mail.manual_unsubscribe_link")}
                  </p>
                  <a
                    className="text-xs text-blue-500 hover:text-blue-600 break-all transition-colors"
                    href={
                      detail.email?.unsubscribe_info?.unsubscribe_link ?? "#"
                    }
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {detail.email?.unsubscribe_info?.unsubscribe_link ?? "#"}
                  </a>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:justify-end">
                  <Button
                    className="w-full sm:w-auto"
                    variant="outline"
                    onClick={() => detail.set_is_unsubscribe_modal_open(false)}
                  >
                    {detail.t("common.cancel")}
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => {
                      detail.set_is_unsubscribe_modal_open(false);
                    }}
                  >
                    {detail.t("mail.unsubscribe")}
                  </Button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        show_dont_ask_again
        confirm_text={detail.t("mail.archive")}
        is_open={detail.is_archive_confirm_open}
        message={detail.t("mail.archive_email_message")}
        on_cancel={() => detail.set_is_archive_confirm_open(false)}
        on_confirm={detail.handle_archive}
        on_dont_ask_again={async () => {
          detail.update_preference("confirm_before_archive", false, true);
        }}
        title={detail.t("mail.archive_email_question")}
        variant="info"
      />
      <ConfirmationModal
        show_dont_ask_again
        confirm_text={detail.t("mail.move_to_trash")}
        is_open={detail.is_trash_confirm_open}
        message={detail.t("mail.trash_email_message")}
        on_cancel={() => detail.set_is_trash_confirm_open(false)}
        on_confirm={detail.handle_trash}
        on_dont_ask_again={async () => {
          detail.update_preference("confirm_before_delete", false, true);
        }}
        title={detail.t("mail.move_to_trash_question")}
        variant="danger"
      />
      <ViewSourceModal
        html_body={detail.view_source_message?.body ?? ""}
        is_open={!!detail.view_source_message}
        message_id={detail.view_source_message?.id ?? ""}
        on_close={() => detail.set_view_source_message(null)}
      />
      <ReplyModal
        existing_draft={
          detail.thread_draft
            ? {
                id: detail.thread_draft.id,
                version: detail.thread_draft.version,
                reply_to_id: detail.thread_draft.reply_to_id,
                content: detail.thread_draft.content,
              }
            : null
        }
        is_external={detail.reply_modal_data?.is_external}
        is_open={detail.is_reply_modal_open && !!detail.reply_modal_data}
        on_close={() => {
          detail.set_is_reply_modal_open(false);
          detail.set_reply_modal_data(null);
        }}
        on_draft_saved={detail.handle_draft_saved}
        original_body={detail.reply_modal_data?.original_body ?? ""}
        original_cc={detail.reply_modal_data?.original_cc}
        original_email_id={detail.reply_modal_data?.original_email_id}
        original_rfc_message_id={detail.reply_modal_data?.original_rfc_message_id}
        original_subject={detail.reply_modal_data?.original_subject ?? ""}
        original_timestamp={detail.reply_modal_data?.original_timestamp ?? ""}
        original_to={detail.reply_modal_data?.original_to}
        recipient_avatar=""
        recipient_email={detail.reply_modal_data?.recipient_email ?? ""}
        recipient_name={detail.reply_modal_data?.recipient_name ?? ""}
        reply_all={detail.reply_modal_data?.reply_all}
        reply_from_address={detail.reply_modal_data?.reply_from_address}
        thread_ghost_email={detail.reply_modal_data?.thread_ghost_email}
        thread_token={detail.reply_modal_data?.thread_token}
      />
      <ForwardModal
        email_body={detail.forward_target?.body ?? detail.email?.body}
        email_subject={
          detail.forward_target?.subject ?? detail.email?.subject ?? ""
        }
        email_timestamp={
          detail.forward_target
            ? new Date(detail.forward_target.timestamp).toLocaleString()
            : detail.email?.timestamp
        }
        is_external={
          detail.forward_target?.is_external ?? detail.email?.is_external
        }
        is_open={detail.is_forward_modal_open && !!detail.email}
        on_close={() => {
          detail.set_is_forward_modal_open(false);
          detail.set_forward_target(null);
        }}
        original_mail_id={
          detail.forward_target?.id ?? detail.email?.id ?? detail.email_id
        }
        sender_avatar=""
        sender_email={
          detail.forward_target?.sender_email ??
          detail.email?.sender_email ??
          ""
        }
        sender_name={
          detail.forward_target?.sender_name ?? detail.email?.sender ?? ""
        }
      />
      <SettingsPanel
        initial_section={
          detail.settings_section as "billing" | "account" | undefined
        }
        is_open={detail.is_settings_open}
        on_close={() => {
          detail.set_is_settings_open(false);
          detail.set_settings_section(undefined);
        }}
      />
      <ComposeManager
        instances={detail.compose_instances}
        on_close={detail.close_compose}
        on_toggle_minimize={detail.toggle_minimize}
      />
    </>
  );
}
