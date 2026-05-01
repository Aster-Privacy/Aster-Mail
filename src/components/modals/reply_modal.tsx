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
import type { DraftContent } from "@/services/api/multi_drafts";

import { motion, AnimatePresence } from "framer-motion";

import { use_reply_modal } from "@/components/modals/hooks/use_reply_modal";
import { ReplyHeader } from "@/components/modals/reply/reply_header";
import { ReplyBody } from "@/components/modals/reply/reply_body";

interface ReplyModalProps {
  is_open: boolean;
  on_close: () => void;
  recipient_name: string;
  recipient_email: string;
  recipient_avatar: string;
  original_subject?: string;
  original_body?: string;
  original_timestamp?: string;
  original_cc?: string[];
  original_to?: string[];
  reply_all?: boolean;
  thread_token?: string;
  original_email_id?: string;
  is_external?: boolean;
  thread_ghost_email?: string;
  reply_from_address?: string;
  original_rfc_message_id?: string;
  on_draft_saved?: (draft: {
    id: string;
    version: number;
    content: DraftContent;
  }) => void;
  existing_draft?: {
    id: string;
    version: number;
    reply_to_id?: string;
    content: DraftContent;
  } | null;
}

export function ReplyModal({
  is_open,
  on_close,
  recipient_name,
  recipient_email,
  original_subject = "",
  original_body = "",
  original_timestamp = new Date().toISOString(),
  original_cc,
  original_to,
  reply_all = false,
  thread_token,
  original_email_id,
  is_external = false,
  thread_ghost_email,
  reply_from_address,
  original_rfc_message_id,
  on_draft_saved,
  existing_draft,
}: ReplyModalProps) {
  const modal = use_reply_modal({
    is_open,
    on_close,
    recipient_name,
    recipient_email,
    original_subject,
    original_body,
    original_timestamp,
    original_cc,
    original_to,
    reply_all,
    thread_token,
    original_email_id,
    is_external,
    thread_ghost_email,
    reply_from_address,
    original_rfc_message_id,
    on_draft_saved,
    existing_draft,
  });

  return (
    <AnimatePresence>
      {is_open && (
        <>
          <motion.div
            key="reply-backdrop-mobile"
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-black/50 sm:hidden"
            exit={{ opacity: 0 }}
            initial={modal.reduce_motion ? false : { opacity: 0 }}
            transition={{ duration: modal.reduce_motion ? 0 : 0.2 }}
            onClick={on_close}
          />
          <AnimatePresence>
            {modal.is_expanded && (
              <motion.div
                key="reply-backdrop"
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-md hidden sm:block"
                exit={{ opacity: 0 }}
                initial={modal.reduce_motion ? false : { opacity: 0 }}
                transition={{ duration: modal.reduce_motion ? 0 : 0.2 }}
              />
            )}
          </AnimatePresence>
          <motion.div
            key="reply-modal"
            animate={{ opacity: 1, y: 0 }}
            className={`fixed z-50 flex flex-col shadow-2xl sm:border bg-modal-bg border-edge-primary ${
              modal.is_minimized
                ? "sm:w-[320px] sm:h-auto sm:rounded-t-lg"
                : modal.is_expanded
                  ? "inset-0 sm:inset-4 sm:w-auto sm:h-auto sm:rounded-lg"
                  : "inset-0 sm:inset-auto sm:bottom-auto sm:left-auto sm:right-auto sm:h-[600px] sm:w-[700px] sm:max-w-[90vw] sm:max-h-[85vh] sm:rounded-lg"
            }`}
            exit={{ opacity: 0, y: modal.is_mobile ? 100 : 0 }}
            initial={
              modal.reduce_motion
                ? false
                : { opacity: 0, y: modal.is_mobile ? 100 : 0 }
            }
            style={{
              willChange: "opacity, transform",
              ...(window.innerWidth >= 640 &&
              !modal.is_expanded &&
              !modal.is_minimized
                ? modal.get_position_style()
                : {}),
              ...(modal.is_minimized && window.innerWidth >= 640
                ? { bottom: 0, right: 24, top: "auto", left: "auto" }
                : {}),
            }}
            transition={{
              duration: modal.reduce_motion ? 0 : 0.25,
              ease: [0.32, 0.72, 0, 1],
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const files = Array.from(e.dataTransfer?.files || []);
              if (files.length > 0) {
                modal.handle_files_drop(files);
              }
            }}
          >
            <ReplyHeader
              ghost_error={modal.ghost_mode.error}
              ghost_expiry_days={modal.ghost_mode.ghost_expiry_days}
              ghost_locked={
                modal.ghost_mode.is_thread_locked &&
                modal.ghost_mode.is_ghost_enabled
              }
              handle_close={modal.handle_close}
              handle_drag_start={modal.handle_drag_start}
              is_creating_ghost={modal.ghost_mode.is_creating}
              is_expanded={modal.is_expanded}
              is_minimized={modal.is_minimized}
              on_create_ghost={
                modal.ghost_mode.is_thread_locked
                  ? undefined
                  : modal.ghost_mode.toggle_ghost_mode
              }
              on_set_ghost_expiry={
                modal.ghost_mode.is_thread_locked
                  ? undefined
                  : modal.ghost_mode.set_ghost_expiry_days
              }
              original_subject={modal.original_subject}
              recipient_email={modal.recipient_email}
              selected_sender={modal.selected_sender}
              sender_options={modal.sender_options}
              set_is_expanded={modal.set_is_expanded}
              set_is_minimized={modal.set_is_minimized}
              set_selected_sender={
                modal.ghost_mode.is_thread_locked
                  ? () => {}
                  : modal.set_selected_sender
              }
            />

            <ReplyBody
              active_formats={modal.active_formats}
              attachment_error={modal.attachment_error}
              attachments={modal.attachments}
              attachments_scroll_ref={modal.attachments_scroll_ref}
              build_quoted_content={modal.build_quoted_content}
              can_send={modal.can_send}
              draft_id={modal.draft_id}
              draft_status={modal.draft_status}
              editor={modal.editor}
              error_message={modal.error_message}
              exec_format_command={modal.exec_format_command}
              expires_at={modal.expires_at}
              expiry_password={modal.expiry_password}
              file_input_ref={modal.file_input_ref}
              handle_delete_draft={modal.handle_delete_draft}
              handle_file_select={modal.handle_file_select}
              handle_insert_link={modal.handle_insert_link}
              handle_scheduled_send={modal.handle_scheduled_send}
              handle_send={modal.handle_send}
              handle_template_select={modal.handle_template_select}
              is_mac={modal.is_mac}
              is_minimized={modal.is_minimized}
              is_plain_text_mode={modal.is_plain_text_mode}
              is_scheduling={modal.is_scheduling}
              is_sending={modal.is_sending}
              is_valid={modal.is_valid}
              last_saved_time={modal.last_saved_time}
              message_content={modal.reply_message}
              message_editor_ref={modal.message_editor_ref}
              original_body={modal.original_body}
              reduce_motion={modal.reduce_motion}
              remove_attachment={modal.remove_attachment}
              scheduled_time={modal.scheduled_time}
              set_attachment_error={modal.set_attachment_error}
              set_error_message={modal.set_error_message}
              set_expires_at={modal.set_expires_at}
              set_expiry_password={modal.set_expiry_password}
              set_scheduled_time={modal.set_scheduled_time}
              set_show_delete_confirm={modal.set_show_delete_confirm}
              set_show_quoted={modal.set_show_quoted}
              show_delete_confirm={modal.show_delete_confirm}
              show_quoted={modal.show_quoted}
              t={modal.t}
              toggle_plain_text_mode={modal.toggle_plain_text_mode}
              trigger_file_select={modal.trigger_file_select}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
