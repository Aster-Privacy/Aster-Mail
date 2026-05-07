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
import type { Badge } from "@/services/api/user";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { use_draggable_modal } from "@/hooks/use_draggable_modal";
import { use_editor } from "@/hooks/use_editor";
import { undo_send_manager } from "@/hooks/use_undo_send";
import { MODAL_SIZES } from "@/constants/modal";
import { send_reply, type OriginalEmail } from "@/services/mail_actions";
import { get_undo_send_delay_ms } from "@/services/send_queue";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_signatures } from "@/contexts/signatures_context";
import { show_toast } from "@/components/toast/simple_toast";
import { format_bytes } from "@/lib/utils";
import {
  emit_thread_reply_sent,
  emit_thread_reply_optimistic,
  emit_thread_reply_cancelled,
} from "@/hooks/mail_events";
import {
  create_scheduled_email,
  type ScheduledEmailContent,
} from "@/services/api/scheduled";
import { emit_scheduled_changed } from "@/hooks/mail_events";
import {
  create_draft,
  update_draft,
  delete_draft,
  type DraftContent,
} from "@/services/api/multi_drafts";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { api_client } from "@/services/api/client";
import { has_csrf_token } from "@/services/api/csrf";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  type Attachment,
  type DraftStatus,
  generate_attachment_id,
  get_aster_footer,
  MAX_ATTACHMENT_SIZE,
  MAX_TOTAL_ATTACHMENTS_SIZE,
  ALLOWED_MIME_TYPES,
  EVENT_DISPATCH_DELAY_MS,
} from "@/components/compose/compose_shared";
import {
  use_sender_aliases,
  type SenderOption,
} from "@/hooks/use_sender_aliases";
import { use_ghost_mode } from "@/hooks/use_ghost_mode";
import {
  get_preferred_sender_id,
  set_preferred_sender_id,
  subscribe_preferred_sender,
} from "@/lib/preferred_sender";
import { send_via_external_account } from "@/services/api/external_accounts";
import { prepare_external_attachments } from "@/services/crypto/attachment_crypto";
import { sanitize_html } from "@/lib/html_sanitizer";
import { fetch_my_badges } from "@/services/api/user";
import { build_badge_html } from "@/components/compose/compose_draft_helpers";

function normalize_html_newlines(html: string): string {
  let result = "";
  let in_tag = false;

  for (const ch of html) {
    if (ch === "<") {
      in_tag = true;
      result += ch;
    } else if (ch === ">") {
      in_tag = false;
      result += ch;
    } else if (ch === "\n" && !in_tag) {
      result += "<br>";
    } else if (ch !== "\r") {
      result += ch;
    }
  }

  return result;
}

