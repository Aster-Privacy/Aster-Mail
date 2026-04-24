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
import { useMemo } from "react";
import { motion } from "framer-motion";

import { use_should_reduce_motion } from "@/provider";
import {
  type EmailPopupViewerProps,
  FULLSCREEN_MARGIN,
  use_popup_viewer,
} from "@/components/email/hooks/use_popup_viewer";
import { PopupEmailActions } from "@/components/email/popup/popup_email_actions";
import { PopupEmailBody } from "@/components/email/popup/popup_email_body";

export function EmailPopupViewer({
  email_id,
  local_email,
  on_close,
  on_reply,
  on_forward,
  on_compose,
  snoozed_until,
  grouped_email_ids,
  initial_fullscreen,
}: EmailPopupViewerProps) {
  const reduce_motion = use_should_reduce_motion();

  const viewer = use_popup_viewer({
    email_id,
    local_email,
    on_close,
    on_reply,
    on_forward,
    snoozed_until,
    grouped_email_ids,
    initial_fullscreen,
  });

  const memoized_draft = useMemo(
    () =>
      viewer.thread_draft
        ? {
            id: viewer.thread_draft.id,
            version: viewer.thread_draft.version,
            reply_to_id: viewer.thread_draft.reply_to_id,
            content: viewer.thread_draft.content,
          }
        : null,
    [viewer.thread_draft?.id, viewer.thread_draft?.version, viewer.thread_draft?.reply_to_id, viewer.thread_draft?.content],
  );

  if (!email_id && !local_email) return null;

  const popup_left = viewer.is_fullscreen
    ? FULLSCREEN_MARGIN
    : Math.max(
        0,
        Math.min(
          window.innerWidth - viewer.dimensions.width,
          viewer.position.x,
        ),
      );

  const popup_top = viewer.is_fullscreen
    ? FULLSCREEN_MARGIN
    : Math.max(
        0,
        Math.min(
          window.innerHeight - viewer.dimensions.height,
          viewer.position.y,
        ),
      );

  const popup_content = (
    <motion.div
      ref={viewer.popup_ref}
      animate={{ opacity: 1 }}
      className="fixed z-50 flex flex-col shadow-2xl bg-modal-bg"
      exit={{ opacity: 0 }}
      initial={reduce_motion ? false : { opacity: 0 }}
      style={{
        left: popup_left,
        top: popup_top,
        width: viewer.dimensions.width,
        height: viewer.dimensions.height,
        cursor: viewer.is_fullscreen
          ? "default"
          : viewer.is_dragging
            ? "grabbing"
            : "default",
        borderRadius: viewer.is_fullscreen ? "16px" : "12px",
        border: "1px solid var(--border-primary)",
        willChange: "opacity",
      }}
      transition={{ duration: reduce_motion ? 0 : 0.15, ease: "easeOut" }}
      onClick={(e) => e.stopPropagation()}
    >
      <PopupEmailActions
        is_archive_loading={viewer.is_archive_loading}
        is_dragging={viewer.is_dragging}
        is_fullscreen={viewer.is_fullscreen}
        is_pin_loading={viewer.is_pin_loading}
        is_pinned={viewer.is_pinned}
        is_read={viewer.is_read}
        is_spam_loading={viewer.is_spam_loading}
        is_trash_loading={viewer.is_trash_loading}
        mail_item={viewer.mail_item}
        on_archive={viewer.handle_archive}
        on_close={on_close}
        on_drag_start={viewer.handle_drag_start}
        on_fullscreen={viewer.handle_fullscreen}
        on_pin_toggle={viewer.handle_pin_toggle}
        on_print={viewer.handle_print}
        on_read_toggle={viewer.handle_read_toggle}
        on_spam={viewer.handle_spam}
        on_toggle_size={viewer.toggle_size}
        on_trash={viewer.handle_trash}
        on_unsubscribe={viewer.handle_unsubscribe}
        popup_size={viewer.popup_size}
        t={viewer.t}
        unsubscribe_info={viewer.unsubscribe_info}
      />

      <PopupEmailBody
        current_user_email={viewer.user?.email || ""}
        email={viewer.email}
        error={viewer.error}
        existing_draft={memoized_draft}
        external_content_mode={viewer.external_content_mode}
        external_content_state={viewer.external_content_state}
        extraction_result={viewer.extraction_result}
        format_email_popup={viewer.format_email_popup}
        is_fullscreen={viewer.is_fullscreen}
        is_spam={viewer.mail_item?.is_spam === true}
        mail_item={viewer.mail_item}
        on_close={on_close}
        on_compose={on_compose}
        on_dismiss_external_content={viewer.handle_dismiss_external_content}
        on_draft_saved={viewer.handle_draft_saved}
        on_external_content_detected={viewer.handle_external_content_detected}
        loaded_content_types={viewer.loaded_content_types}
        on_load_external_content={viewer.handle_load_external_content}
        on_per_message_archive={viewer.handle_per_message_archive}
        on_per_message_forward={viewer.handle_per_message_forward}
        on_per_message_not_spam={
          viewer.mail_item?.is_spam
            ? viewer.handle_per_message_not_spam
            : undefined
        }
        on_per_message_print={viewer.handle_per_message_print}
        on_per_message_reply={viewer.handle_per_message_reply}
        on_per_message_reply_all={viewer.handle_per_message_reply_all}
        on_per_message_report_phishing={
          viewer.handle_per_message_report_phishing
        }
        on_per_message_trash={viewer.handle_per_message_trash}
        on_toggle_message_read={viewer.handle_toggle_message_read}
        snoozed_until={snoozed_until}
        t={viewer.t}
        thread_messages={viewer.thread_messages}
        thread_token={viewer.mail_item?.thread_token}
        timestamp_date={viewer.timestamp_date}
      />
    </motion.div>
  );

  if (viewer.is_fullscreen) {
    return (
      <>
        <motion.div
          animate={{ opacity: viewer.is_exiting_fullscreen ? 0 : 1 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.2 }}
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-md"
            role="button"
            tabIndex={0}
            onClick={on_close}
            onKeyDown={(e) => {
              if (e["key"] === "Enter" || e["key"] === " ") {
                e.preventDefault();
                on_close();
              }
            }}
          />
          {popup_content}
        </motion.div>
      </>
    );
  }

  return popup_content;
}
