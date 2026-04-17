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
import type { TranslationKey } from "@/lib/i18n";
import type { UseEditorReturn } from "@/hooks/use_editor";

import { useEffect } from "react";

import { sanitize_compose_paste } from "@/lib/html_sanitizer";
import { CloseIcon, FileIcon } from "@/components/common/icons";
import { ExpirationPicker } from "@/components/compose/expiration_picker";
import { SchedulePicker } from "@/components/compose/schedule_picker";
import { TemplatePicker } from "@/components/compose/template_picker";
import { SignaturePicker } from "@/components/compose/signature_picker";
import {
  type Attachment,
  type DraftStatus,
  ComposeToolbar,
  ComposeFormatBar,
  ComposeFileInputSimple,
  get_file_icon_color,
} from "@/components/compose/compose_shared";

interface ForwardBodyProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  reduce_motion: boolean;
  is_minimized: boolean;
  message_editor_ref: React.RefObject<HTMLDivElement>;
  message_content?: string;
  editor: UseEditorReturn;
  can_send: boolean;
  scheduled_time: Date | null;
  handle_scheduled_send: () => void;
  handle_forward: () => void;
  is_forward_visible: boolean;
  set_is_forward_visible: (val: boolean) => void;
  forward_content_ref: React.RefObject<string>;
  attachments: Attachment[];
  attachments_scroll_ref: React.RefObject<HTMLDivElement>;
  remove_attachment: (id: string) => void;
  trigger_file_select: () => void;
  error_message: string | null;
  set_error_message: (val: string | null) => void;
  attachment_error: string | null;
  set_attachment_error: (val: string | null) => void;
  file_input_ref: React.RefObject<HTMLInputElement>;
  handle_file_select: (event: React.ChangeEvent<HTMLInputElement>) => void;
  is_scheduling: boolean;
  is_sending: boolean;
  recipients_count: number;
  set_scheduled_time: (val: Date | null) => void;
  expires_at: Date | null;
  set_expires_at: (val: Date | null) => void;
  expiry_password: string | null;
  set_expiry_password: (val: string | null) => void;
  active_formats: Set<string>;
  exec_format_command: (command: string) => void;
  draft_status: DraftStatus;
  last_saved_time: Date | null;
  is_plain_text_mode: boolean;
  toggle_plain_text_mode: () => void;
  handle_template_select: (content: string) => void;
}