interface UseReplyModalProps {
  is_open: boolean;
  on_close: () => void;
  recipient_name: string;
  recipient_email: string;
  original_subject: string;
  original_body: string;
  original_timestamp: string;
  original_cc?: string[];
  original_to?: string[];
  reply_all: boolean;
  thread_token?: string;
  original_email_id?: string;
  is_external: boolean;
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

export function use_reply_modal({
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
}: UseReplyModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { user, vault } = use_auth();
  const { preferences } = use_preferences();
  const {
    default_signature,
    get_formatted_signature,
    is_loading: signatures_loading,
  } = use_signatures();
  const [badges, set_badges] = useState<Badge[]>([]);
  const [badges_loaded, set_badges_loaded] = useState(false);

  useEffect(() => {
    fetch_my_badges().then((r) => {
      if (r.data) set_badges(r.data);
      set_badges_loaded(true);
    });
  }, []);
  const { sender_options, loading: sender_loading } = use_sender_aliases();
  const [selected_sender, set_selected_sender] = useState<SenderOption | null>(
    null,
  );
  const ghost_mode = use_ghost_mode(thread_token, thread_ghost_email);
  const [preferred_sender_id, set_preferred_sender_state] = useState<
    string | null
  >(() => get_preferred_sender_id());
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
  const [expires_at, set_expires_at] = useState<Date | null>(null);
  const [expiry_password, set_expiry_password] = useState<string | null>(null);
  const [scheduled_time, set_scheduled_time] = useState<Date | null>(null);
  const [is_scheduling, set_is_scheduling] = useState(false);
  const [draft_status, set_draft_status] = useState<DraftStatus>("idle");
  const [last_saved_time, set_last_saved_time] = useState<Date | null>(null);
  const [show_delete_confirm, set_show_delete_confirm] = useState(false);
  const [is_plain_text_mode, set_is_plain_text_mode] = useState(false);

  const message_editor_ref = useRef<HTMLDivElement>(null);
  const file_input_ref = useRef<HTMLInputElement>(null);
  const attachments_scroll_ref = useRef<HTMLDivElement>(null);
  const pending_thread_token_ref = useRef<string | null>(null);
  const optimistic_id_ref = useRef<string | null>(null);
  const save_draft_timeout = useRef<number | null>(null);
  const last_saved_text = useRef<string>("");
  const is_sending_ref = useRef(false);
  const last_send_time_ref = useRef<number>(0);
  const content_initialized_ref = useRef(false);
  const initial_content_ref = useRef<string>("");

  const reply_message_ref = useRef("");
  const save_draft_fn_ref = useRef<(text: string) => Promise<void>>(async () => {});
  const prev_is_open_ref = useRef(false);
  const files_drop_ref = useRef<((files: File[]) => void) | null>(null);

  const editor = use_editor({
    editor_ref: message_editor_ref as React.RefObject<HTMLDivElement | null>,
    on_change: (html: string) => set_reply_message(html),
    enable_rich_paste: !is_plain_text_mode,
    enable_keyboard_shortcuts: true,
    is_plain_text_mode,
    on_files_drop: (files: File[]) => files_drop_ref.current?.(files),
  });

  const active_formats = editor.format_state.active_formats;

  const { handle_drag_start, get_position_style } = use_draggable_modal(
    is_open,
    MODAL_SIZES.large,
  );

  const is_mac = editor.is_mac;

  useEffect(() => {
    if (!is_external || sender_loading || selected_sender) return;
    const ext = sender_options.find(
      (s) => s.type === "external" && s.is_enabled,
    );

    if (ext) set_selected_sender(ext);
  }, [is_external, sender_options, sender_loading, selected_sender]);

  useEffect(() => {
    if (sender_loading || selected_sender) return;

    if (reply_from_address) {
      const normalized = reply_from_address.toLowerCase();
      const match = sender_options.find(
        (s) => s.is_enabled && s.email.toLowerCase() === normalized,
      );

      if (match) {
        set_selected_sender(match);

        return;
      }
    }

    const to_addresses = original_to ?? [];

    for (const addr of to_addresses) {
      const normalized = addr.toLowerCase().trim();
      const match = sender_options.find(
        (s) => s.is_enabled && s.email.toLowerCase() === normalized,
      );

      if (match) {
        set_selected_sender(match);

        return;
      }
    }
  }, [
    sender_options,
    sender_loading,
    selected_sender,
    reply_from_address,
    original_to,
  ]);

  useEffect(() => {
    return subscribe_preferred_sender((id) => set_preferred_sender_state(id));
  }, []);

  useEffect(() => {
    if (sender_loading || selected_sender) return;
    if (!preferred_sender_id) return;

    const match = sender_options.find(
      (s) => s.is_enabled && s.id === preferred_sender_id,
    );

    if (match) {
      set_selected_sender(match);
    }
  }, [sender_options, sender_loading, selected_sender, preferred_sender_id]);

  const handle_set_preferred = useCallback(
    (id: string | null) => {
      set_preferred_sender_id(id);
      set_preferred_sender_state(id);
    },
    [],
  );

  useEffect(() => {
    if (ghost_mode.is_ghost_enabled && ghost_mode.ghost_sender) {
      set_selected_sender(ghost_mode.ghost_sender);
    }
  }, [ghost_mode.is_ghost_enabled, ghost_mode.ghost_sender]);

  const is_mobile = useMemo(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 640;
    }

    return false;
  }, []);

  const format_date = useCallback((timestamp: string): string => {
    const date = new Date(timestamp);

    return date.toLocaleDateString(undefined, {
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
      const header = t("mail.reply_quote_header", { date: formatted_date, name: `${safe_name} &lt;${safe_email}&gt;` });

      if (for_display) {
        const plain_body = original_body
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>/gi, "\n")
          .replace(/<\/div>/gi, "\n")
          .replace(/<div[^>]*>/gi, "\n")
          .replace(/<\/tr>/gi, "\n")
          .replace(/<\/li>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        const escape_html = (text: string): string =>
          text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

        const quoted_body = plain_body
          .split("\n")
          .map((line) => `&gt; ${escape_html(line)}`)
          .join("<br>");

        return `<div>${header}<br><br>${quoted_body}</div>`;
      }

      return `<br><br><div class="aster_quote"><div class="aster_quote_attr">${header}</div><blockquote class="aster_quote_body" style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex">${original_body}</blockquote></div>`;
    },
    [
      t,
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
      if (e["key"] === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        on_close();
      }
    };

    document.addEventListener("keydown", handle_escape);

    return () => document.removeEventListener("keydown", handle_escape);
  }, [is_open, on_close]);

  const existing_draft_ref = useRef(existing_draft);
  existing_draft_ref.current = existing_draft;

  useEffect(() => {
    content_initialized_ref.current = false;

    if (!is_open) return;

    const draft_snapshot = existing_draft_ref.current;
    const matching_draft =
      draft_snapshot &&
      (!draft_snapshot.reply_to_id ||
        draft_snapshot.reply_to_id === original_email_id)
        ? draft_snapshot
        : null;

    is_sending_ref.current = false;
    set_is_sending(false);
    set_error_message(null);
    set_attachments([]);
    set_attachment_error(null);
    set_show_quoted(false);
    set_draft_id(matching_draft?.id ?? null);
    set_draft_version(matching_draft?.version ?? 1);
    set_scheduled_time(null);
    set_is_scheduling(false);
    set_draft_status(matching_draft ? "saved" : "idle");
    set_last_saved_time(null);
    set_show_delete_confirm(false);
    set_is_plain_text_mode(false);
    last_saved_text.current = matching_draft?.content.message ?? "";
  }, [is_open, original_email_id]);

  useEffect(() => {
    if (!is_open || content_initialized_ref.current) return;

    const draft_snapshot = existing_draft_ref.current;
    const matching_draft =
      draft_snapshot &&
      (!draft_snapshot.reply_to_id ||
        draft_snapshot.reply_to_id === original_email_id)
        ? draft_snapshot
        : null;

    if (matching_draft) {
      content_initialized_ref.current = true;

      setTimeout(() => {
        if (!message_editor_ref.current) return;

        const sanitized_result = sanitize_html(matching_draft.content.message, {
          external_content_mode: "always",
        });

        message_editor_ref.current.innerHTML = sanitized_result.html;
        set_reply_message(message_editor_ref.current.innerHTML);
        message_editor_ref.current.focus();
      }, 0);

      return;
    }

    if (preferences.signature_mode === "auto" && signatures_loading) return;
    if (preferences.show_badges_in_signature && !badges_loaded) return;

    content_initialized_ref.current = true;

    setTimeout(() => {
      if (!message_editor_ref.current) return;

      let content = "";

      const badge_html = preferences.show_badges_in_signature
        ? build_badge_html(badges)
        : "";

      if (preferences.signature_mode === "auto" && default_signature) {
        content =
          get_formatted_signature(default_signature) +
          badge_html +
          get_aster_footer(t, preferences.show_aster_branding);
      } else {
        content =
          badge_html + get_aster_footer(t, preferences.show_aster_branding);
      }

      const sanitized_result = sanitize_html(content, {
        external_content_mode: "always",
      });

      message_editor_ref.current.innerHTML = sanitized_result.html;
      initial_content_ref.current = message_editor_ref.current.innerHTML;
      set_reply_message(message_editor_ref.current.innerHTML);
      message_editor_ref.current.focus();
    }, 0);
  }, [
    is_open,
    original_email_id,
    signatures_loading,
    default_signature,
    preferences.show_aster_branding,
    preferences.signature_mode,
    preferences.show_badges_in_signature,
    badges_loaded,
    badges,
    get_formatted_signature,
    t,
  ]);

  const has_user_content = useCallback((text: string) => {
    if (!text.trim()) return false;
    if (text === initial_content_ref.current) return false;
    return true;
  }, []);

  const save_thread_draft = useCallback(
    async (text: string) => {
      if (!has_user_content(text) || !original_email_id) return;

      const draft_vault = get_vault_from_memory();

      if (!draft_vault) return;

      if (!has_csrf_token()) {
        await api_client.refresh_session();
        if (!has_csrf_token()) {
          show_toast(t("common.session_expired_refresh"), "error");

          return;
        }
      }

      set_draft_status("saving");

      const subject = original_subject.startsWith(t("mail.reply_subject_prefix"))
        ? original_subject
        : `${t("mail.reply_subject_prefix")} ${original_subject}`;

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
          draft_vault,
          "reply",
          original_email_id,
          undefined,
          thread_token,
        );

        if (result.data) {
          set_draft_version(result.data.version);
          last_saved_text.current = text;
          set_draft_status("saved");
          set_last_saved_time(new Date());
          on_draft_saved?.({
            id: draft_id,
            version: result.data.version,
            content,
          });
        } else {
          set_draft_status("idle");
        }
      } else {
        const result = await create_draft(
          content,
          draft_vault,
          "reply",
          original_email_id,
          undefined,
          thread_token,
        );

        if (result.data) {
          set_draft_id(result.data.id);
          set_draft_version(result.data.version);
          last_saved_text.current = text;
          set_draft_status("saved");
          set_last_saved_time(new Date());
          on_draft_saved?.({
            id: result.data.id,
            version: result.data.version,
            content,
          });
        } else {
          set_draft_status("idle");
        }
      }
    },
    [
      t,
      thread_token,
      original_email_id,
      original_subject,
      recipient_email,
      draft_id,
      draft_version,
      on_draft_saved,
    ],
  );

  save_draft_fn_ref.current = save_thread_draft;
  reply_message_ref.current = reply_message;

  useEffect(() => {
    if (prev_is_open_ref.current && !is_open) {
      if (save_draft_timeout.current) {
        clearTimeout(save_draft_timeout.current);
        save_draft_timeout.current = null;
      }
      if (!is_sending_ref.current) {
        const current_text = reply_message_ref.current;
        if (
          current_text !== last_saved_text.current &&
          has_user_content(current_text) &&
          original_email_id
        ) {
          save_draft_fn_ref.current(current_text);
        }
      }
    }
    prev_is_open_ref.current = is_open;
  }, [is_open, original_email_id, has_user_content]);

  useEffect(() => {
    if (!is_open || !original_email_id || !has_user_content(reply_message)) return;
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
  }, [is_open, original_email_id, reply_message, save_thread_draft, has_user_content]);

  useEffect(() => {
    return () => {
      if (save_draft_timeout.current) {
        clearTimeout(save_draft_timeout.current);
      }
    };
  }, []);

  const exec_format_command = useCallback(
    (command: string) => {
      editor.exec_format(command);
    },
    [editor],
  );

  const handle_insert_link = useCallback(() => {
    const url = prompt(t("common.enter_url"), "https://");

    if (url?.trim()) {
      const trimmed_url = url.trim();
      const selection = window.getSelection();
      const selected_text = selection?.toString() || "";

      if (!selected_text) {
        const link_text =
          prompt(t("common.enter_link_text"), trimmed_url) || trimmed_url;

        editor.insert_link(trimmed_url, link_text);
      } else {
        editor.insert_link(trimmed_url);
      }
    }
  }, [editor]);

  const toggle_plain_text_mode = useCallback(() => {
    set_is_plain_text_mode((prev) => !prev);
  }, []);

  const handle_template_select = useCallback(
    (content: string) => {
      editor.insert_text(content);
    },
    [editor],
  );

  const handle_send = useCallback(async () => {
    if (is_sending_ref.current) return;
    if (!reply_message.trim() || is_sending) return;

    const now = Date.now();

    if (now - last_send_time_ref.current < 2000) return;

    if (save_draft_timeout.current) {
      clearTimeout(save_draft_timeout.current);
      save_draft_timeout.current = null;
    }

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
    const trimmed_reply = reply_message.trim();
    const reply_body = is_plain_text_mode
      ? trimmed_reply.replace(/\n/g, "<br>")
      : normalize_html_newlines(trimmed_reply);
    const message_with_signature = reply_body + quoted_content;

    if (selected_sender?.type === "external" && selected_sender.address_hash) {
      const subject = `${t("mail.reply_subject_prefix")} ${original_subject.replace(/^Re:\s*/i, "")}`;
      const external_attachments =
        attachments.length > 0
          ? prepare_external_attachments(attachments)
          : undefined;
      const ext_result = await send_via_external_account(
        selected_sender.address_hash,
        [recipient_email],
        [],
        [],
        subject,
        message_with_signature,
        external_attachments,
      );

      if (ext_result.error) {
        is_sending_ref.current = false;
        set_error_message(ext_result.error);
        set_is_sending(false);

        return;
      }

      is_sending_ref.current = false;
      show_toast(t("common.email_sent_via_external"), "success");
      window.dispatchEvent(new CustomEvent("astermail:email-sent"));

      if (draft_id) {
        const captured_draft_id = draft_id;

        set_draft_id(null);
        set_draft_version(1);
        last_saved_text.current = "";
        await delete_draft(captured_draft_id).catch(() => {});
      }

      on_close();

      return;
    }

    const delay_ms = get_undo_send_delay_ms(
      preferences.undo_send_enabled,
      preferences.undo_send_seconds,
      preferences.undo_send_period,
    );
    const delay_seconds = delay_ms / 1000;

    const sender_email_value =
      selected_sender && selected_sender.type !== "primary"
        ? selected_sender.email
        : undefined;
    const sender_alias_hash_value =
      selected_sender && selected_sender.type !== "primary"
        ? selected_sender.address_hash
        : undefined;

    const result = await send_reply(
      {
        original,
        message: message_with_signature,
        reply_all,
        thread_token,
        original_email_id,
        expires_at: expires_at?.toISOString(),
        sender_email: sender_email_value,
        sender_alias_hash: sender_alias_hash_value,
        in_reply_to: original_rfc_message_id,
      },
      {
        on_complete: () => {
          is_sending_ref.current = false;
          if (delay_seconds === 0) {
            show_toast(t("common.email_sent"), "success");
          }
          window.dispatchEvent(new CustomEvent("astermail:email-sent"));

          if (pending_thread_token_ref.current) {
            emit_thread_reply_sent({
              thread_token: pending_thread_token_ref.current,
              original_email_id,
            });
            pending_thread_token_ref.current = null;
          }
          optimistic_id_ref.current = null;
        },
        on_cancel: () => {
          is_sending_ref.current = false;
          if (optimistic_id_ref.current && pending_thread_token_ref.current) {
            emit_thread_reply_cancelled({
              optimistic_id: optimistic_id_ref.current,
              thread_token: pending_thread_token_ref.current,
            });
          }
          optimistic_id_ref.current = null;
          pending_thread_token_ref.current = null;
        },
        on_error: (error) => {
          is_sending_ref.current = false;
          if (optimistic_id_ref.current && pending_thread_token_ref.current) {
            emit_thread_reply_cancelled({
              optimistic_id: optimistic_id_ref.current,
              thread_token: pending_thread_token_ref.current,
            });
          }
          optimistic_id_ref.current = null;
          set_error_message(error);
          set_is_sending(false);
          pending_thread_token_ref.current = null;
        },
      },
      preferences.undo_send_period,
    );

    if (result.success && result.queued_id) {
      pending_thread_token_ref.current = result.thread_token || null;

      const reply_thread_token = result.thread_token || thread_token;

      if (reply_thread_token) {
        const opt_id = crypto.randomUUID();

        optimistic_id_ref.current = opt_id;

        const sender_name =
          selected_sender?.display_name || user?.display_name || user?.username || "";
        const sender_email_addr =
          selected_sender && selected_sender.type !== "primary"
            ? selected_sender.email
            : (user?.email || "");

        emit_thread_reply_optimistic({
          thread_token: reply_thread_token,
          original_email_id,
          optimistic_id: opt_id,
          sender_name,
          sender_email: sender_email_addr,
          subject: `${t("mail.reply_subject_prefix")} ${original_subject.replace(/^Re:\s*/i, "")}`,
          body: message_with_signature,
          display_body: reply_body,
          to_recipients: [{ name: recipient_name, email: recipient_email }],
        });
      }

      if (draft_id) {
        const captured_draft_id = draft_id;

        set_draft_id(null);
        set_draft_version(1);
        last_saved_text.current = "";
        delete_draft(captured_draft_id).catch(() => {});
      }

      if (delay_seconds > 0) {
        undo_send_manager.add({
          id: result.queued_id,
          to: [recipient_email],
          subject: `${t("mail.reply_subject_prefix")} ${original_subject.replace(/^Re:\s*/i, "")}`,
          body: message_with_signature,
          scheduled_time: Date.now() + delay_ms,
          total_seconds: delay_seconds,
          is_server_queued: result.is_server_queued,
          server_queue_id: result.is_server_queued ? result.queued_id : undefined,
          optimistic_id: optimistic_id_ref.current || undefined,
          thread_token: reply_thread_token || undefined,
        });
      }

      on_close();
    } else if (!result.success) {
      is_sending_ref.current = false;
      set_error_message(result.error || t("common.failed_to_send_reply"));
      set_is_sending(false);
    }
  }, [
    t,
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
    selected_sender,
    preferences.undo_send_period,
    preferences.undo_send_enabled,
    preferences.undo_send_seconds,

    on_close,
    draft_id,
    expires_at,
    build_quoted_content,
    user,
    is_plain_text_mode,
  ]);

  const handle_scheduled_send = useCallback(async () => {
    if (!reply_message.trim() || !user || !vault || !scheduled_time) return;

    if (save_draft_timeout.current) {
      clearTimeout(save_draft_timeout.current);
      save_draft_timeout.current = null;
    }

    is_sending_ref.current = true;
    set_is_scheduling(true);
    set_error_message(null);

    const quoted_content = build_quoted_content();
    const sched_trimmed = reply_message.trim();
    const sched_reply_body = is_plain_text_mode
      ? sched_trimmed.replace(/\n/g, "<br>")
      : normalize_html_newlines(sched_trimmed);
    const message_with_signature = sched_reply_body + quoted_content;

    const content: ScheduledEmailContent = {
      to_recipients: [recipient_email],
      cc_recipients: [],
      bcc_recipients: [],
      subject: original_subject.startsWith(t("mail.reply_subject_prefix"))
        ? original_subject
        : `${t("mail.reply_subject_prefix")} ${original_subject}`,
      body: message_with_signature,
      scheduled_at: scheduled_time.toISOString(),
    };

    try {
      const response = await create_scheduled_email(vault, content);

      if (response.error) {
        set_error_message(response.error);
        set_is_scheduling(false);
        is_sending_ref.current = false;

        return;
      }

      if (draft_id) {
        const captured_draft_id = draft_id;

        set_draft_id(null);
        set_draft_version(1);
        last_saved_text.current = "";
        await delete_draft(captured_draft_id).catch(() => {});
      }

      on_close();

      setTimeout(() => {
        emit_scheduled_changed({ action: "created" });
      }, EVENT_DISPATCH_DELAY_MS);
    } catch (error) {
      set_error_message(
        error instanceof Error ? error.message : t("common.failed_to_schedule"),
      );
    } finally {
      set_is_scheduling(false);
      is_sending_ref.current = false;
    }
  }, [
    t,
    reply_message,
    user,
    vault,
    scheduled_time,
    recipient_email,
    original_subject,

    build_quoted_content,
    on_close,
    draft_id,
    is_plain_text_mode,
  ]);

  const handle_close = useCallback(() => {
    on_close();
  }, [on_close]);

  const handle_delete_draft = useCallback(async () => {
    if (draft_id) {
      await delete_draft(draft_id);
      set_draft_id(null);
      set_draft_version(1);
      last_saved_text.current = "";
    }

    set_show_delete_confirm(false);
    on_close();
  }, [draft_id, on_close]);

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
            t("common.file_exceeds_max_size", { name: file.name }),
          );
          continue;
        }

        if (running_total + file.size > MAX_TOTAL_ATTACHMENTS_SIZE) {
          set_attachment_error(
            t("common.adding_file_would_exceed_limit", { name: file.name }),
          );
          continue;
        }

        const mime_type = file.type || "application/octet-stream";

        if (
          !ALLOWED_MIME_TYPES.has(mime_type) &&
          !mime_type.startsWith("text/")
        ) {
          set_attachment_error(t("common.unsupported_file_type", { name: file.name }));
          continue;
        }

        const exists = attachments.some((a) => a.name === file.name);

        if (exists) {
          set_attachment_error(t("common.file_already_attached", { name: file.name }));
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
        } catch (error) {
          if (import.meta.env.DEV) console.error(error);
          set_attachment_error(t("common.failed_to_read_named_file", { name: file.name }));
        }
      }

      if (new_attachments.length > 0) {
        set_attachments((prev) => [...prev, ...new_attachments]);
      }

      if (file_input_ref.current) {
        file_input_ref.current.value = "";
      }
    },
    [attachments, get_total_attachments_size, t],
  );

  const handle_files_drop = useCallback(
    async (files: File[]) => {
      set_attachment_error(null);
      const new_attachments: Attachment[] = [];
      const current_total = get_total_attachments_size();
      let running_total = current_total;

      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_SIZE) {
          set_attachment_error(
            t("common.file_exceeds_max_size", { name: file.name }),
          );
          continue;
        }

        if (running_total + file.size > MAX_TOTAL_ATTACHMENTS_SIZE) {
          set_attachment_error(
            t("common.adding_file_would_exceed_limit", { name: file.name }),
          );
          continue;
        }

        const mime_type = file.type || "application/octet-stream";

        if (
          !ALLOWED_MIME_TYPES.has(mime_type) &&
          !mime_type.startsWith("text/")
        ) {
          set_attachment_error(t("common.unsupported_file_type", { name: file.name }));
          continue;
        }

        const exists = attachments.some((a) => a.name === file.name);

        if (exists) {
          set_attachment_error(t("common.file_already_attached", { name: file.name }));
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
        } catch (error) {
          if (import.meta.env.DEV) console.error(error);
          set_attachment_error(t("common.failed_to_read_named_file", { name: file.name }));
        }
      }

      if (new_attachments.length > 0) {
        set_attachments((prev) => [...prev, ...new_attachments]);
      }
    },
    [attachments, get_total_attachments_size, t],
  );

  files_drop_ref.current = handle_files_drop;

  const remove_attachment = useCallback((id: string) => {
    set_attachments((prev) => prev.filter((a) => a.id !== id));
    set_attachment_error(null);
  }, []);

  const trigger_file_select = useCallback(() => {
    file_input_ref.current?.click();
  }, []);

  const is_valid = reply_message.trim().length > 0;
  const can_send = is_valid && !is_sending;

  return {
    t,
    reduce_motion,
    sender_options,
    selected_sender,
    set_selected_sender,
    ghost_mode,
    reply_message,
    is_sending,
    error_message,
    set_error_message,
    is_minimized,
    set_is_minimized,
    is_expanded,
    set_is_expanded,
    attachments,
    attachment_error,
    set_attachment_error,
    show_quoted,
    set_show_quoted,
    draft_id,
    expires_at,
    set_expires_at,
    expiry_password,
    set_expiry_password,
    scheduled_time,
    set_scheduled_time,
    is_scheduling,
    draft_status,
    last_saved_time,
    show_delete_confirm,
    set_show_delete_confirm,
    is_plain_text_mode,
    message_editor_ref,
    file_input_ref,
    attachments_scroll_ref,
    editor,
    active_formats,
    handle_drag_start,
    get_position_style,
    is_mac,
    is_mobile,
    build_quoted_content,
    exec_format_command,
    handle_insert_link,
    toggle_plain_text_mode,
    handle_template_select,
    handle_send,
    handle_scheduled_send,
    handle_close,
    handle_delete_draft,
    handle_file_select,
    handle_files_drop,
    remove_attachment,
    trigger_file_select,
    is_valid,
    can_send,
    is_external,
    recipient_email,
    original_subject,
    original_body,
    preferred_sender_id,
    handle_set_preferred,
  };
}
