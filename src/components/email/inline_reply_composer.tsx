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

import { forwardRef, useState, useRef, useCallback, useEffect } from "react";
import {
  XMarkIcon,
  ChevronDownIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
} from "@heroicons/react/24/outline";

import { use_reply_modal } from "@/components/modals/hooks/use_reply_modal";
import { use_forward_modal } from "@/components/modals/hooks/use_forward_modal";
import { ReplyBody } from "@/components/modals/reply/reply_body";
import { ForwardBody } from "@/components/modals/forward/forward_body";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { RecipientField } from "@/components/compose/compose_shared";
import { SenderSelector } from "@/components/compose/sender_selector";

interface InlineReplyComposerProps {
  recipient_name: string;
  recipient_email: string;
  sender_name: string;
  sender_email: string;
  original_subject: string;
  original_body: string;
  original_timestamp: string;
  original_cc?: string[];
  original_to?: string[];
  reply_all?: boolean;
  thread_token?: string;
  original_email_id?: string;
  is_external?: boolean;
  thread_ghost_email?: string;
  reply_from_address?: string;
  on_close: () => void;
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
  inline_mode?: "reply" | "reply_all" | "forward";
  on_set_inline_mode?: (mode: "reply" | "reply_all" | "forward") => void;
}

export const InlineReplyComposer = forwardRef<
  HTMLDivElement,
  InlineReplyComposerProps
