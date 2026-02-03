import type { DecryptedThreadMessage } from "@/types/thread";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

import { send_reply, type OriginalEmail } from "@/services/mail_actions";
import { get_undo_send_delay_ms } from "@/services/send_queue";
import { undo_send_manager } from "@/hooks/use_undo_send";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_signatures } from "@/contexts/signatures_context";
import { show_toast } from "@/components/toast/simple_toast";
import { emit_thread_reply_sent } from "@/hooks/mail_events";
import {
  create_draft,
  update_draft,
  delete_draft,
  type DraftContent,
} from "@/services/api/multi_drafts";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { api_client } from "@/services/api/client";
import { has_csrf_token } from "@/services/api/csrf";

const ASTER_FOOTER =
  '<br><br><span style="color: #6b7280; font-size: 12px;">Secured by <a href="https://astermail.org" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: none;">Aster Mail</a></span><br><br>';

interface InlineReplyComposerProps {
  recipient_name: string;
  recipient_email: string;
  original_subject?: string;
  original_body?: string;
  original_timestamp?: string;
  thread_token?: string;
  original_email_id?: string;
  target_message?: DecryptedThreadMessage | null;
  on_sent?: () => void;
  on_cancel?: () => void;
  on_draft_saved?: (draft: {
    id: string;
    version: number;
    content: DraftContent;
  }) => void;
}

interface ToolbarButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}

function ToolbarButton({
  onClick,
  children,
  disabled,
  active,
  title,
}: ToolbarButtonProps) {
  return (
    <button
      className={`p-1.5 rounded transition-colors duration-150 disabled:opacity-50 ${active ? "bg-blue-500/15" : ""}`}
      disabled={disabled}
      style={{ color: active ? "#3b82f6" : "var(--text-tertiary)" }}
      title={title}
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.backgroundColor = "var(--bg-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      {children}
    </button>
  );
}

function format_date(timestamp?: string): string {
  if (!timestamp) return "";

  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
}

