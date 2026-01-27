import type { DecryptedContact } from "@/types/contacts";
import type { DraftType } from "@/services/api/multi_drafts";

import { useState, useEffect, useRef, useCallback, useReducer } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { TemplatePicker } from "./template_picker";
import { CloseIcon, FileIcon, AttachmentIcon } from "./icons";
import { EmailAutocomplete } from "./email_autocomplete";
import { EditorToolbar } from "./editor_toolbar";
import { ConfirmationModal } from "./confirmation_modal";
import { SchedulePicker } from "./schedule_picker";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { list_contacts, decrypt_contacts } from "@/services/api/contacts";
import { Button } from "@/components/ui/button";
import { use_draggable_modal } from "@/hooks/use_draggable_modal";
import { undo_send_manager, type UndoSendEvent } from "@/hooks/use_undo_send";
import { MODAL_SIZES } from "@/constants/modal";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_signatures } from "@/contexts/signatures_context";
import {
  get_preferences,
  DEFAULT_PREFERENCES,
} from "@/services/api/preferences";
import {
  queue_email,
  get_undo_send_delay_ms,
  execute_external_send,
} from "@/services/send_queue";
import { is_internal_email } from "@/services/api/keys";
import {
  draft_manager,
  type DraftData,
} from "@/services/crypto/encrypted_drafts";
import {
  create_scheduled_email,
  type ScheduledEmailContent,
} from "@/services/api/scheduled";
import { emit_scheduled_changed } from "@/hooks/mail_events";
import { sanitize_html } from "@/lib/html_sanitizer";
import { show_toast } from "@/components/simple_toast";
import {
  ErrorBoundary,
  ComposeErrorFallback,
} from "@/components/ui/error_boundary";
import { format_bytes, get_email_username } from "@/lib/utils";

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
  '<br><br><span style="color: var(--text-tertiary); font-size: 12px;">Secured by <a href="https://astermail.org" target="_blank" rel="noopener noreferrer" style="color: #3b82f6;">Aster Mail</a></span><br><br>';
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

interface RecipientsState {
  to: string[];
  cc: string[];
  bcc: string[];
}

interface InputsState {
  to: string;
  cc: string;
  bcc: string;
}

interface VisibilityState {
  cc: boolean;
  bcc: boolean;
}

type DraftStatus = "idle" | "saving" | "saved";

type RecipientsAction =
  | { type: "ADD"; field: keyof RecipientsState; email: string }
  | { type: "REMOVE"; field: keyof RecipientsState; email: string }
  | { type: "REMOVE_LAST"; field: keyof RecipientsState }
  | { type: "SET"; field: keyof RecipientsState; emails: string[] }
  | { type: "RESET" };

function recipients_reducer(
  state: RecipientsState,
  action: RecipientsAction,
): RecipientsState {
  switch (action.type) {
    case "ADD":
      return {
        ...state,
        [action.field]: [...state[action.field], action.email],
      };
    case "REMOVE":
      return {
        ...state,
        [action.field]: state[action.field].filter((e) => e !== action.email),
      };
    case "REMOVE_LAST":
      return { ...state, [action.field]: state[action.field].slice(0, -1) };
    case "SET":
      return { ...state, [action.field]: action.emails };
    case "RESET":
      return { to: [], cc: [], bcc: [] };
  }
}

interface EditDraftData {
  id: string;
  version: number;
  draft_type: DraftType;
  reply_to_id?: string;
  forward_from_id?: string;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  message: string;
  updated_at: string;
}

interface ComposeModalProps {
  is_open: boolean;
  on_close: () => void;
  edit_draft?: EditDraftData | null;
  on_draft_cleared?: () => void;
  initial_to?: string;
}

const is_valid_email = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function format_last_saved(saved_time: Date): string {
  const now = new Date();
  const is_today =
    saved_time.getDate() === now.getDate() &&
    saved_time.getMonth() === now.getMonth() &&
    saved_time.getFullYear() === now.getFullYear();

  const time_str = saved_time.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (is_today) {
    return `Last saved today at ${time_str}`;
  }

  const is_same_year = saved_time.getFullYear() === now.getFullYear();
  const date_str = saved_time.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(is_same_year ? {} : { year: "numeric" }),
  });

  return `Last saved ${date_str} at ${time_str}`;
}

const get_domain_from_email = (email: string): string => {
  const parts = email.split("@");

  return parts.length === 2 ? parts[1].toLowerCase() : "";
};

interface RecipientBadgeProps {
  email: string;
  on_remove: () => void;
}