>(function InlineReplyComposer(
  {
    recipient_name,
    recipient_email,
    sender_name,
    sender_email,
    original_subject,
    original_body,
    original_timestamp,
    original_cc,
    original_to,
    reply_all: _reply_all = false,
    thread_token,
    original_email_id,
    is_external = false,
    thread_ghost_email,
    reply_from_address,
    on_close,
    on_draft_saved,
    existing_draft,
    inline_mode = "reply",
    on_set_inline_mode,
  },
  ref,
) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [is_fullscreen, set_is_fullscreen] = useState(false);
  const saved_scroll_ref = useRef<number>(0);
  const scroll_container_ref = useRef<HTMLElement | null>(null);
  const composer_el_ref = useRef<HTMLDivElement | null>(null);

  const get_scroll_container = useCallback(
    (el: HTMLElement | null): HTMLElement | null => {
      let node = el?.parentElement;

      while (node) {
        const style = getComputedStyle(node);

        if (
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          node.scrollHeight > node.clientHeight
        ) {
          return node;
        }
        node = node.parentElement;
      }

      return null;
    },
    [],
  );

  const toggle_fullscreen = useCallback(() => {
    if (!is_fullscreen) {
      const container = get_scroll_container(composer_el_ref.current);

      scroll_container_ref.current = container;
      saved_scroll_ref.current = container
        ? container.scrollTop
        : window.scrollY;
      set_is_fullscreen(true);
    } else {
      set_is_fullscreen(false);
      requestAnimationFrame(() => {
        const container = scroll_container_ref.current;

        if (container) {
          container.scrollTop = saved_scroll_ref.current;
        } else {
          window.scrollTo(0, saved_scroll_ref.current);
        }
      });
    }
  }, [is_fullscreen, get_scroll_container]);

  useEffect(() => {
    if (composer_el_ref.current) {
      requestAnimationFrame(() => {
        composer_el_ref.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      });
    }
  }, []);

  const is_reply_mode = inline_mode === "reply" || inline_mode === "reply_all";

  const reply_modal = use_reply_modal({
    is_open: is_reply_mode,
    on_close,
    recipient_name,
    recipient_email,
    original_subject,
    original_body,
    original_timestamp,
    original_cc,
    original_to,
    reply_all: inline_mode === "reply_all",
    thread_token,
    original_email_id,
    is_external,
    thread_ghost_email,
    reply_from_address,
    on_draft_saved,
    existing_draft,
  });

  const forward_modal = use_forward_modal({
    is_open: inline_mode === "forward",
    on_close,
    sender_name,
    sender_email,
    email_subject: original_subject,
    email_body: original_body,
    email_timestamp: original_timestamp,
    is_external,
    original_mail_id: original_email_id,
  });

  const mode_label =
    inline_mode === "reply"
      ? t("mail.reply")
      : inline_mode === "reply_all"
        ? t("mail.reply_all")
        : t("mail.forward");

  const reply_icon_path = "M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3";
  const forward_icon_path = "M15 15L21 9m0 0l-6-6M21 9H9a6 6 0 000 12h3";
  const reply_all_extra_path = "M13 15L7 9m0 0l6-6";

  const render_mode_icon = (
    mode: "reply" | "reply_all" | "forward",
    class_name: string,
  ) => {
    if (mode === "forward") {
      return (
        <svg
          className={class_name}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            d={forward_icon_path}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    }

    return (
      <svg
        className={class_name}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          d={reply_icon_path}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {mode === "reply_all" && (
          <path
            d={reply_all_extra_path}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    );
  };

  const header = (
    <div
      className="flex items-center justify-between px-4 py-2 flex-shrink-0"
    >
      <div className="flex items-center gap-2 text-sm text-txt-secondary min-w-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 p-1.5 rounded hover:bg-surf-hover transition-colors">
              {render_mode_icon(
                inline_mode,
                "w-4 h-4 flex-shrink-0 text-txt-muted",
              )}
              <ChevronDownIcon className="w-3 h-3 text-txt-muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem onClick={() => on_set_inline_mode?.("reply")}>
              {render_mode_icon("reply", "w-4 h-4 mr-2")}
              {t("mail.reply")}
            </DropdownMenuItem>
            {(original_to?.length ?? 0) + (original_cc?.length ?? 0) >= 2 && (
              <DropdownMenuItem
                onClick={() => on_set_inline_mode?.("reply_all")}
              >
                {render_mode_icon("reply_all", "w-4 h-4 mr-2")}
                {t("mail.reply_all")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => on_set_inline_mode?.("forward")}>
              {render_mode_icon("forward", "w-4 h-4 mr-2")}
              {t("mail.forward")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {is_reply_mode && (
          <>
            <ProfileAvatar
              use_domain_logo
              email={recipient_email}
              name={recipient_name}
              size="xs"
            />
            <span className="truncate">
              {mode_label}: {recipient_email}
            </span>
          </>
        )}
        {inline_mode === "forward" && (
          <span className="truncate">
            {mode_label}: {original_subject}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          className="p-1.5 rounded-md text-txt-muted hover:bg-surf-hover transition-colors"
          onClick={toggle_fullscreen}
        >
          {is_fullscreen ? (
            <ArrowsPointingInIcon className="w-4 h-4" />
          ) : (
            <ArrowsPointingOutIcon className="w-4 h-4" />
          )}
        </button>
        <button
          className="p-1.5 rounded-md text-txt-muted hover:bg-surf-hover transition-colors"
          onClick={on_close}
        >
          <XMarkIcon className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );

  const reply_sender_field = is_reply_mode ? (
    <div className="px-4 pt-1 pb-1 flex-shrink-0 relative z-20">
      <div className="flex items-center gap-2 py-1.5">
        <span className="text-sm flex-shrink-0 text-txt-tertiary">
          {t("common.from_label")}
        </span>
        <SenderSelector
          on_select={reply_modal.set_selected_sender}
          options={reply_modal.sender_options}
          selected={reply_modal.selected_sender}
        />
      </div>
    </div>
  ) : null;

  const forward_fields =
    inline_mode === "forward" ? (
      <div className="px-4 pt-1 pb-1 min-h-0 overflow-y-auto relative z-20">
        <div className="flex items-center gap-2 py-1.5">
          <span className="text-sm flex-shrink-0 text-txt-tertiary">
            {t("common.from_label")}
          </span>
          <SenderSelector
            on_select={forward_modal.set_selected_sender}
            options={forward_modal.sender_options}
            selected={forward_modal.selected_sender}
          />
        </div>
        <div className="py-1.5">
          <RecipientField
            auto_focus
            contacts={forward_modal.contacts}
            input_value={forward_modal.inputs.to}
            label={t("mail.to")}
            on_add_recipient={(email) => {
              forward_modal.dispatch_recipients({
                type: "ADD",
                field: "to",
                email,
              });
            }}
            on_input_change={(val) =>
              forward_modal.set_inputs((prev) => ({ ...prev, to: val }))
            }
            on_remove_last={() => {
              forward_modal.dispatch_recipients({
                type: "REMOVE_LAST",
                field: "to",
              });
            }}
            on_remove_recipient={(email) => {
              forward_modal.dispatch_recipients({
                type: "REMOVE",
                field: "to",
                email,
              });
            }}
            recipients={forward_modal.recipients.to}
          />
        </div>
      </div>
    ) : null;

  const body = is_reply_mode ? (
    <ReplyBody
      active_formats={reply_modal.active_formats}
      attachment_error={reply_modal.attachment_error}
      attachments={reply_modal.attachments}
      attachments_scroll_ref={reply_modal.attachments_scroll_ref}
      build_quoted_content={reply_modal.build_quoted_content}
      can_send={reply_modal.can_send}
      draft_id={reply_modal.draft_id}
      draft_status={reply_modal.draft_status}
      editor={reply_modal.editor}
      error_message={reply_modal.error_message}
      exec_format_command={reply_modal.exec_format_command}
      expires_at={reply_modal.expires_at}
      expiry_password={reply_modal.expiry_password}
      file_input_ref={reply_modal.file_input_ref}
      handle_delete_draft={reply_modal.handle_delete_draft}
      handle_file_select={reply_modal.handle_file_select}
      handle_insert_link={reply_modal.handle_insert_link}
      handle_scheduled_send={reply_modal.handle_scheduled_send}
      handle_send={reply_modal.handle_send}
      handle_template_select={reply_modal.handle_template_select}
      is_mac={reply_modal.is_mac}
      is_minimized={false}
      is_plain_text_mode={reply_modal.is_plain_text_mode}
      is_scheduling={reply_modal.is_scheduling}
      is_sending={reply_modal.is_sending}
      is_valid={reply_modal.is_valid}
      last_saved_time={reply_modal.last_saved_time}
      message_content={reply_modal.reply_message}
      message_editor_ref={reply_modal.message_editor_ref}
      original_body={reply_modal.original_body}
      reduce_motion={reduce_motion}
      remove_attachment={reply_modal.remove_attachment}
      scheduled_time={reply_modal.scheduled_time}
      set_attachment_error={reply_modal.set_attachment_error}
      set_error_message={reply_modal.set_error_message}
      set_expires_at={reply_modal.set_expires_at}
      set_expiry_password={reply_modal.set_expiry_password}
      set_scheduled_time={reply_modal.set_scheduled_time}
      set_show_delete_confirm={reply_modal.set_show_delete_confirm}
      set_show_quoted={reply_modal.set_show_quoted}
      show_delete_confirm={reply_modal.show_delete_confirm}
      show_quoted={reply_modal.show_quoted}
      t={reply_modal.t}
      toggle_plain_text_mode={reply_modal.toggle_plain_text_mode}
      trigger_file_select={reply_modal.trigger_file_select}
    />
  ) : (
    <ForwardBody
      active_formats={forward_modal.active_formats}
      attachment_error={forward_modal.attachment_error}
      attachments={forward_modal.attachments}
      attachments_scroll_ref={forward_modal.attachments_scroll_ref}
      can_send={forward_modal.can_send}
      draft_status={forward_modal.draft_status}
      editor={forward_modal.editor}
      error_message={forward_modal.error_message}
      exec_format_command={forward_modal.exec_format_command}
      expires_at={forward_modal.expires_at}
      expiry_password={forward_modal.expiry_password}
      file_input_ref={forward_modal.file_input_ref}
      forward_content_ref={forward_modal.forward_content_ref}
      handle_file_select={forward_modal.handle_file_select}
      handle_forward={forward_modal.handle_forward}
      handle_scheduled_send={forward_modal.handle_scheduled_send}
      handle_template_select={forward_modal.handle_template_select}
      is_forward_visible={forward_modal.is_forward_visible}
      is_minimized={false}
      is_plain_text_mode={forward_modal.is_plain_text_mode}
      is_scheduling={forward_modal.is_scheduling}
      is_sending={forward_modal.is_sending}
      last_saved_time={forward_modal.last_saved_time}
      message_content={forward_modal.forward_message}
      message_editor_ref={forward_modal.message_editor_ref}
      recipients_count={forward_modal.recipients.to.length}
      reduce_motion={reduce_motion}
      remove_attachment={forward_modal.remove_attachment}
      scheduled_time={forward_modal.scheduled_time}
      set_attachment_error={forward_modal.set_attachment_error}
      set_error_message={forward_modal.set_error_message}
      set_expires_at={forward_modal.set_expires_at}
      set_expiry_password={forward_modal.set_expiry_password}
      set_is_forward_visible={forward_modal.set_is_forward_visible}
      set_scheduled_time={forward_modal.set_scheduled_time}
      t={forward_modal.t}
      toggle_plain_text_mode={forward_modal.toggle_plain_text_mode}
      trigger_file_select={forward_modal.trigger_file_select}
      on_discard={on_close}
    />
  );

  const set_refs = useCallback(
    (node: HTMLDivElement | null) => {
      composer_el_ref.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [ref],
  );

  if (is_fullscreen) {
    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={toggle_fullscreen}
        />
        <div
          className="fixed inset-4 sm:inset-8 md:inset-12 z-50 flex flex-col rounded-xl border border-edge-primary bg-surf-primary shadow-2xl overflow-hidden"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const files = Array.from(e.dataTransfer?.files || []);
            if (files.length > 0) {
              const drop_handler = is_reply_mode
                ? reply_modal.handle_files_drop
                : forward_modal.handle_files_drop;
              drop_handler(files);
            }
          }}
        >
          {header}
          {reply_sender_field}
          {forward_fields}
          {body}
        </div>
      </>
    );
  }

  return (
    <div
      ref={set_refs}
      className="mx-3 mb-3 mt-1 border border-edge-primary rounded-xl bg-surf-primary overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length > 0) {
          const drop_handler = is_reply_mode
            ? reply_modal.handle_files_drop
            : forward_modal.handle_files_drop;
          drop_handler(files);
        }
      }}
    >
      {header}
      {reply_sender_field}
      {forward_fields}
      {body}
    </div>
  );
});