export function InlineReplyComposer({
  recipient_name,
  recipient_email,
  original_subject = "",
  original_body = "",
  original_timestamp,
  thread_token,
  original_email_id,
  target_message,
  on_sent,
  on_cancel,
  on_draft_saved,
}: InlineReplyComposerProps): React.ReactElement {
  const { user } = use_auth();
  const { preferences } = use_preferences();
  const { default_signature, get_formatted_signature } = use_signatures();

  const [reply_message, set_reply_message] = useState("");
  const [is_sending, set_is_sending] = useState(false);
  const [active_formats, set_active_formats] = useState<Set<string>>(
    new Set(),
  );

  const message_editor_ref = useRef<HTMLDivElement>(null);
  const is_sending_ref = useRef(false);
  const last_send_time_ref = useRef(0);

  const [draft_id, set_draft_id] = useState<string | null>(null);
  const [draft_version, set_draft_version] = useState<number>(1);
  const save_draft_timeout = useRef<number | null>(null);
  const last_saved_text = useRef<string>("");

  const actual_recipient_name = target_message?.sender_name ?? recipient_name;
  const actual_recipient_email =
    target_message?.sender_email ?? recipient_email;
  const actual_subject = target_message?.subject ?? original_subject;
  const actual_body = target_message?.body ?? original_body;
  const actual_timestamp = target_message
    ? target_message.timestamp
    : original_timestamp;
  const actual_email_id = target_message?.id ?? original_email_id;

  const is_mac = useMemo(
    () => navigator.platform.toUpperCase().indexOf("MAC") >= 0,
    [],
  );

  const can_send = reply_message.trim().length > 0 && !is_sending;

  const handle_editor_input = useCallback(() => {
    const editor = message_editor_ref.current;

    if (editor) {
      set_reply_message(editor.innerHTML);
    }
  }, []);

  const handle_editor_paste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");

    document.execCommand("insertText", false, text);
    const editor = message_editor_ref.current;

    if (editor) {
      set_reply_message(editor.innerHTML);
    }
  }, []);

  const check_active_formats = useCallback(() => {
    const editor = message_editor_ref.current;

    if (!editor) return;

    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);

    if (!editor.contains(range.commonAncestorContainer)) return;

    const formats = new Set<string>();

    try {
      if (document.queryCommandState("bold")) formats.add("bold");
      if (document.queryCommandState("italic")) formats.add("italic");
      if (document.queryCommandState("underline")) formats.add("underline");
    } catch {
      return;
    }

    set_active_formats(formats);
  }, []);

  const exec_format_command = useCallback(
    (command: string) => {
      const editor = message_editor_ref.current;

      if (!editor) return;

      editor.focus();
      document.execCommand(command, false);
      handle_editor_input();
      requestAnimationFrame(check_active_formats);
    },
    [handle_editor_input, check_active_formats],
  );

  const composer_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!target_message) return;

    requestAnimationFrame(() => {
      composer_ref.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
      message_editor_ref.current?.focus();
    });
  }, [target_message]);

  useEffect(() => {
    const editor = message_editor_ref.current;

    if (!editor) return;

    const handle_keydown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();

        if (key === "b" || key === "i" || key === "u") {
          e.preventDefault();
          const cmd =
            key === "b" ? "bold" : key === "i" ? "italic" : "underline";

          document.execCommand(cmd, false);
          handle_editor_input();
          requestAnimationFrame(check_active_formats);
        }
      }
    };

    editor.addEventListener("keydown", handle_keydown);

    return () => editor.removeEventListener("keydown", handle_keydown);
  }, [handle_editor_input, check_active_formats]);

  const get_signature = useCallback((): string => {
    if (!user || preferences.signature_mode === "disabled") {
      return "";
    }

    if (preferences.signature_mode === "auto" && default_signature) {
      return get_formatted_signature(default_signature);
    }

    return "";
  }, [user, preferences.signature_mode, default_signature, get_formatted_signature]);

  const build_quoted_content = useCallback((): string => {
    const formatted_date = format_date(actual_timestamp);
    const safe_name = actual_recipient_name
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const safe_email = actual_recipient_email
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    return `<br><br><div style="border-left: 2px solid #ccc; padding-left: 12px; color: #6b7280;"><p style="margin: 0 0 8px 0;">On ${formatted_date}, ${safe_name} &lt;${safe_email}&gt; wrote:</p><blockquote style="margin: 0; padding: 0;">${actual_body}</blockquote></div>`;
  }, [actual_timestamp, actual_recipient_name, actual_recipient_email, actual_body]);

  const handle_send = useCallback(async () => {
    if (is_sending_ref.current) return;
    if (!reply_message.trim() || is_sending) return;

    const now = Date.now();

    if (now - last_send_time_ref.current < 2000) return;

    is_sending_ref.current = true;
    last_send_time_ref.current = now;
    set_is_sending(true);

    const original: OriginalEmail = {
      sender_email: actual_recipient_email,
      sender_name: actual_recipient_name,
      subject: actual_subject,
      body: actual_body,
      timestamp: actual_timestamp || "",
    };

    const quoted_content = build_quoted_content();
    const message_with_signature =
      reply_message.trim() + ASTER_FOOTER + get_signature() + quoted_content;
    const delay_ms = get_undo_send_delay_ms(
      preferences.undo_send_enabled,
      preferences.undo_send_seconds,
      preferences.undo_send_period,
    );
    const delay_seconds = delay_ms / 1000;

    const result = await send_reply(
      {
        original,
        message: message_with_signature,
        thread_token,
        original_email_id: actual_email_id,
      },
      {
        on_complete: () => {
          is_sending_ref.current = false;
          show_toast("Email sent.", "success");
          window.dispatchEvent(new CustomEvent("astermail:email-sent"));

          if (draft_id) {
            delete_draft(draft_id).then(() => {
              set_draft_id(null);
              set_draft_version(1);
              last_saved_text.current = "";
            });
          }

          if (thread_token) {
            emit_thread_reply_sent({
              thread_token,
              original_email_id: actual_email_id,
            });
          }
        },
        on_cancel: () => {
          is_sending_ref.current = false;
        },
        on_error: (error) => {
          is_sending_ref.current = false;
          show_toast(error, "error");
          set_is_sending(false);
        },
      },
      preferences.undo_send_period,
    );

    if (result.success && result.queued_id) {
      undo_send_manager.add({
        id: result.queued_id,
        to: [actual_recipient_email],
        subject: `Re: ${actual_subject.replace(/^Re:\s*/i, "")}`,
        body: message_with_signature,
        scheduled_time: Date.now() + delay_ms,
        total_seconds: delay_seconds,
      });

      set_reply_message("");

      if (message_editor_ref.current) {
        message_editor_ref.current.innerHTML = "";
      }

      set_is_sending(false);
      on_sent?.();
    } else if (!result.success) {
      is_sending_ref.current = false;
      show_toast(result.error || "Failed to send reply", "error");
      set_is_sending(false);
    }
  }, [
    reply_message,
    is_sending,
    actual_recipient_email,
    actual_recipient_name,
    actual_subject,
    actual_body,
    actual_timestamp,
    thread_token,
    actual_email_id,
    preferences.undo_send_period,
    preferences.undo_send_enabled,
    preferences.undo_send_seconds,
    get_signature,
    build_quoted_content,
    on_sent,
    draft_id,
  ]);

  const save_thread_draft = useCallback(
    async (text: string) => {
      if (!text.trim() || !actual_email_id) return;

      const vault = get_vault_from_memory();

      if (!vault) return;

      if (!has_csrf_token()) {
        await api_client.refresh_session();
        if (!has_csrf_token()) return;
      }

      const subject = actual_subject.startsWith("Re:")
        ? actual_subject
        : `Re: ${actual_subject}`;

      const content: DraftContent = {
        to_recipients: [actual_recipient_email],
        cc_recipients: [],
        bcc_recipients: [],
        subject,
        message: text,
      };

      if (draft_id) {
        const result = await update_draft(
          draft_id,
          content,
          draft_version,
          vault,
          "reply",
          actual_email_id,
          undefined,
          thread_token,
        );

        if (result.data) {
          set_draft_version(result.data.version);
          last_saved_text.current = text;
          on_draft_saved?.({
            id: draft_id,
            version: result.data.version,
            content,
          });
        }
      } else {
        const result = await create_draft(
          content,
          vault,
          "reply",
          actual_email_id,
          undefined,
          thread_token,
        );

        if (result.data) {
          set_draft_id(result.data.id);
          set_draft_version(result.data.version);
          last_saved_text.current = text;
          on_draft_saved?.({
            id: result.data.id,
            version: result.data.version,
            content,
          });
        }
      }
    },
    [
      thread_token,
      actual_email_id,
      actual_subject,
      actual_recipient_email,
      draft_id,
      draft_version,
      on_draft_saved,
    ],
  );

  useEffect(() => {
    if (!actual_email_id || !reply_message.trim()) return;
    if (reply_message === last_saved_text.current) return;

    if (save_draft_timeout.current) {
      clearTimeout(save_draft_timeout.current);
    }

    save_draft_timeout.current = window.setTimeout(() => {
      save_thread_draft(reply_message);
    }, 1500);

    return () => {
      if (save_draft_timeout.current) {
        clearTimeout(save_draft_timeout.current);
      }
    };
  }, [actual_email_id, reply_message, save_thread_draft]);

  useEffect(() => {
    return () => {
      if (save_draft_timeout.current) {
        clearTimeout(save_draft_timeout.current);
      }
    };
  }, []);

  return (
    <div
      ref={composer_ref}
      className="mt-2 rounded-xl border overflow-hidden"
      style={{
        borderColor: "var(--thread-card-border)",
        backgroundColor: "var(--thread-card-bg)",
      }}
    >
      <div
        className="px-4 py-2.5 text-sm border-b"
        style={{
          borderColor: "var(--thread-card-border)",
          color: "var(--text-secondary)",
        }}
      >
        Reply to {actual_recipient_name}
      </div>

      <style>{`
        [contenteditable=true]:empty:before {
          content: attr(data-placeholder);
          color: var(--text-muted);
          pointer-events: none;
        }
      `}</style>

      <div className="px-4 py-3">
        <div
          ref={message_editor_ref}
          contentEditable
          suppressContentEditableWarning
          className="w-full text-sm leading-relaxed border-none outline-none bg-transparent"
          data-placeholder="Write your reply..."
          style={{
            minHeight: "100px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: "var(--text-primary)",
          }}
          onBlur={handle_editor_input}
          onInput={handle_editor_input}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              (e.metaKey || e.ctrlKey) &&
              can_send
            ) {
              e.preventDefault();
              handle_send();
            }
          }}
          onPaste={handle_editor_paste}
        />
      </div>

      <div
        className="flex items-center justify-between px-3 py-2 border-t"
        style={{ borderColor: "var(--thread-card-border)" }}
      >
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            active={active_formats.has("bold")}
            disabled={is_sending}
            title={`Bold (${is_mac ? "⌘" : "Ctrl"}+B)`}
            onClick={() => exec_format_command("bold")}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            active={active_formats.has("italic")}
            disabled={is_sending}
            title={`Italic (${is_mac ? "⌘" : "Ctrl"}+I)`}
            onClick={() => exec_format_command("italic")}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            active={active_formats.has("underline")}
            disabled={is_sending}
            title={`Underline (${is_mac ? "⌘" : "Ctrl"}+U)`}
            onClick={() => exec_format_command("underline")}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z" />
            </svg>
          </ToolbarButton>

          <div
            className="w-px h-4 mx-1"
            style={{ backgroundColor: "var(--border-secondary)" }}
          />

          <ToolbarButton
            disabled={is_sending}
            title="Insert link"
            onClick={() => {
              const url = prompt("Enter URL:");

              if (url) {
                document.execCommand("createLink", false, url);
                handle_editor_input();
              }
            }}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </ToolbarButton>

          <ToolbarButton
            disabled={is_sending}
            title="Bulleted list"
            onClick={() => exec_format_command("insertUnorderedList")}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </ToolbarButton>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="px-2.5 py-1 rounded text-xs transition-colors"
            style={{ color: "var(--text-muted)" }}
            onClick={() => {
              set_reply_message("");

              if (message_editor_ref.current) {
                message_editor_ref.current.innerHTML = "";
              }

              on_cancel?.();
            }}
          >
            Discard
          </button>
          <button
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors"
            disabled={!can_send}
            style={{
              backgroundColor: "var(--accent-color)",
              opacity: can_send ? 1 : 0.45,
            }}
            onClick={handle_send}
          >
            {is_sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