function RecipientBadge({ email, on_remove }: RecipientBadgeProps) {
  const [logo_error, set_logo_error] = useState(false);
  const domain = get_domain_from_email(email);
  const logo_url = domain ? `/api/logos/${encodeURIComponent(domain)}` : "";

  return (
    <div
      className="flex items-center gap-1.5 bg-default-100 rounded-full px-2 py-1 border"
      style={{ borderColor: "var(--border-secondary)" }}
    >
      {!logo_error && logo_url ? (
        <img
          alt=""
          className="w-5 h-5 rounded-full object-contain flex-shrink-0"
          src={logo_url}
          onError={() => set_logo_error(true)}
        />
      ) : (
        <ProfileAvatar
          email={email}
          name={get_email_username(email)}
          size="xs"
        />
      )}
      <span className="text-sm text-default-900">{email}</span>
      <button
        className="text-default-400 hover:text-default-600 transition-colors"
        onClick={on_remove}
      >
        <CloseIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

interface RecipientFieldProps {
  label: string;
  recipients: string[];
  input_value: string;
  on_input_change: (val: string) => void;
  on_add_recipient: (email: string) => void;
  on_remove_recipient: (email: string) => void;
  on_remove_last: () => void;
  on_close?: () => void;
  show_cc_bcc_buttons?: boolean;
  on_show_cc?: () => void;
  on_show_bcc?: () => void;
  show_cc?: boolean;
  show_bcc?: boolean;
  contacts?: DecryptedContact[];
}

function RecipientField({
  label,
  recipients,
  input_value,
  on_input_change,
  on_add_recipient,
  on_remove_recipient,
  on_remove_last,
  on_close,
  show_cc_bcc_buttons,
  on_show_cc,
  on_show_bcc,
  show_cc,
  show_bcc,
  contacts = [],
}: RecipientFieldProps) {
  const handle_key_down = (e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !input_value && recipients.length > 0) {
      on_remove_last();
    }
  };

  const handle_select = (email: string) => {
    if (is_valid_email(email) && !recipients.includes(email)) {
      on_add_recipient(email);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-sm w-14 flex-shrink-0"
        style={{ color: "var(--text-tertiary)" }}
      >
        {label}
      </span>
      <div
        className="flex-1 flex flex-wrap items-center gap-1.5"
        role="presentation"
        onKeyDown={handle_key_down}
      >
        {recipients.map((email) => (
          <RecipientBadge
            key={email}
            email={email}
            on_remove={() => on_remove_recipient(email)}
          />
        ))}
        <div className="flex-1 min-w-[120px] compose_recipient_input">
          <EmailAutocomplete
            contacts={contacts}
            existing_emails={recipients}
            on_change={on_input_change}
            on_select={handle_select}
            placeholder={recipients.length === 0 ? "Recipients" : ""}
            value={input_value}
          />
        </div>
      </div>
      {show_cc_bcc_buttons && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {!show_cc && (
            <button
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{ color: "var(--text-tertiary)" }}
              onClick={on_show_cc}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              Cc
            </button>
          )}
          {!show_bcc && (
            <button
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{ color: "var(--text-tertiary)" }}
              onClick={on_show_bcc}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              Bcc
            </button>
          )}
        </div>
      )}
      {on_close && (
        <button
          className="p-1 rounded transition-colors flex-shrink-0"
          style={{ color: "var(--text-muted)" }}
          onClick={on_close}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

interface ToolbarButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, children }: ToolbarButtonProps) {
  return (
    <button
      className="p-2 rounded transition-colors duration-150"
      style={{ color: "var(--text-tertiary)" }}
      onClick={onClick}
      onMouseEnter={(e) =>
        (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = "transparent")
      }
    >
      {children}
    </button>
  );
}

const INITIAL_RECIPIENTS: RecipientsState = { to: [], cc: [], bcc: [] };
const INITIAL_INPUTS: InputsState = { to: "", cc: "", bcc: "" };
const INITIAL_VISIBILITY: VisibilityState = { cc: false, bcc: false };

interface DraftRefData {
  recipients: RecipientsState;
  subject: string;
  message: string;
}

export function ComposeModal({
  is_open,
  on_close,
  edit_draft,
  on_draft_cleared,
  initial_to,
}: ComposeModalProps) {
  const { vault, user } = use_auth();
  const { preferences } = use_preferences();
  const { default_signature, get_formatted_signature } = use_signatures();
  const [is_minimized, set_is_minimized] = useState(false);
  const [is_expanded, set_is_expanded] = useState(false);

  const [recipients, dispatch_recipients] = useReducer(
    recipients_reducer,
    INITIAL_RECIPIENTS,
  );
  const [inputs, set_inputs] = useState<InputsState>(INITIAL_INPUTS);
  const [visibility, set_visibility] =
    useState<VisibilityState>(INITIAL_VISIBILITY);

  const [subject, set_subject] = useState("");
  const [message, set_message] = useState("");

  const [attachments, set_attachments] = useState<Attachment[]>([]);
  const [show_delete_confirm, set_show_delete_confirm] = useState(false);

  const [auto_save_drafts, set_auto_save_drafts] = useState(
    DEFAULT_PREFERENCES.auto_save_drafts,
  );

  const undo_send_period = preferences.undo_send_period;
  const undo_send_enabled = preferences.undo_send_enabled;
  const undo_send_seconds = preferences.undo_send_seconds;
  const [draft_status, set_draft_status] = useState<DraftStatus>("idle");
  const [last_saved_time, set_last_saved_time] = useState<Date | null>(null);

  const [queued_email_id, set_queued_email_id] = useState<string | null>(null);
  const [send_error, set_send_error] = useState<string | null>(null);
  const [restore_error, set_restore_error] = useState<string | null>(null);

  const { handle_drag_start, get_position_style } = use_draggable_modal(
    is_open,
    MODAL_SIZES.large,
  );
  const attachments_scroll_ref = useRef<HTMLDivElement>(null);
  const save_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draft_data_ref = useRef<DraftRefData>({ recipients, subject, message });
  const just_loaded_draft_ref = useRef(false);
  const is_sending_ref = useRef(false);
  const file_input_ref = useRef<HTMLInputElement>(null);
  const message_textarea_ref = useRef<HTMLDivElement>(null);
  const draft_context_id_ref = useRef<string | null>(null);

  const [attachment_error, set_attachment_error] = useState<string | null>(
    null,
  );
  const [scheduled_time, set_scheduled_time] = useState<Date | null>(null);
  const [is_scheduling, set_is_scheduling] = useState(false);
  const [contacts, set_contacts] = useState<DecryptedContact[]>([]);

  const update_input = useCallback(
    (field: keyof InputsState, value: string) => {
      set_inputs((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const add_recipient = useCallback(
    (field: keyof RecipientsState, email: string) => {
      dispatch_recipients({ type: "ADD", field, email });
      set_inputs((prev) => ({ ...prev, [field]: "" }));
    },
    [],
  );

  const remove_recipient = useCallback(
    (field: keyof RecipientsState, email: string) => {
      dispatch_recipients({ type: "REMOVE", field, email });
    },
    [],
  );

  const remove_last_recipient = useCallback((field: keyof RecipientsState) => {
    dispatch_recipients({ type: "REMOVE_LAST", field });
  }, []);

  const show_cc_field = useCallback(
    () => set_visibility((prev) => ({ ...prev, cc: true })),
    [],
  );
  const show_bcc_field = useCallback(
    () => set_visibility((prev) => ({ ...prev, bcc: true })),
    [],
  );
  const hide_cc_field = useCallback(
    () => set_visibility((prev) => ({ ...prev, cc: false })),
    [],
  );
  const hide_bcc_field = useCallback(
    () => set_visibility((prev) => ({ ...prev, bcc: false })),
    [],
  );

  const reset_form = useCallback(() => {
    dispatch_recipients({ type: "RESET" });
    set_inputs(INITIAL_INPUTS);
    set_visibility(INITIAL_VISIBILITY);
    set_subject("");
    set_message("");
    set_attachments([]);
    set_draft_status("idle");
    set_last_saved_time(null);
    set_scheduled_time(null);
    set_is_scheduling(false);
  }, []);

  const clear_all_errors = useCallback(() => {
    set_send_error(null);
    set_restore_error(null);
  }, []);

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
    const load_preferences = async () => {
      if (!vault) return;
      const response = await get_preferences(vault);

      if (response.data) {
        set_auto_save_drafts(response.data.auto_save_drafts);
      }
    };

    load_preferences();
  }, [vault]);

  useEffect(() => {
    const load_contacts = async () => {
      if (!is_open) return;

      try {
        const response = await list_contacts({ limit: 100 });

        if (response.data?.items) {
          const decrypted = await decrypt_contacts(response.data.items);

          set_contacts(decrypted);
        }
      } catch {
        set_contacts([]);
      }
    };

    load_contacts();
  }, [is_open]);

  useEffect(() => {
    draft_data_ref.current = { recipients, subject, message };
  }, [recipients, subject, message]);

  useEffect(() => {
    if (!auto_save_drafts || !vault || !draft_context_id_ref.current) return;

    if (just_loaded_draft_ref.current) {
      just_loaded_draft_ref.current = false;

      return;
    }

    const has_content = recipients.to.length > 0 || subject || message;

    if (!has_content) {
      set_draft_status("idle");
      if (save_timer_ref.current) {
        clearTimeout(save_timer_ref.current);
        save_timer_ref.current = null;
      }

      return;
    }

    set_draft_status("saving");

    if (save_timer_ref.current) {
      clearTimeout(save_timer_ref.current);
    }

    const context_id = draft_context_id_ref.current;

    save_timer_ref.current = setTimeout(async () => {
      if (is_sending_ref.current || !context_id) {
        save_timer_ref.current = null;

        return;
      }

      const data = draft_data_ref.current;
      const draft_data: DraftData = {
        to_recipients: data.recipients.to,
        cc_recipients: data.recipients.cc,
        bcc_recipients: data.recipients.bcc,
        subject: data.subject,
        message: data.message,
      };

      const result = await draft_manager.save_draft(
        context_id,
        draft_data,
        vault,
      );

      if (result.success) {
        set_draft_status("saved");
        set_last_saved_time(new Date());
      } else {
        set_draft_status("idle");
      }
      save_timer_ref.current = null;
    }, 1000);

    return () => {
      if (save_timer_ref.current) {
        clearTimeout(save_timer_ref.current);
      }
    };
  }, [recipients, subject, message, auto_save_drafts, vault]);

  useEffect(() => {
    if (!is_open) return;

    is_sending_ref.current = false;
    reset_form();
    set_inputs(INITIAL_INPUTS);
    set_show_delete_confirm(false);
    set_draft_status("idle");
    clear_all_errors();

    if (draft_context_id_ref.current) {
      draft_manager.clear_context(draft_context_id_ref.current);
      draft_context_id_ref.current = null;
    }

    if (edit_draft) {
      draft_context_id_ref.current = draft_manager.load_context(
        edit_draft.id,
        edit_draft.version,
        edit_draft.draft_type || "new",
        edit_draft.reply_to_id,
        edit_draft.forward_from_id,
      );
      just_loaded_draft_ref.current = true;
      dispatch_recipients({
        type: "SET",
        field: "to",
        emails: edit_draft.to_recipients,
      });
      dispatch_recipients({
        type: "SET",
        field: "cc",
        emails: edit_draft.cc_recipients,
      });
      dispatch_recipients({
        type: "SET",
        field: "bcc",
        emails: edit_draft.bcc_recipients,
      });
      set_subject(edit_draft.subject);
      set_message(edit_draft.message);
      set_visibility({
        cc: edit_draft.cc_recipients.length > 0,
        bcc: edit_draft.bcc_recipients.length > 0,
      });
      set_draft_status("saved");
      set_last_saved_time(new Date(edit_draft.updated_at));
    } else {
      draft_context_id_ref.current = draft_manager.create_context("new");

      if (initial_to) {
        const emails = initial_to
          .split(",")
          .map((e) => e.trim())
          .filter((e) => is_valid_email(e));

        if (emails.length > 0) {
          dispatch_recipients({ type: "SET", field: "to", emails });
        }
      }

      setTimeout(() => {
        if (message_textarea_ref.current) {
          just_loaded_draft_ref.current = true;

          let content = "";

          if (preferences.signature_mode === "auto" && default_signature) {
            const signature_text = get_formatted_signature(default_signature);
            const signature_html = signature_text.replace(/\n/g, "<br>");

            content = "<br><br>" + signature_html + ASTER_FOOTER;
          } else {
            content = ASTER_FOOTER;
          }

          const sanitized_content = sanitize_html(content, {
            image_mode: "always",
          });

          message_textarea_ref.current.innerHTML = sanitized_content;
          set_message(message_textarea_ref.current.innerHTML);
        }
      }, 0);
    }

    return () => {
      if (save_timer_ref.current) {
        clearTimeout(save_timer_ref.current);
        save_timer_ref.current = null;
      }
    };
  }, [
    is_open,
    reset_form,
    clear_all_errors,
    edit_draft,
    initial_to,
    preferences.signature_mode,
    default_signature,
    get_formatted_signature,
  ]);

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

  const remove_attachment = useCallback((id: string) => {
    set_attachments((prev) => prev.filter((a) => a.id !== id));
    set_attachment_error(null);
  }, []);

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

  const trigger_file_select = useCallback(() => {
    file_input_ref.current?.click();
  }, []);

  const handle_editor_input = useCallback(() => {
    const editor = message_textarea_ref.current;

    if (editor) {
      set_message(editor.innerHTML);
    }
  }, []);

  const handle_editor_paste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");

    document.execCommand("insertText", false, text);
    const editor = message_textarea_ref.current;

    if (editor) {
      set_message(editor.innerHTML);
    }
  }, []);

  const do_internal_send = useCallback(
    (email_data: {
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      body: string;
    }) => {
      const delay_ms = get_undo_send_delay_ms(
        undo_send_enabled,
        undo_send_seconds,
        undo_send_period,
      );
      const delay_seconds = delay_ms / 1000;

      const saved_data = {
        to_recipients: email_data.to,
        cc_recipients: email_data.cc || [],
        bcc_recipients: email_data.bcc || [],
        subject: email_data.subject,
        message,
      };

      const email_id = queue_email(
        {
          ...email_data,
          on_complete: () => {
            set_queued_email_id(null);
            on_close();
            show_toast("Email sent.", "success");
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent("astermail:email-sent"));
            }, 100);
          },
          on_cancel: () => {
            set_queued_email_id(null);
          },
          on_error: (error: string) => {
            set_send_error(error);
          },
        },
        delay_ms,
      );

      if (email_id === null) {
        return;
      }

      undo_send_manager.add({
        id: email_id,
        to: email_data.to,
        cc: email_data.cc,
        bcc: email_data.bcc,
        subject: email_data.subject,
        body: email_data.body,
        scheduled_time: Date.now() + delay_ms,
        total_seconds: delay_seconds,
      });

      set_queued_email_id(email_id);
      sessionStorage.setItem(
        "astermail_pending_send",
        JSON.stringify(saved_data),
      );

      reset_form();
      on_close();
      if (edit_draft && on_draft_cleared) {
        on_draft_cleared();
      }
    },
    [
      undo_send_enabled,
      undo_send_seconds,
      undo_send_period,
      message,
      on_close,
      reset_form,
      edit_draft,
      on_draft_cleared,
    ],
  );

  const do_external_send = useCallback(
    (email_data: {
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      body: string;
    }) => {
      const delay_ms = get_undo_send_delay_ms(
        undo_send_enabled,
        undo_send_seconds,
        undo_send_period,
      );
      const delay_seconds = delay_ms / 1000;

      const saved_data = {
        to_recipients: email_data.to,
        cc_recipients: email_data.cc || [],
        bcc_recipients: email_data.bcc || [],
        subject: email_data.subject,
        message,
      };

      const email_id = crypto.randomUUID();
      const scheduled_time = Date.now() + delay_ms;

      const timeout_id = window.setTimeout(async () => {
        try {
          await execute_external_send(email_data, true);
          undo_send_manager.remove(email_id);
          set_queued_email_id(null);
          show_toast("Email sent.", "success");
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("astermail:email-sent"));
          }, 100);
        } catch (err) {
          undo_send_manager.remove(email_id);
          set_queued_email_id(null);
          set_send_error(
            (err as Error).message || "Failed to send external email",
          );
        }
      }, delay_ms);

      undo_send_manager.add({
        id: email_id,
        to: email_data.to,
        cc: email_data.cc,
        bcc: email_data.bcc,
        subject: email_data.subject,
        body: email_data.body,
        scheduled_time,
        total_seconds: delay_seconds,
        timeout_id,
        is_external: true,
        on_send_immediately: async () => {
          window.clearTimeout(timeout_id);
          try {
            await execute_external_send(email_data, true);
            set_queued_email_id(null);
            show_toast("Email sent.", "success");
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent("astermail:email-sent"));
            }, 100);
          } catch (err) {
            set_queued_email_id(null);
            set_send_error(
              (err as Error).message || "Failed to send external email",
            );
          }
        },
      });

      set_queued_email_id(email_id);
      sessionStorage.setItem(
        "astermail_pending_send",
        JSON.stringify(saved_data),
      );

      reset_form();
      on_close();
      if (edit_draft && on_draft_cleared) {
        on_draft_cleared();
      }
    },
    [
      undo_send_enabled,
      undo_send_seconds,
      undo_send_period,
      message,
      on_close,
      reset_form,
      edit_draft,
      on_draft_cleared,
    ],
  );

  const handle_send = useCallback(async () => {
    if (recipients.to.length === 0 || !user) return;

    is_sending_ref.current = true;

    if (save_timer_ref.current) {
      clearTimeout(save_timer_ref.current);
      save_timer_ref.current = null;
    }

    clear_all_errors();

    if (draft_context_id_ref.current) {
      await draft_manager.await_pending_save(draft_context_id_ref.current);
      await draft_manager.delete_draft(draft_context_id_ref.current);
      draft_manager.clear_context(draft_context_id_ref.current);
      draft_context_id_ref.current = null;
    }

    const email_data = {
      to: recipients.to,
      cc: recipients.cc.length > 0 ? recipients.cc : undefined,
      bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,
      subject,
      body: message + ASTER_FOOTER,
    };

    const all_recipients = [
      ...recipients.to,
      ...recipients.cc,
      ...recipients.bcc,
    ];

    const has_external = all_recipients.some((r) => !is_internal_email(r));
    const has_internal = all_recipients.some((r) => is_internal_email(r));

    if (has_external && has_internal) {
      set_send_error(
        "Cannot send to both internal and external recipients. Please send separately.",
      );

      return;
    }

    if (has_external) {
      do_external_send(email_data);

      return;
    }

    do_internal_send(email_data);
  }, [
    recipients,
    subject,
    message,
    user,
    clear_all_errors,
    do_internal_send,
    do_external_send,
  ]);

  const handle_scheduled_send = useCallback(async () => {
    if (recipients.to.length === 0 || !user || !vault || !scheduled_time)
      return;

    is_sending_ref.current = true;
    set_is_scheduling(true);

    if (save_timer_ref.current) {
      clearTimeout(save_timer_ref.current);
      save_timer_ref.current = null;
    }

    clear_all_errors();

    const content: ScheduledEmailContent = {
      to_recipients: recipients.to,
      cc_recipients: recipients.cc,
      bcc_recipients: recipients.bcc,
      subject,
      body: message + ASTER_FOOTER,
      scheduled_at: scheduled_time.toISOString(),
    };

    try {
      const response = await create_scheduled_email(vault, content);

      if (response.error) {
        set_send_error(response.error);
        set_is_scheduling(false);

        return;
      }

      if (draft_context_id_ref.current) {
        await draft_manager.await_pending_save(draft_context_id_ref.current);
        await draft_manager.delete_draft(draft_context_id_ref.current);
        draft_manager.clear_context(draft_context_id_ref.current);
        draft_context_id_ref.current = null;
      }

      reset_form();
      on_close();

      if (edit_draft && on_draft_cleared) {
        on_draft_cleared();
      }

      setTimeout(() => {
        emit_scheduled_changed({ action: "created" });
      }, 100);
    } catch (error) {
      set_send_error(
        error instanceof Error ? error.message : "Failed to schedule email",
      );
    } finally {
      set_is_scheduling(false);
    }
  }, [
    recipients,
    subject,
    message,
    scheduled_time,
    vault,
    user,
    clear_all_errors,
    reset_form,
    on_close,
    edit_draft,
    on_draft_cleared,
  ]);

  useEffect(() => {
    const handle_undo_event = (event: CustomEvent<UndoSendEvent>) => {
      const { id } = event.detail;

      if (id !== queued_email_id) return;

      const saved = sessionStorage.getItem("astermail_pending_send");

      if (saved) {
        try {
          const data = JSON.parse(saved) as {
            to_recipients?: string[];
            cc_recipients?: string[];
            bcc_recipients?: string[];
            subject?: string;
            message?: string;
          };

          dispatch_recipients({
            type: "SET",
            field: "to",
            emails: data.to_recipients || [],
          });
          dispatch_recipients({
            type: "SET",
            field: "cc",
            emails: data.cc_recipients || [],
          });
          dispatch_recipients({
            type: "SET",
            field: "bcc",
            emails: data.bcc_recipients || [],
          });
          set_subject(data.subject || "");
          set_message(data.message || "");
          set_visibility({
            cc: (data.cc_recipients || []).length > 0,
            bcc: (data.bcc_recipients || []).length > 0,
          });
          sessionStorage.removeItem("astermail_pending_send");
        } catch {
          set_restore_error(
            "Failed to restore draft. Your message was not sent.",
          );
        }
      }

      set_queued_email_id(null);
    };

    window.addEventListener(
      "astermail:undo-send",
      handle_undo_event as EventListener,
    );

    return () => {
      window.removeEventListener(
        "astermail:undo-send",
        handle_undo_event as EventListener,
      );
    };
  }, [queued_email_id]);

  const handle_delete_draft = useCallback(async () => {
    if (save_timer_ref.current) {
      clearTimeout(save_timer_ref.current);
      save_timer_ref.current = null;
    }

    if (draft_context_id_ref.current) {
      await draft_manager.await_pending_save(draft_context_id_ref.current);
      await draft_manager.delete_draft(draft_context_id_ref.current);
      draft_manager.clear_context(draft_context_id_ref.current);
      draft_context_id_ref.current = null;
    }

    reset_form();
    set_show_delete_confirm(false);

    if (edit_draft && on_draft_cleared) {
      on_draft_cleared();
      on_close();
    }
  }, [reset_form, edit_draft, on_draft_cleared, on_close]);

  const handle_show_delete_confirm = useCallback(
    () => set_show_delete_confirm(true),
    [],
  );
  const handle_hide_delete_confirm = useCallback(
    () => set_show_delete_confirm(false),
    [],
  );

  const handle_close = useCallback(() => {
    if (draft_context_id_ref.current) {
      draft_manager.clear_context(draft_context_id_ref.current);
      draft_context_id_ref.current = null;
    }
    on_close();
    if (edit_draft && on_draft_cleared) {
      on_draft_cleared();
    }
  }, [on_close, edit_draft, on_draft_cleared]);

  return (
    <AnimatePresence>
      {is_open && (
        <>
          <AnimatePresence>
            {is_expanded && (
              <motion.div
                key="compose-backdrop"
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-md"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            )}
          </AnimatePresence>
          <motion.div
            key="compose-modal"
            animate={{ opacity: 1 }}
            className={`fixed z-50 flex flex-col shadow-2xl sm:border ${
              is_minimized
                ? "sm:w-[320px] sm:h-auto sm:rounded-t-lg"
                : is_expanded
                  ? "inset-0 sm:inset-4 sm:w-auto sm:h-auto sm:rounded-lg"
                  : "inset-0 sm:inset-auto sm:w-[700px] sm:h-[600px] sm:max-w-[90vw] sm:max-h-[85vh] sm:rounded-lg"
            }`}
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              willChange: "opacity",
              ...(window.innerWidth >= 640 && !is_expanded && !is_minimized
                ? get_position_style()
                : {}),
              ...(is_minimized && window.innerWidth >= 640
                ? { bottom: 0, right: 24, top: "auto", left: "auto" }
                : {}),
            }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <ErrorBoundary fallback={<ComposeErrorFallback />}>
              <div
                className="flex items-center justify-between px-4 py-3 border-b cursor-move select-none"
                role="presentation"
                style={{ borderColor: "var(--border-primary)" }}
                onMouseDown={handle_drag_start}
              >
                <h2
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {edit_draft ? "Edit Draft" : "New Message"}
                </h2>
                <div
                  className="flex items-center gap-1"
                  role="presentation"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    className="transition-colors duration-150 p-1.5 w-7 h-7 flex items-center justify-center rounded"
                    style={{ color: "var(--text-muted)" }}
                    onClick={() => set_is_minimized(!is_minimized)}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        "var(--bg-hover)")
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
                    className="transition-colors duration-150 p-1.5 w-7 h-7 flex items-center justify-center rounded"
                    style={{ color: "var(--text-muted)" }}
                    onClick={() => {
                      set_is_expanded(!is_expanded);
                      set_is_minimized(false);
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        "var(--bg-hover)")
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
                      (e.currentTarget.style.backgroundColor =
                        "var(--bg-hover)")
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
                  <div className="px-4 pt-3 pb-1 flex-shrink-0 overflow-visible relative z-20">
                    <div
                      className="flex items-center gap-2 py-2 border-b"
                      style={{ borderColor: "var(--border-secondary)" }}
                    >
                      <span
                        className="text-sm w-14 flex-shrink-0"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        From
                      </span>
                      <div
                        className="flex items-center gap-1.5 bg-default-100 rounded-full px-2 py-1 border"
                        style={{ borderColor: "var(--border-secondary)" }}
                      >
                        <ProfileAvatar
                          email={user?.email || ""}
                          name={user?.username || ""}
                          size="xs"
                        />
                        <span className="text-sm text-default-900">
                          {user?.email || ""}
                        </span>
                      </div>
                    </div>

                    <div
                      className="py-2 border-b"
                      style={{ borderColor: "var(--border-secondary)" }}
                    >
                      <RecipientField
                        show_cc_bcc_buttons
                        contacts={contacts}
                        input_value={inputs.to}
                        label="To"
                        on_add_recipient={(email) => add_recipient("to", email)}
                        on_input_change={(val) => update_input("to", val)}
                        on_remove_last={() => remove_last_recipient("to")}
                        on_remove_recipient={(email) =>
                          remove_recipient("to", email)
                        }
                        on_show_bcc={show_bcc_field}
                        on_show_cc={show_cc_field}
                        recipients={recipients.to}
                        show_bcc={visibility.bcc}
                        show_cc={visibility.cc}
                      />
                    </div>

                    {visibility.cc && (
                      <div
                        className="py-2 border-b"
                        style={{ borderColor: "var(--border-secondary)" }}
                      >
                        <RecipientField
                          contacts={contacts}
                          input_value={inputs.cc}
                          label="CC"
                          on_add_recipient={(email) =>
                            add_recipient("cc", email)
                          }
                          on_close={hide_cc_field}
                          on_input_change={(val) => update_input("cc", val)}
                          on_remove_last={() => remove_last_recipient("cc")}
                          on_remove_recipient={(email) =>
                            remove_recipient("cc", email)
                          }
                          recipients={recipients.cc}
                        />
                      </div>
                    )}

                    {visibility.bcc && (
                      <div
                        className="py-2 border-b"
                        style={{ borderColor: "var(--border-secondary)" }}
                      >
                        <RecipientField
                          contacts={contacts}
                          input_value={inputs.bcc}
                          label="BCC"
                          on_add_recipient={(email) =>
                            add_recipient("bcc", email)
                          }
                          on_close={hide_bcc_field}
                          on_input_change={(val) => update_input("bcc", val)}
                          on_remove_last={() => remove_last_recipient("bcc")}
                          on_remove_recipient={(email) =>
                            remove_recipient("bcc", email)
                          }
                          recipients={recipients.bcc}
                        />
                      </div>
                    )}

                    <div
                      className="flex items-center gap-2 py-2 border-b"
                      style={{ borderColor: "var(--border-secondary)" }}
                    >
                      <span
                        className="text-sm w-14 flex-shrink-0"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Subject
                      </span>
                      <div className="flex-1 compose_recipient_input">
                        <input
                          className="w-full text-sm bg-transparent border-none outline-none"
                          placeholder="Add subject"
                          style={{ color: "var(--text-primary)" }}
                          type="text"
                          value={subject}
                          onChange={(e) => set_subject(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 px-3 pt-2 pb-2 overflow-hidden flex flex-col min-h-0">
                    <div
                      className="flex-1 flex flex-col min-h-0 rounded-md overflow-hidden"
                      style={{
                        border: "1px solid var(--border-secondary)",
                      }}
                    >
                      <div
                        className="flex-shrink-0 px-1"
                        style={{
                          borderBottom: "1px solid var(--border-secondary)",
                        }}
                      >
                        <EditorToolbar
                          editor_ref={message_textarea_ref}
                          on_change={handle_editor_input}
                        />
                      </div>

                      <div className="flex-1 overflow-auto px-3 py-2">
                        <div
                          ref={message_textarea_ref}
                          contentEditable
                          suppressContentEditableWarning
                          className="w-full h-full text-sm leading-relaxed border-none outline-none bg-transparent"
                          data-placeholder="Write message"
                          style={{
                            minHeight: "120px",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            color: "var(--text-primary)",
                          }}
                          onBlur={handle_editor_input}
                          onInput={handle_editor_input}
                          onPaste={handle_editor_paste}
                        />
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

              {attachments.length > 0 && (
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

              {(send_error || restore_error) && (
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
                    {send_error || restore_error}
                  </span>
                  <button
                    className="ml-auto text-red-500 hover:text-red-700"
                    onClick={clear_all_errors}
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                </div>
              )}

              {attachment_error && (
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

              <input
                ref={file_input_ref}
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.txt,.csv,.html,.css,.js,.json,.xml,.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.mp3,.wav,.ogg,.mp4,.webm,.mov"
                className="hidden"
                type="file"
                onChange={handle_file_select}
              />

              <div
                className="border-t px-3 py-2.5 flex items-center gap-2"
                style={{ borderColor: "var(--border-primary)" }}
              >
                {scheduled_time ? (
                  <Button
                    disabled={recipients.to.length === 0 || is_scheduling}
                    size="sm"
                    variant="primary"
                    onClick={handle_scheduled_send}
                  >
                    {is_scheduling ? (
                      <span className="flex items-center gap-1.5">
                        <svg
                          className="w-3.5 h-3.5 animate-spin"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                          <path
                            d="M12 2a10 10 0 0 1 10 10"
                            strokeLinecap="round"
                          />
                        </svg>
                        Scheduling...
                      </span>
                    ) : (
                      "Schedule"
                    )}
                  </Button>
                ) : (
                  <Button
                    disabled={recipients.to.length === 0}
                    size="sm"
                    variant="primary"
                    onClick={handle_send}
                  >
                    Send
                  </Button>
                )}

                <div className="flex items-center gap-0.5">
                  <SchedulePicker
                    disabled={recipients.to.length === 0}
                    on_schedule={set_scheduled_time}
                    scheduled_time={scheduled_time}
                  />
                  <ToolbarButton onClick={trigger_file_select}>
                    <AttachmentIcon className="w-4.5 h-4.5" />
                  </ToolbarButton>
                  <TemplatePicker
                    on_select={(content) => set_message(content)}
                  />
                </div>

                <AnimatePresence>
                  {draft_status !== "idle" && (
                    <motion.div
                      className="text-xs flex items-center gap-1.5 px-2 overflow-hidden"
                      style={{ color: "var(--text-muted)" }}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        {draft_status === "saving" ? (
                          <motion.div
                            key="saving"
                            className="flex items-center gap-1.5"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            <svg
                              className="w-3.5 h-3.5 animate-spin"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                            >
                              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                              <path
                                d="M12 2a10 10 0 0 1 10 10"
                                strokeLinecap="round"
                              />
                            </svg>
                            <span>Saving...</span>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="saved"
                            className="flex items-center gap-1.5"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            <motion.svg
                              className="w-3.5 h-3.5"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            >
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </motion.svg>
                            <span>
                              {last_saved_time
                                ? format_last_saved(last_saved_time)
                                : "Saved"}
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="ml-auto flex items-center gap-2">
                  <ToolbarButton onClick={handle_show_delete_confirm}>
                    <svg
                      className="w-4.5 h-4.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                    </svg>
                  </ToolbarButton>
                </div>
              </div>

              <ConfirmationModal
                cancel_text="Cancel"
                confirm_text="Delete"
                is_open={show_delete_confirm}
                message="Are you sure you want to delete this draft? This action cannot be undone."
                on_cancel={handle_hide_delete_confirm}
                on_confirm={handle_delete_draft}
                title="Delete Draft"
                variant="danger"
              />
            </ErrorBoundary>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
