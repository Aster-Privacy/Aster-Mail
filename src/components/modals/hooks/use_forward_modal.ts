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
import type { DecryptedContact } from "@/types/contacts";
import type { Badge } from "@/services/api/user";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useReducer,
  useMemo,
} from "react";

import { use_draggable_modal } from "@/hooks/use_draggable_modal";
import { use_editor } from "@/hooks/use_editor";
import { undo_send_manager } from "@/hooks/use_undo_send";
import { MODAL_SIZES } from "@/constants/modal";
import { send_forward, type OriginalEmail } from "@/services/mail_actions";
import { get_undo_send_delay_ms } from "@/services/send_queue";
import { use_preferences } from "@/contexts/preferences_context";
import { use_auth } from "@/contexts/auth_context";
import { show_toast } from "@/components/toast/simple_toast";
import { format_bytes } from "@/lib/utils";
import { list_contacts, decrypt_contacts } from "@/services/api/contacts";
import {
  create_scheduled_email,
  type ScheduledEmailContent,
} from "@/services/api/scheduled";
import { emit_scheduled_changed } from "@/hooks/mail_events";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  type Attachment,
  type DraftStatus,
  type RecipientsState,
  type InputsState,
  type VisibilityState,
  recipients_reducer,
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
import { send_via_external_account } from "@/services/api/external_accounts";
import { list_attachments } from "@/services/api/attachments";
import {
  decrypt_attachment_meta,
  decrypt_attachment_data,
  prepare_external_attachments,
} from "@/services/crypto/attachment_crypto";
import { array_to_base64 } from "@/services/crypto/envelope";
import {
  get_forward_mail_id,
  clear_forward_mail_id,
} from "@/services/forward_store";
import { fetch_my_badges } from "@/services/api/user";
import { build_badge_html } from "@/components/compose/compose_draft_helpers";
import { use_signatures } from "@/contexts/signatures_context";
import { sanitize_html } from "@/lib/html_sanitizer";

interface UseForwardModalProps {
  is_open: boolean;
  on_close: () => void;
  sender_name: string;
  sender_email: string;
  email_subject: string;
  email_body: string;
  email_timestamp: string;
  is_external: boolean;
  original_mail_id?: string;
}

