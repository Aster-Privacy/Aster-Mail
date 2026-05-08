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
import { motion, AnimatePresence } from "framer-motion";

import { use_forward_modal } from "@/components/modals/hooks/use_forward_modal";
import { ForwardHeader } from "@/components/modals/forward/forward_header";
import { ForwardBody } from "@/components/modals/forward/forward_body";

interface ForwardModalProps {
  is_open: boolean;
  on_close: () => void;
  sender_name: string;
  sender_email: string;
  sender_avatar: string;
  email_subject: string;
  email_body?: string;
  email_timestamp?: string;
  is_external?: boolean;
  original_mail_id?: string;
  thread_token?: string;
  thread_ghost_email?: string;
}

export function ForwardModal({
  is_open,
  on_close,
  sender_name,
  sender_email,
  email_subject,
  email_body = "",
  email_timestamp = new Date().toISOString(),
  is_external = false,
  original_mail_id,
  thread_token,
  thread_ghost_email,
}: ForwardModalProps) {
  const modal = use_forward_modal({
    is_open,
    on_close,
    sender_name,
    sender_email,
    email_subject,
    email_body,
    email_timestamp,
    is_external,
    original_mail_id,
    thread_token,
    thread_ghost_email,
  });

  return (
    <AnimatePresence>
      {is_open && (
        <>
          <motion.div
            key="forward-backdrop-mobile"
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
                key="forward-backdrop"
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-md hidden sm:block"
                exit={{ opacity: 0 }}
                initial={modal.reduce_motion ? false : { opacity: 0 }}
                transition={{ duration: modal.reduce_motion ? 0 : 0.2 }}
              />
            )}
          </AnimatePresence>
          <motion.div
            key="forward-modal"
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
            <ForwardHeader
              contacts={modal.contacts}
              dispatch_recipients={modal.dispatch_recipients}
              email_subject={modal.email_subject}
              ghost_error={modal.ghost_mode.error}
              ghost_expiry_days={modal.ghost_mode.ghost_expiry_days}
              handle_close={modal.handle_close}
              handle_drag_start={modal.handle_drag_start}
              inputs={modal.inputs}
              is_creating_ghost={modal.ghost_mode.is_creating}
              is_expanded={modal.is_expanded}
              is_minimized={modal.is_minimized}
              on_create_ghost={modal.ghost_mode.toggle_ghost_mode}
              on_set_ghost_expiry={modal.ghost_mode.set_ghost_expiry_days}
              recipients={modal.recipients}
              selected_sender={modal.selected_sender}
              sender_options={modal.sender_options}
              set_inputs={modal.set_inputs}
              set_is_expanded={modal.set_is_expanded}
              set_is_minimized={modal.set_is_minimized}
              set_selected_sender={modal.set_selected_sender}
              set_visibility={modal.set_visibility}
              t={modal.t}
              visibility={modal.visibility}
            />

            <ForwardBody
              active_formats={modal.active_formats}
              attachment_error={modal.attachment_error}
              attachments={modal.attachments}
              attachments_scroll_ref={modal.attachments_scroll_ref}
              can_send={modal.can_send}
              draft_status={modal.draft_status}
              editor={modal.editor}
              error_message={modal.error_message}
              exec_format_command={modal.exec_format_command}
              expires_at={modal.expires_at}
              expiry_password={modal.expiry_password}
              file_input_ref={modal.file_input_ref}
              forward_content_ref={modal.forward_content_ref}
              handle_file_select={modal.handle_file_select}
              handle_forward={modal.handle_forward}
              handle_scheduled_send={modal.handle_scheduled_send}
              handle_template_select={modal.handle_template_select}
              is_forward_visible={modal.is_forward_visible}
              is_minimized={modal.is_minimized}
              is_plain_text_mode={modal.is_plain_text_mode}
              is_scheduling={modal.is_scheduling}
              is_sending={modal.is_sending}
              last_saved_time={modal.last_saved_time}
              message_content={modal.forward_message}
              message_editor_ref={modal.message_editor_ref}
              recipients_count={modal.recipients.to.length}
              reduce_motion={modal.reduce_motion}
              remove_attachment={modal.remove_attachment}
              scheduled_time={modal.scheduled_time}
              set_attachment_error={modal.set_attachment_error}
              set_error_message={modal.set_error_message}
              set_expires_at={modal.set_expires_at}
              set_expiry_password={modal.set_expiry_password}
              set_is_forward_visible={modal.set_is_forward_visible}
              set_scheduled_time={modal.set_scheduled_time}
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
