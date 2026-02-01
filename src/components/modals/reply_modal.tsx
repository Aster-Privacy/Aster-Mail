import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { CloseIcon, AttachmentIcon, FileIcon } from "@/components/common/icons";
import { use_draggable_modal } from "@/hooks/use_draggable_modal";
import { undo_send_manager } from "@/hooks/use_undo_send";
import { MODAL_SIZES } from "@/constants/modal";
import { send_reply, type OriginalEmail } from "@/services/mail_actions";
import { get_undo_send_delay_ms } from "@/services/send_queue";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_signatures } from "@/contexts/signatures_context";
import { show_toast } from "@/components/toast/simple_toast";
import { format_bytes } from "@/lib/utils";
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

interface Attachment {
  id: string;
  name: string;
  size: string;
  size_bytes: number;
  mime_type: string;
  data: ArrayBuffer;
}

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENTS_SIZE = 50 * 1024 * 1024;
const ASTER_FOOTER =
  '<br><br><span style="color: #6b7280; font-size: 12px;">Secured by <a href="https://astermail.org" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: none;">Aster Mail</a></span><br><br>';
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "text/plain",
  "text/csv",
  "text/html",
  "text/css",
  "text/javascript",
  "application/json",
  "application/xml",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

function generate_attachment_id(): string {
  return `att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function get_file_icon_color(mime_type: string): {
  bg: string;
  border: string;
  text: string;
} {
  if (mime_type.startsWith("image/")) {
    return {
      bg: "rgba(168, 85, 247, 0.1)",
      border: "rgba(168, 85, 247, 0.3)",
      text: "#a855f7",
    };
  }
  if (mime_type.startsWith("video/")) {
    return {
      bg: "rgba(236, 72, 153, 0.1)",
      border: "rgba(236, 72, 153, 0.3)",
      text: "#ec4899",
    };
  }
  if (mime_type.startsWith("audio/")) {
    return {
      bg: "rgba(14, 165, 233, 0.1)",
      border: "rgba(14, 165, 233, 0.3)",
      text: "#0ea5e9",
    };
  }
  if (mime_type === "application/pdf") {
    return {
      bg: "rgba(239, 68, 68, 0.1)",
      border: "rgba(239, 68, 68, 0.3)",
      text: "#ef4444",
    };
  }
  if (
    mime_type.includes("spreadsheet") ||
    mime_type.includes("excel") ||
    mime_type === "text/csv"
  ) {
    return {
      bg: "rgba(34, 197, 94, 0.1)",
      border: "rgba(34, 197, 94, 0.3)",
      text: "#22c55e",
    };
  }
  if (mime_type.includes("word") || mime_type.includes("document")) {
    return {
      bg: "rgba(59, 130, 246, 0.1)",
      border: "rgba(59, 130, 246, 0.3)",
      text: "#3b82f6",
    };
  }
  if (mime_type.includes("presentation") || mime_type.includes("powerpoint")) {
    return {
      bg: "rgba(249, 115, 22, 0.1)",
      border: "rgba(249, 115, 22, 0.3)",
      text: "#f97316",
    };
  }
  if (mime_type.includes("zip") || mime_type.includes("compressed")) {
    return {
      bg: "rgba(234, 179, 8, 0.1)",
      border: "rgba(234, 179, 8, 0.3)",
      text: "#eab308",
    };
  }

  return {
    bg: "rgba(107, 114, 128, 0.1)",
    border: "rgba(107, 114, 128, 0.3)",
    text: "#6b7280",
  };
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
  on_draft_saved?: (draft: {
    id: string;
    version: number;
    content: DraftContent;
  }) => void;
}

export function ReplyModal({
  is_open,
  on_close,
  recipient_name,
  recipient_email,
  recipient_avatar,
  original_subject = "",
  original_body = "",
  original_timestamp = new Date().toISOString(),
  original_cc,
  original_to,
  reply_all = false,
  thread_token,
  original_email_id,
  on_draft_saved,
}: ReplyModalProps) {
  const { user } = use_auth();
  const { preferences } = use_preferences();
  const { default_signature, get_formatted_signature } = use_signatures();
  const [reply_message, set_reply_message] = useState("");
  const [is_sending, set_is_sending] = useState(false);
  const [error_message, set_error_message] = useState<string | null>(null);
  const [is_minimized, set_is_minimized] = useState(false);
  const [is_expanded, set_is_expanded] = useState(false);
  const [attachments, set_attachments] = useState<Attachment[]>([]);
  const [attachment_error, set_attachment_error] = useState<string | null>(
    null,
  );
  const [show_quoted, set_show_quoted] = useState(false);
  const [draft_id, set_draft_id] = useState<string | null>(null);
  const [draft_version, set_draft_version] = useState<number>(1);

  const message_editor_ref = useRef<HTMLDivElement>(null);
  const file_input_ref = useRef<HTMLInputElement>(null);
  const attachments_scroll_ref = useRef<HTMLDivElement>(null);
  const pending_thread_token_ref = useRef<string | null>(null);
  const save_draft_timeout = useRef<number | null>(null);
  const last_saved_text = useRef<string>("");
  const is_sending_ref = useRef(false);
  const last_send_time_ref = useRef<number>(0);
  const [active_formats, set_active_formats] = useState<Set<string>>(new Set());
  const [show_format_menu, set_show_format_menu] = useState(false);

  const { handle_drag_start, get_position_style } = use_draggable_modal(
    is_open,
    MODAL_SIZES.large,
  );

  const is_mac = useMemo(() => {
    if (typeof navigator !== "undefined") {
      return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    }

    return false;
  }, []);

  const is_mobile = useMemo(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 640;
    }

    return false;
  }, []);

  const format_date = useCallback((timestamp: string): string => {
    const date = new Date(timestamp);

    return date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, []);

  const build_quoted_content = useCallback(
    (for_display: boolean = false): string => {
      const formatted_date = format_date(original_timestamp);
      const safe_name = recipient_name
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const safe_email = recipient_email
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const header = `On ${formatted_date}, ${safe_name} &lt;${safe_email}&gt; wrote:`;

      const plain_body = original_body
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .trim();

      const quoted_body = plain_body
        .split("\n")
        .map((line) => `&gt; ${line}`)
        .join("<br>");

      if (for_display) {
        return `<div style="color: var(--text-tertiary);">${header}<br><br>${quoted_body}</div>`;
      }

      return `<br><br><div style="color: var(--text-tertiary);">${header}<br>${quoted_body}</div>`;
    },
    [
      original_body,
      original_timestamp,
      recipient_email,
      recipient_name,
      format_date,
    ],
  );

  useEffect(() => {
    if (!is_open) return;

    const handle_escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        on_close();
      }
    };

    document.addEventListener("keydown", handle_escape);

    return () => document.removeEventListener("keydown", handle_escape);
  }, [is_open, on_close]);

  useEffect(() => {
    if (is_open) {
      is_sending_ref.current = false;
      set_is_sending(false);
      set_error_message(null);
      set_attachments([]);
      set_attachment_error(null);
      set_show_quoted(false);
      set_draft_id(null);
      set_draft_version(1);
      last_saved_text.current = "";

      setTimeout(() => {
        if (message_editor_ref.current) {
          message_editor_ref.current.innerHTML = "";
          set_reply_message("");
          message_editor_ref.current.focus();
        }
      }, 0);
    }
  }, [is_open]);

  useEffect(() => {
    const scroll_container = attachments_scroll_ref.current;

    if (!scroll_container || !is_open) return;

    const handle_wheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        e.stopPropagation();
        scroll_container.scrollLeft += e.deltaY;
      }
    };

    scroll_container.addEventListener("wheel", handle_wheel, {
      passive: false,
    });

    return () => scroll_container.removeEventListener("wheel", handle_wheel);
  }, [is_open, attachments.length]);

  const save_thread_draft = useCallback(
    async (text: string) => {
      if (!text.trim() || !original_email_id) return;

      const vault = get_vault_from_memory();

      if (!vault) return;

      if (!has_csrf_token()) {
        await api_client.refresh_session();
        if (!has_csrf_token()) {
          show_toast("Session expired. Please refresh the page.", "error");

          return;
        }
      }

      const subject = original_subject.startsWith("Re:")
        ? original_subject
        : `Re: ${original_subject}`;

      const content: DraftContent = {
        to_recipients: [recipient_email],
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
          original_email_id,
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
          original_email_id,
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
      original_email_id,
      original_subject,
      recipient_email,
      draft_id,
      draft_version,
      on_draft_saved,
    ],
  );

  useEffect(() => {
    if (!is_open || !original_email_id || !reply_message.trim()) return;
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
  }, [is_open, original_email_id, reply_message, save_thread_draft]);

  useEffect(() => {
    return () => {
      if (save_draft_timeout.current) {
        clearTimeout(save_draft_timeout.current);
      }
    };
  }, []);

  const get_signature = useCallback((): string => {
    if (!user || preferences.signature_mode === "disabled") {
      return "";
    }

    if (preferences.signature_mode === "auto" && default_signature) {
      return get_formatted_signature(default_signature);
    }

    return "";
  }, [
    user,
    preferences.signature_mode,
    default_signature,
    get_formatted_signature,
  ]);

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

  const handle_insert_link = useCallback(() => {
    const editor = message_editor_ref.current;

    if (!editor) return;

    editor.focus();
    const selection = window.getSelection();
    const selected_text = selection?.toString() || "";
    const url = prompt("Enter URL:", "https://");

    if (url?.trim()) {
      const trimmed_url = url.trim();
      const lower_url = trimmed_url.toLowerCase();

      if (
        !lower_url.startsWith("http://") &&
        !lower_url.startsWith("https://") &&
        !lower_url.startsWith("mailto:")
      ) {
        return;
      }

      const safe_url = encodeURI(trimmed_url).replace(/"/g, "%22");

      if (selected_text) {
        document.execCommand("createLink", false, safe_url);
        editor.querySelectorAll(`a[href="${safe_url}"]`).forEach((link) => {
          (link as HTMLElement).style.color = "#3b82f6";
          (link as HTMLElement).style.textDecoration = "underline";
        });
      } else {
        const link_text =
          prompt("Enter link text:", trimmed_url) || trimmed_url;
        const safe_text = link_text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

        document.execCommand(
          "insertHTML",
          false,
          `<a href="${safe_url}" style="color: #3b82f6; text-decoration: underline;">${safe_text}</a>`,
        );
      }
      handle_editor_input();
    }
  }, [handle_editor_input]);

  useEffect(() => {
    const handle_selection = () => {
      requestAnimationFrame(check_active_formats);
    };

    document.addEventListener("selectionchange", handle_selection);

    return () =>
      document.removeEventListener("selectionchange", handle_selection);
  }, [check_active_formats]);

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

  const handle_send = useCallback(async () => {
    if (is_sending_ref.current) return;
    if (!reply_message.trim() || is_sending) return;

    const now = Date.now();

    if (now - last_send_time_ref.current < 2000) return;

    is_sending_ref.current = true;
    last_send_time_ref.current = now;
    set_error_message(null);
    set_is_sending(true);

    const original: OriginalEmail = {
      sender_email: recipient_email,
      sender_name: recipient_name,
      subject: original_subject,
      body: original_body,
      timestamp: original_timestamp,
      cc: original_cc,
      to: original_to,
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
        reply_all,
        thread_token,
        original_email_id,
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

          if (pending_thread_token_ref.current) {
            emit_thread_reply_sent({
              thread_token: pending_thread_token_ref.current,
              original_email_id,
            });
            pending_thread_token_ref.current = null;
          }
        },
        on_cancel: () => {
          is_sending_ref.current = false;
          pending_thread_token_ref.current = null;
        },
        on_error: (error) => {
          is_sending_ref.current = false;
          set_error_message(error);
          set_is_sending(false);
          pending_thread_token_ref.current = null;
        },
      },
      preferences.undo_send_period,
    );

    if (result.success && result.queued_id) {
      pending_thread_token_ref.current = result.thread_token || null;

      undo_send_manager.add({
        id: result.queued_id,
        to: [recipient_email],
        subject: `Re: ${original_subject.replace(/^Re:\s*/i, "")}`,
        body: message_with_signature,
        scheduled_time: Date.now() + delay_ms,
        total_seconds: delay_seconds,
      });

      on_close();
    } else if (!result.success) {
      is_sending_ref.current = false;
      set_error_message(result.error || "Failed to send reply");
      set_is_sending(false);
    }
  }, [
    reply_message,
    is_sending,
    recipient_email,
    recipient_name,
    original_subject,
    original_body,
    original_timestamp,
    original_cc,
    original_to,
    reply_all,
    thread_token,
    original_email_id,
    preferences.undo_send_period,
    get_signature,
    on_close,
    draft_id,
  ]);

  const handle_close = useCallback(() => {
    on_close();
  }, [on_close]);

  const get_total_attachments_size = useCallback(() => {
    return attachments.reduce((total, att) => total + att.size_bytes, 0);
  }, [attachments]);

  const handle_file_select = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;

      if (!files || files.length === 0) return;

      set_attachment_error(null);
      const new_attachments: Attachment[] = [];
      const current_total = get_total_attachments_size();
      let running_total = current_total;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.size > MAX_ATTACHMENT_SIZE) {
          set_attachment_error(
            `"${file.name}" exceeds the maximum file size of 25MB`,
          );
          continue;
        }

        if (running_total + file.size > MAX_TOTAL_ATTACHMENTS_SIZE) {
          set_attachment_error(
            `Adding "${file.name}" would exceed the total attachment limit of 50MB`,
          );
          continue;
        }

        const mime_type = file.type || "application/octet-stream";

        if (
          !ALLOWED_MIME_TYPES.has(mime_type) &&
          !mime_type.startsWith("text/")
        ) {
          set_attachment_error(`"${file.name}" has an unsupported file type`);
          continue;
        }

        const exists = attachments.some((a) => a.name === file.name);

        if (exists) {
          set_attachment_error(`"${file.name}" is already attached`);
          continue;
        }

        try {
          const data = await file.arrayBuffer();

          new_attachments.push({
            id: generate_attachment_id(),
            name: file.name,
            size: format_bytes(file.size),
            size_bytes: file.size,
            mime_type,
            data,
          });
          running_total += file.size;
        } catch {
          set_attachment_error(`Failed to read "${file.name}"`);
        }
      }

      if (new_attachments.length > 0) {
        set_attachments((prev) => [...prev, ...new_attachments]);
      }

      if (file_input_ref.current) {
        file_input_ref.current.value = "";
      }
    },
    [attachments, get_total_attachments_size],
  );

  const remove_attachment = useCallback((id: string) => {
    set_attachments((prev) => prev.filter((a) => a.id !== id));
    set_attachment_error(null);
  }, []);

  const trigger_file_select = useCallback(() => {
    file_input_ref.current?.click();
  }, []);

  const is_valid = reply_message.trim().length > 0;
  const can_send = is_valid && !is_sending;

  return (
    <AnimatePresence>
      {is_open && (
        <>
          <motion.div
            key="reply-backdrop-mobile"
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-black/50 sm:hidden"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={on_close}
          />
          <AnimatePresence>
            {is_expanded && (
              <motion.div
                key="reply-backdrop"
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-md hidden sm:block"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            )}
          </AnimatePresence>
          <motion.div
            key="reply-modal"
            animate={{ opacity: 1, y: 0 }}
            className={`fixed z-50 flex flex-col shadow-2xl sm:border ${
              is_minimized
                ? "sm:w-[320px] sm:h-auto sm:rounded-t-lg"
                : is_expanded
                  ? "inset-0 sm:inset-4 sm:w-auto sm:h-auto sm:rounded-lg"
                  : "bottom-0 left-0 right-0 h-[85vh] rounded-t-2xl sm:inset-auto sm:bottom-auto sm:left-auto sm:right-auto sm:h-[600px] sm:w-[700px] sm:max-w-[90vw] sm:max-h-[85vh] sm:rounded-lg"
            }`}
            exit={{ opacity: 0, y: is_mobile ? 100 : 0 }}
            initial={{ opacity: 0, y: is_mobile ? 100 : 0 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              willChange: "opacity, transform",
              ...(window.innerWidth >= 640 && !is_expanded && !is_minimized
                ? get_position_style()
                : {}),
              ...(is_minimized && window.innerWidth >= 640
                ? { bottom: 0, right: 24, top: "auto", left: "auto" }
                : {}),
            }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          >
            <div
              className="w-12 h-1.5 bg-default-300 rounded-full mx-auto mt-2 mb-1 sm:hidden"
              style={{ opacity: 0.5 }}
            />
            <div
              className="flex items-center justify-between px-4 py-2 sm:py-3 border-b sm:cursor-move select-none"
              role="presentation"
              style={{ borderColor: "var(--border-primary)" }}
              onMouseDown={handle_drag_start}
            >
              <h2
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Reply
              </h2>
              <div
                className="flex items-center gap-1"
                role="presentation"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  className="hidden sm:flex transition-colors duration-150 p-1.5 w-7 h-7 items-center justify-center rounded"
                  style={{ color: "var(--text-muted)" }}
                  onClick={() => set_is_minimized(!is_minimized)}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="M20 12H4" strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  className="hidden sm:flex transition-colors duration-150 p-1.5 w-7 h-7 items-center justify-center rounded"
                  style={{ color: "var(--text-muted)" }}
                  onClick={() => {
                    set_is_expanded(!is_expanded);
                    set_is_minimized(false);
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  {is_expanded ? (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
                <button
                  className="transition-colors duration-150 p-1.5 w-7 h-7 flex items-center justify-center rounded"
                  style={{ color: "var(--text-muted)" }}
                  onClick={handle_close}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  <CloseIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!is_minimized && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-4 pt-3 pb-1 flex-shrink-0">
                  <div
                    className="flex items-center gap-2 py-2 border-b"
                    style={{ borderColor: "var(--border-secondary)" }}
                  >
                    <span
                      className="text-sm w-14 flex-shrink-0"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      To
                    </span>
                    <div
                      className="flex items-center gap-1.5 bg-default-100 rounded-full px-2 py-1 border"
                      style={{ borderColor: "var(--border-secondary)" }}
                    >
                      <img
                        alt={recipient_name}
                        className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                        src={recipient_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(recipient_name || recipient_email)}&background=random&size=20`}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(recipient_name || recipient_email)}&background=random&size=20`;
                        }}
                      />
                      <span className="text-sm text-default-900">
                        {recipient_email}
                      </span>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-2 py-2 border-b"
                    style={{ borderColor: "var(--border-secondary)" }}
                  >
                    <span
                      className="text-sm w-16 flex-shrink-0"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      Subject
                    </span>
                    <span
                      className="text-sm truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Re: {original_subject.replace(/^Re:\s*/i, "")}
                    </span>
                  </div>
                </div>

                <div className="flex-1 px-4 pt-2 pb-2 overflow-hidden flex flex-col min-h-0">
                  <div className="flex-1 overflow-auto">
                    <div
                      ref={message_editor_ref}
                      contentEditable
                      suppressContentEditableWarning
                      className="w-full h-full text-sm leading-relaxed border-none outline-none bg-transparent"
                      data-placeholder="Write your reply..."
                      style={{
                        minHeight: "150px",
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

            {!is_minimized && original_body && (
              <div className="px-4 pb-2">
                <button
                  className="flex items-center gap-1.5 text-xs transition-colors"
                  style={{ color: "var(--text-tertiary)" }}
                  type="button"
                  onClick={() => set_show_quoted(!show_quoted)}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "var(--text-secondary)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "var(--text-tertiary)")
                  }
                >
                  <svg
                    className={`w-3 h-3 transition-transform ${show_quoted ? "rotate-90" : ""}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M6 6L14 10L6 14V6Z" />
                  </svg>
                  <span>{show_quoted ? "Hide" : "Show"} quoted text</span>
                </button>
                {show_quoted && (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: build_quoted_content(true),
                    }}
                    className="mt-2 py-3 px-4 rounded-md text-sm leading-relaxed overflow-y-auto max-h-[100px]"
                    style={{
                      backgroundColor: "var(--bg-tertiary)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-primary)",
                    }}
                  />
                )}
              </div>
            )}

            {!is_minimized && attachments.length > 0 && (
              <div
                className="border-t"
                style={{ borderColor: "var(--border-primary)" }}
              >
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
                            className="font-medium whitespace-nowrap max-w-[150px] truncate"
                            style={{ color: "var(--text-primary)" }}
                            title={attachment.name}
                          >
                            {attachment.name}
                          </span>
                          <span
                            className="whitespace-nowrap"
                            style={{ color: "var(--text-tertiary)" }}
                          >
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
                      <span>Add file</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!is_minimized && error_message && (
              <div
                className="mx-3 mb-2 p-3 rounded-lg border flex items-center gap-2"
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
                <span className="text-sm text-red-600 dark:text-red-400">
                  {error_message}
                </span>
                <button
                  className="ml-auto text-red-500 hover:text-red-700"
                  onClick={() => set_error_message(null)}
                >
                  <CloseIcon className="w-4 h-4" />
                </button>
              </div>
            )}

            {!is_minimized && attachment_error && (
              <div
                className="mx-3 mb-2 p-3 rounded-lg border flex items-center gap-2"
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
                <span className="text-sm text-yellow-600 dark:text-yellow-400">
                  {attachment_error}
                </span>
                <button
                  className="ml-auto text-yellow-500 hover:text-yellow-700"
                  type="button"
                  onClick={() => set_attachment_error(null)}
                >
                  <CloseIcon className="w-4 h-4" />
                </button>
              </div>
            )}

            {!is_minimized && (
              <>
                <input
                  ref={file_input_ref}
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.txt,.csv,.html,.css,.js,.json,.xml,.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.mp3,.wav,.ogg,.mp4,.webm,.mov"
                  className="hidden"
                  type="file"
                  onChange={handle_file_select}
                />

                <div
                  className="border-t px-3 py-2 flex items-center gap-2"
                  style={{ borderColor: "var(--border-primary)" }}
                >
                  <button
                    className="h-8 w-[72px] flex items-center justify-center rounded-md text-sm font-medium text-white transition-colors duration-150 hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={!can_send}
                    style={{
                      background:
                        "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                      boxShadow:
                        "0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                    }}
                    onClick={handle_send}
                  >
                    {is_sending ? "Sending" : "Send"}
                  </button>

                  <ToolbarButton disabled={is_sending} title="Schedule send">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </ToolbarButton>

                  <div
                    className="w-px h-5 mx-1 hidden sm:block"
                    style={{ backgroundColor: "var(--border-secondary)" }}
                  />

                  <div className="hidden sm:flex items-center gap-0.5">
                    <ToolbarButton
                      active={active_formats.has("bold")}
                      disabled={is_sending}
                      title={`Bold (${is_mac ? "⌘" : "Ctrl"}+B)`}
                      onClick={() => exec_format_command("bold")}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" />
                      </svg>
                    </ToolbarButton>
                    <ToolbarButton
                      active={active_formats.has("italic")}
                      disabled={is_sending}
                      title={`Italic (${is_mac ? "⌘" : "Ctrl"}+I)`}
                      onClick={() => exec_format_command("italic")}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" />
                      </svg>
                    </ToolbarButton>
                    <ToolbarButton
                      active={active_formats.has("underline")}
                      disabled={is_sending}
                      title={`Underline (${is_mac ? "⌘" : "Ctrl"}+U)`}
                      onClick={() => exec_format_command("underline")}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z" />
                      </svg>
                    </ToolbarButton>
                    <ToolbarButton
                      disabled={is_sending}
                      title="Insert link"
                      onClick={handle_insert_link}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
                      </svg>
                    </ToolbarButton>
                    <ToolbarButton
                      disabled={is_sending}
                      title="Attach file"
                      onClick={trigger_file_select}
                    >
                      <AttachmentIcon className="w-4 h-4" />
                    </ToolbarButton>
                  </div>

                  <div className="relative sm:hidden">
                    <ToolbarButton
                      disabled={is_sending}
                      title="Format"
                      onClick={() => set_show_format_menu(!show_format_menu)}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M5 17v2h14v-2H5zm4.5-4.2h5l.9 2.2h2.1L12.75 4h-1.5L6.5 15h2.1l.9-2.2zM12 5.98L13.87 11h-3.74L12 5.98z" />
                      </svg>
                    </ToolbarButton>
                    <AnimatePresence>
                      {show_format_menu && (
                        <motion.div
                          animate={{ opacity: 1, y: 0 }}
                          className="absolute bottom-full left-0 mb-2 p-1.5 rounded-lg shadow-lg border"
                          exit={{ opacity: 0, y: 4 }}
                          initial={{ opacity: 0, y: 4 }}
                          style={{
                            backgroundColor: "var(--modal-bg)",
                            borderColor: "var(--border-primary)",
                          }}
                          transition={{ duration: 0.15 }}
                        >
                          <div className="flex items-center gap-0.5">
                            <ToolbarButton
                              active={active_formats.has("bold")}
                              title="Bold"
                              onClick={() => {
                                exec_format_command("bold");
                                set_show_format_menu(false);
                              }}
                            >
                              <svg
                                className="w-4 h-4"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" />
                              </svg>
                            </ToolbarButton>
                            <ToolbarButton
                              active={active_formats.has("italic")}
                              title="Italic"
                              onClick={() => {
                                exec_format_command("italic");
                                set_show_format_menu(false);
                              }}
                            >
                              <svg
                                className="w-4 h-4"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" />
                              </svg>
                            </ToolbarButton>
                            <ToolbarButton
                              active={active_formats.has("underline")}
                              title="Underline"
                              onClick={() => {
                                exec_format_command("underline");
                                set_show_format_menu(false);
                              }}
                            >
                              <svg
                                className="w-4 h-4"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z" />
                              </svg>
                            </ToolbarButton>
                            <ToolbarButton
                              title="Link"
                              onClick={() => {
                                handle_insert_link();
                                set_show_format_menu(false);
                              }}
                            >
                              <svg
                                className="w-4 h-4"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
                              </svg>
                            </ToolbarButton>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="sm:hidden">
                    <ToolbarButton
                      disabled={is_sending}
                      title="Attach file"
                      onClick={trigger_file_select}
                    >
                      <AttachmentIcon className="w-4 h-4" />
                    </ToolbarButton>
                  </div>

                  <span
                    className="ml-auto text-xs hidden sm:inline"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {is_mac ? "⌘↵" : "Ctrl+↵"}
                  </span>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