export function use_forward_modal({
  is_open,
  on_close,
  sender_name,
  sender_email,
  email_subject,
  email_body,
  email_timestamp,
  is_external,
  original_mail_id,
}: UseForwardModalProps) {
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
  const ghost_mode = use_ghost_mode();
  const [recipients, dispatch_recipients] = useReducer(recipients_reducer, {
    to: [],
    cc: [],
    bcc: [],
  } as RecipientsState);
  const [inputs, set_inputs] = useState<InputsState>({
    to: "",
    cc: "",
    bcc: "",
  });
  const [visibility, set_visibility] = useState<VisibilityState>({
    cc: false,
    bcc: false,
  });
  const [forward_message, set_forward_message] = useState("");
  const [is_forward_visible, set_is_forward_visible] = useState(false);
  const [is_sending, set_is_sending] = useState(false);
  const [error_message, set_error_message] = useState<string | null>(null);
  const [is_minimized, set_is_minimized] = useState(false);
  const [is_expanded, set_is_expanded] = useState(false);
  const [expires_at, set_expires_at] = useState<Date | null>(null);
  const [expiry_password, set_expiry_password] = useState<string | null>(null);
  const [scheduled_time, set_scheduled_time] = useState<Date | null>(null);
  const [is_scheduling, set_is_scheduling] = useState(false);
  const [attachments, set_attachments] = useState<Attachment[]>([]);
  const [is_loading_attachments, set_is_loading_attachments] = useState(false);
  const [attachment_error, set_attachment_error] = useState<string | null>(
    null,
  );
  const [is_plain_text_mode, set_is_plain_text_mode] = useState(false);
  const [contacts, set_contacts] = useState<DecryptedContact[]>([]);
  const [draft_status] = useState<DraftStatus>("idle");
  const [last_saved_time] = useState<Date | null>(null);

  const message_editor_ref = useRef<HTMLDivElement>(null);
  const file_input_ref = useRef<HTMLInputElement>(null);
  const attachments_scroll_ref = useRef<HTMLDivElement>(null);
  const is_sending_ref = useRef(false);
  const forward_content_ref = useRef("");
  const content_initialized_ref = useRef(false);
  const effective_mail_id = original_mail_id || get_forward_mail_id();
  const original_mail_id_ref = useRef(effective_mail_id);

  original_mail_id_ref.current = effective_mail_id;
  const attachments_ref = useRef<Attachment[]>([]);

  attachments_ref.current = attachments;

  const files_drop_ref = useRef<((files: File[]) => void) | null>(null);

  const editor = use_editor({
    editor_ref: message_editor_ref as React.RefObject<HTMLDivElement | null>,
    on_change: (html: string) => set_forward_message(html),
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

  const build_forward_content = useCallback((): string => {
    const formatted_date = format_date(email_timestamp);
    const safe_name = sender_name
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const safe_email = sender_email
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const header = `---------- ${t("common.forwarded_message")} ---------<br>${t("common.from_label")} ${safe_name} &lt;${safe_email}&gt;<br>${t("common.date_label")} ${formatted_date}<br>${t("common.subject_label")} ${email_subject.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}<br><br>`;

    const sanitized_body = email_body
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "");

    return header + sanitized_body;
  }, [
    email_body,
    email_subject,
    email_timestamp,
    sender_email,
    sender_name,
    format_date,
  ]);

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

  useEffect(() => {
    if (is_open) {
      dispatch_recipients({ type: "RESET" });
      set_inputs({ to: "", cc: "", bcc: "" });
      set_visibility({ cc: false, bcc: false });
      set_is_sending(false);
      set_error_message(null);
      set_attachments([]);
      set_is_loading_attachments(false);
      set_attachment_error(null);
      set_scheduled_time(null);
      set_is_scheduling(false);
      set_expires_at(null);
      set_expiry_password(null);
      set_selected_sender(null);
      set_is_forward_visible(false);
      set_is_plain_text_mode(false);
      is_sending_ref.current = false;
      content_initialized_ref.current = false;
    } else {
      clear_forward_mail_id();
    }
  }, [is_open]);

  useEffect(() => {
    if (!is_open || content_initialized_ref.current) return;
    if (preferences.signature_mode === "auto" && signatures_loading) return;
    if (preferences.show_badges_in_signature && !badges_loaded) return;

    content_initialized_ref.current = true;

    setTimeout(() => {
      forward_content_ref.current = build_forward_content();
      if (!message_editor_ref.current) return;

      const badge_html = preferences.show_badges_in_signature
        ? build_badge_html(badges)
        : "";
      let content = "";

      if (preferences.signature_mode === "auto" && default_signature) {
        const signature_html = get_formatted_signature(default_signature);

        content = "<br><br>" + signature_html + badge_html;
      } else if (badge_html) {
        content = "<br><br>" + badge_html;
      }

      const sanitized = sanitize_html(content, {
        external_content_mode: "always",
      });

      message_editor_ref.current.innerHTML = sanitized.html;
      set_forward_message(message_editor_ref.current.innerHTML);
    }, 0);
  }, [
    is_open,
    build_forward_content,
    signatures_loading,
    badges_loaded,
    badges,
    default_signature,
    get_formatted_signature,
    preferences.signature_mode,
    preferences.show_badges_in_signature,
  ]);

  useEffect(() => {
    const mail_id = original_mail_id || get_forward_mail_id();

    if (!is_open || !mail_id) return;

    let cancelled = false;

    set_is_loading_attachments(true);

    const load_original_attachments = async () => {
      try {
        const response = await list_attachments(mail_id);

        if (cancelled || !response.data?.attachments?.length) {
          if (!cancelled) set_is_loading_attachments(false);

          return;
        }

        const loaded: Attachment[] = [];
        let total_size = 0;

        for (const att of response.data.attachments) {
          if (cancelled) return;

          try {
            const meta = await decrypt_attachment_meta(
              att.encrypted_meta,
              att.meta_nonce,
            );

            const decrypted_data = await decrypt_attachment_data(
              att.encrypted_data,
              att.data_nonce,
              meta.session_key,
            );

            if (
              total_size + decrypted_data.byteLength >
              MAX_TOTAL_ATTACHMENTS_SIZE
            ) {
              break;
            }

            total_size += decrypted_data.byteLength;

            loaded.push({
              id: generate_attachment_id(),
              name: meta.filename,
              size: format_bytes(decrypted_data.byteLength),
              size_bytes: decrypted_data.byteLength,
              mime_type: meta.content_type,
              data: decrypted_data,
              content_id: meta.content_id,
            });
          } catch {
            continue;
          }
        }

        if (!cancelled) {
          if (loaded.length > 0) {
            set_attachments(loaded);
            const inline_atts = loaded.filter(
              (a) => a.content_id && a.mime_type.startsWith("image/"),
            );

            if (inline_atts.length > 0) {
              let content = forward_content_ref.current;
              const blob_srcs = content.match(/src="blob:[^"]+"/g) || [];
              const inline_queue = [...inline_atts];

              for (const blob_match of blob_srcs) {
                const att = inline_queue.shift();

                if (!att) break;
                const b64 = array_to_base64(new Uint8Array(att.data));

                content = content.replace(
                  blob_match,
                  `src="data:${att.mime_type};base64,${b64}"`,
                );
              }
              for (const att of inline_queue) {
                const b64 = array_to_base64(new Uint8Array(att.data));

                content += `<br><img src="data:${att.mime_type};base64,${b64}" alt="${att.name.replace(/"/g, "&quot;")}" style="max-width:100%">`;
              }
              forward_content_ref.current = content;
            }
          }
          set_is_loading_attachments(false);
        }
      } catch {
        if (!cancelled) set_is_loading_attachments(false);
      }
    };

    load_original_attachments();

    return () => {
      cancelled = true;
    };
  }, [is_open, original_mail_id, effective_mail_id]);

  useEffect(() => {
    if (!is_external || sender_loading || selected_sender) return;
    const ext = sender_options.find(
      (s) => s.type === "external" && s.is_enabled,
    );

    if (ext) set_selected_sender(ext);
  }, [is_external, sender_options, sender_loading, selected_sender]);

  useEffect(() => {
    if (ghost_mode.is_ghost_enabled && ghost_mode.ghost_sender) {
      set_selected_sender(ghost_mode.ghost_sender);
    }
  }, [ghost_mode.is_ghost_enabled, ghost_mode.ghost_sender]);

  useEffect(() => {
    if (!is_open) return;

    const load_contacts_fn = async () => {
      try {
        const response = await list_contacts({ limit: 100 });

        if (response.data?.items) {
          const decrypted = await decrypt_contacts(response.data.items);

          set_contacts(decrypted);
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        set_contacts([]);
      }
    };

    load_contacts_fn();
  }, [is_open]);

  const exec_format_command = useCallback(
    (command: string) => {
      editor.exec_format(command);
    },
    [editor],
  );

  const handle_template_select = useCallback(
    (content: string) => {
      editor.insert_text(content);
    },
    [editor],
  );

  const toggle_plain_text_mode = useCallback(() => {
    set_is_plain_text_mode((prev) => !prev);
  }, []);

  const handle_forward = useCallback(async () => {
    if (is_sending_ref.current) return;
    if (recipients.to.length === 0 || is_sending || is_loading_attachments)
      return;

    is_sending_ref.current = true;
    set_error_message(null);
    set_is_sending(true);

    if (selected_sender?.type === "external" && selected_sender.address_hash) {
      const subject = `Fwd: ${email_subject}`;
      const ext_body =
        (forward_message ? forward_message + "<br><br>" : "") +
        forward_content_ref.current +
        get_aster_footer(t, preferences.show_aster_branding);
      const external_attachments =
        attachments_ref.current.length > 0
          ? prepare_external_attachments(attachments_ref.current)
          : undefined;
      const ext_result = await send_via_external_account(
        selected_sender.address_hash,
        recipients.to,
        recipients.cc,
        recipients.bcc,
        subject,
        ext_body,
        external_attachments,
      );

      if (ext_result.error) {
        is_sending_ref.current = false;
        set_error_message(ext_result.error);
        set_is_sending(false);

        return;
      }

      is_sending_ref.current = false;
      show_toast(t("common.email_sent"), "success");
      on_close();

      return;
    }

    const original: OriginalEmail = {
      sender_email,
      sender_name,
      subject: email_subject,
      body: email_body,
      timestamp: email_timestamp,
    };

    const delay_ms = get_undo_send_delay_ms(
      preferences.undo_send_enabled,
      preferences.undo_send_seconds,
      preferences.undo_send_period,
    );
    const delay_seconds = delay_ms / 1000;

    const fwd_sender_email =
      selected_sender && selected_sender.type !== "primary"
        ? selected_sender.email
        : undefined;
    const fwd_sender_alias_hash =
      selected_sender && selected_sender.type !== "primary"
        ? selected_sender.address_hash
        : undefined;

    const store_mail_id = get_forward_mail_id();
    const fwd_mail_id =
      original_mail_id_ref.current || original_mail_id || store_mail_id;
    const fwd_attachments =
      attachments_ref.current.length > 0
        ? attachments_ref.current
        : attachments.length > 0
          ? attachments
          : undefined;

    const result = await send_forward(
      {
        original,
        recipients: recipients.to,
        cc_recipients: recipients.cc,
        bcc_recipients: recipients.bcc,
        message: forward_message,
        expires_at: expires_at?.toISOString(),
        sender_email: fwd_sender_email,
        sender_alias_hash: fwd_sender_alias_hash,
        attachments: fwd_attachments,
        forward_original_mail_id: fwd_mail_id,
      },
      {
        on_complete: () => {
          is_sending_ref.current = false;
          if (delay_seconds === 0) {
            show_toast(t("common.email_sent"), "success");
          }
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("astermail:email-sent"));
          }, 100);
        },
        on_cancel: () => {
          is_sending_ref.current = false;
        },
        on_error: (error) => {
          is_sending_ref.current = false;
          set_error_message(error);
          set_is_sending(false);
        },
      },
      preferences.undo_send_period,
      preferences.show_aster_branding,
    );

    if (result.success && result.queued_id) {
      if (delay_seconds > 0) {
        undo_send_manager.add({
          id: result.queued_id,
          to: recipients.to,
          subject: `Fwd: ${email_subject}`,
          body: forward_message,
          scheduled_time: Date.now() + delay_ms,
          total_seconds: delay_seconds,
        });
      }

      on_close();
    } else if (!result.success) {
      is_sending_ref.current = false;
      set_error_message(result.error || t("common.failed_to_forward"));
      set_is_sending(false);
    }
  }, [
    recipients.to,
    recipients.cc,
    recipients.bcc,
    is_sending,
    sender_email,
    sender_name,
    email_subject,
    email_body,
    email_timestamp,
    forward_message,
    preferences.undo_send_period,
    preferences.undo_send_enabled,
    preferences.undo_send_seconds,
    on_close,
    expires_at,
    selected_sender,
    attachments,
    is_loading_attachments,
    original_mail_id,
  ]);

  const handle_scheduled_send = useCallback(async () => {
    if (recipients.to.length === 0 || !user || !vault || !scheduled_time)
      return;

    is_sending_ref.current = true;
    set_is_scheduling(true);
    set_error_message(null);

    const scheduled_body =
      (forward_message ? forward_message + "<br><br>" : "") +
      forward_content_ref.current +
      get_aster_footer(t, preferences.show_aster_branding);
    const content: ScheduledEmailContent = {
      to_recipients: recipients.to,
      cc_recipients: recipients.cc,
      bcc_recipients: recipients.bcc,
      subject: `Fwd: ${email_subject}`,
      body: scheduled_body,
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
    recipients.to,
    recipients.cc,
    recipients.bcc,
    user,
    vault,
    scheduled_time,
    email_subject,
    forward_message,
    on_close,
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
        } catch (error) {
          if (import.meta.env.DEV) console.error(error);
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

  const handle_files_drop = useCallback(
    async (files: File[]) => {
      set_attachment_error(null);
      const new_attachments: Attachment[] = [];
      const current_total = get_total_attachments_size();
      let running_total = current_total;

      for (const file of files) {
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
        } catch (error) {
          if (import.meta.env.DEV) console.error(error);
          set_attachment_error(`Failed to read "${file.name}"`);
        }
      }

      if (new_attachments.length > 0) {
        set_attachments((prev) => [...prev, ...new_attachments]);
      }
    },
    [attachments, get_total_attachments_size],
  );

  files_drop_ref.current = handle_files_drop;

  const remove_attachment = useCallback((id: string) => {
    set_attachments((prev) => prev.filter((a) => a.id !== id));
    set_attachment_error(null);
  }, []);

  const trigger_file_select = useCallback(() => {
    file_input_ref.current?.click();
  }, []);

  const can_send =
    recipients.to.length > 0 && !is_sending && !is_loading_attachments;

  return {
    t,
    reduce_motion,
    user,
    sender_options,
    selected_sender,
    set_selected_sender,
    ghost_mode,
    recipients,
    dispatch_recipients,
    inputs,
    set_inputs,
    visibility,
    set_visibility,
    forward_message,
    is_forward_visible,
    set_is_forward_visible,
    is_sending,
    error_message,
    set_error_message,
    is_minimized,
    set_is_minimized,
    is_expanded,
    set_is_expanded,
    expires_at,
    set_expires_at,
    expiry_password,
    set_expiry_password,
    scheduled_time,
    set_scheduled_time,
    is_scheduling,
    attachments,
    is_loading_attachments,
    attachment_error,
    set_attachment_error,
    is_plain_text_mode,
    contacts,
    draft_status,
    last_saved_time,
    message_editor_ref,
    file_input_ref,
    attachments_scroll_ref,
    forward_content_ref,
    editor,
    active_formats,
    handle_drag_start,
    get_position_style,
    is_mobile,
    exec_format_command,
    handle_template_select,
    toggle_plain_text_mode,
    handle_forward,
    handle_scheduled_send,
    handle_close,
    handle_file_select,
    handle_files_drop,
    remove_attachment,
    trigger_file_select,
    can_send,
    is_external,
    email_subject,
  };
}