export function ForwardBody({
  t,
  reduce_motion,
  is_minimized,
  message_editor_ref,
  message_content,
  editor,
  can_send,
  scheduled_time,
  handle_scheduled_send,
  handle_forward,
  is_forward_visible,
  set_is_forward_visible,
  forward_content_ref,
  attachments,
  attachments_scroll_ref,
  remove_attachment,
  trigger_file_select,
  error_message,
  set_error_message,
  attachment_error,
  set_attachment_error,
  file_input_ref,
  handle_file_select,
  is_scheduling,
  is_sending,
  recipients_count,
  set_scheduled_time,
  expires_at,
  set_expires_at,
  expiry_password,
  set_expiry_password,
  active_formats,
  exec_format_command,
  draft_status,
  last_saved_time,
  is_plain_text_mode,
  toggle_plain_text_mode,
  handle_template_select,
}: ForwardBodyProps) {
  useEffect(() => {
    const el = message_editor_ref.current;

    if (el && message_content && !el.innerHTML) {
      el.innerHTML = message_content;
    }
  });

  return (
    <>
      {!is_minimized && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 px-4 pt-2 pb-2 overflow-hidden flex flex-col min-h-0">
            <div className="flex-1 overflow-auto">
              <div
                ref={message_editor_ref}
                contentEditable
                suppressContentEditableWarning
                className="w-full text-sm leading-relaxed border-none outline-none bg-transparent text-txt-primary"
                data-placeholder={t("mail.write_message")}
                style={{
                  minHeight: "80px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
                onBlur={editor.handle_input}
                onDragOver={editor.handle_drag_over}
                onDrop={editor.handle_drop}
                onInput={editor.handle_input}
                onKeyDown={(e) => {
                  if (
                    e["key"] === "Enter" &&
                    (e.metaKey || e.ctrlKey) &&
                    can_send
                  ) {
                    e.preventDefault();
                    if (scheduled_time) {
                      handle_scheduled_send();
                    } else {
                      handle_forward();
                    }
                  }
                }}
                onPaste={editor.handle_paste}
              />
              <div className="mt-1">
                <button
                  className="flex items-center gap-1.5 text-xs transition-colors"
                  style={{ color: "var(--text-tertiary)" }}
                  type="button"
                  onClick={() => set_is_forward_visible(!is_forward_visible)}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "var(--text-secondary)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "var(--text-tertiary)")
                  }
                >
                  <svg
                    className={`w-3 h-3 transition-transform ${is_forward_visible ? "rotate-90" : ""}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M6 6L14 10L6 14V6Z" />
                  </svg>
                  <span>
                    {is_forward_visible
                      ? t("mail.hide_forwarded")
                      : t("mail.show_forwarded")}
                  </span>
                </button>
                {is_forward_visible && (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: sanitize_compose_paste(
                        forward_content_ref.current ?? "",
                      ),
                    }}
                    className="mt-2 py-3 px-4 rounded-md text-sm leading-relaxed overflow-y-auto max-h-[150px] bg-surf-tertiary text-txt-secondary"
                    style={{
                      wordBreak: "break-word",
                    }}
                  />
                )}
              </div>
            </div>
            <style>{`
              [contenteditable=true]:empty:before {
                content: attr(data-placeholder);
                color: var(--text-muted);
                pointer-events: none;
              }
            `}</style>
          </div>
        </div>
      )}

      {!is_minimized && attachments.length > 0 && (
        <div className="border-t border-edge-primary">
          <div className="min-h-[52px] px-4 flex items-start pt-3 pb-2">
            <div
              ref={attachments_scroll_ref}
              className="flex gap-2 overflow-x-auto w-full pb-2 scrollbar-hide"
            >
              {attachments.map((attachment) => {
                const color = get_file_icon_color(attachment.mime_type);

                return (
                  <div
                    key={attachment.id}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs whitespace-nowrap flex-shrink-0"
                    style={{
                      backgroundColor: color.bg,
                      border: `1px solid ${color.border}`,
                    }}
                  >
                    <span style={{ color: color.text }}>
                      <FileIcon className="w-3.5 h-3.5 flex-shrink-0" />
                    </span>
                    <span
                      className="font-medium whitespace-nowrap max-w-[150px] truncate text-txt-primary"
                      title={attachment.name}
                    >
                      {attachment.name}
                    </span>
                    <span className="whitespace-nowrap text-txt-tertiary">
                      {attachment.size}
                    </span>
                    <button
                      className="attachment_close_btn transition-colors duration-150 ml-0.5 flex-shrink-0"
                      type="button"
                      onClick={() => remove_attachment(attachment.id)}
                    >
                      <CloseIcon className="w-5 h-5" />
                    </button>
                  </div>
                );
              })}
              <button
                className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-default-500 hover:text-default-700 border border-dashed border-default-300 rounded hover:border-default-400 transition-colors whitespace-nowrap flex-shrink-0"
                type="button"
                onClick={trigger_file_select}
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
                <span>{t("mail.add_file")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {!is_minimized && error_message && (
        <div
          className="mx-3 mb-2 p-3 rounded-lg border flex items-center gap-2 flex-shrink-0"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            borderColor: "rgba(239, 68, 68, 0.3)",
          }}
        >
          <svg
            className="w-5 h-5 text-red-500 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          <span className="text-xs text-red-600 dark:text-red-400 flex-1">
            {error_message}
          </span>
          <button
            className="text-red-500 hover:text-red-700 flex-shrink-0"
            onClick={() => set_error_message(null)}
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {!is_minimized && attachment_error && (
        <div
          className="mx-3 mb-2 p-3 rounded-lg border flex items-center gap-2 flex-shrink-0"
          style={{
            backgroundColor: "rgba(234, 179, 8, 0.1)",
            borderColor: "rgba(234, 179, 8, 0.3)",
          }}
        >
          <svg
            className="w-5 h-5 text-yellow-500 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
          </svg>
          <span className="text-xs text-yellow-600 dark:text-yellow-400 flex-1">
            {attachment_error}
          </span>
          <button
            className="text-yellow-500 hover:text-yellow-700 flex-shrink-0"
            type="button"
            onClick={() => set_attachment_error(null)}
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      <ComposeFileInputSimple
        file_input_ref={file_input_ref as React.RefObject<HTMLInputElement>}
        handle_file_select={handle_file_select}
      />

      {!is_minimized && (
        <ComposeFormatBar
          compose={{
            scheduled_time,
            is_scheduling,
            has_recipients: can_send || is_sending,
            handle_scheduled_send,
            handle_send: handle_forward,
            is_mac: editor.is_mac,
            schedule_picker_element: null,
            expiration_picker_element: null,
            template_picker_element: null,
            active_formats,
            exec_format_command,
            handle_insert_link: () => {},
            trigger_file_select,
            draft_status,
            last_saved_time,
            handle_show_delete_confirm: null,
            editor,
            is_plain_text_mode,
            toggle_plain_text_mode,
          }}
          reduce_motion={reduce_motion}
        />
      )}

      {!is_minimized && (
        <ComposeToolbar
          show_expiration
          compose={{
            scheduled_time,
            is_scheduling,
            has_recipients: can_send || is_sending,
            handle_scheduled_send,
            handle_send: handle_forward,
            is_mac: editor.is_mac,
            schedule_picker_element: (
              <SchedulePicker
                disabled={recipients_count === 0}
                on_schedule={set_scheduled_time}
                scheduled_time={scheduled_time}
              />
            ),
            expiration_picker_element: (
              <ExpirationPicker
                disabled={is_sending}
                expires_at={expires_at}
                on_expiration_change={set_expires_at}
                on_password_change={set_expiry_password}
                password={expiry_password}
                show_password_option={false}
              />
            ),
            template_picker_element: (
              <TemplatePicker
                disabled={is_scheduling}
                on_select={handle_template_select}
                open_direction="up"
              />
            ),
            active_formats,
            exec_format_command,
            handle_insert_link: () => {},
            trigger_file_select,
            draft_status,
            last_saved_time,
            handle_show_delete_confirm: null,
            editor,
            is_plain_text_mode,
            toggle_plain_text_mode,
          }}
          extra_toolbar_items={
            <SignaturePicker
              disabled={is_scheduling}
              on_select={(content) => {
                if (content) {
                  editor.insert_html(content);
                }
              }}
              open_direction="up"
            />
          }
          reduce_motion={reduce_motion}
        />
      )}
    </>
  );
}
