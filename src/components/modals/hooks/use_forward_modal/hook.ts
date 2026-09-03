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

import {
  UseForwardModalProps,
  apply_inline_image_substitutions,
  merge_pending_recipients,
} from "./helpers";

import { use_draggable_modal } from "@/hooks/use_draggable_modal";
import { use_editor } from "@/hooks/use_editor";
import { undo_send_manager } from "@/hooks/use_undo_send";
import { MODAL_SIZES } from "@/constants/modal";
import { send_forward, type OriginalEmail } from "@/services/mail_actions";
import { get_undo_send_delay_ms } from "@/services/send_queue";
import {
  can_acquire_send_lock,
  SEND_LOCK_STALL_MS,
} from "@/components/compose/send_lock";
import { use_preferences } from "@/contexts/preferences_context";
import { auto_save_recipients_to_contacts } from "@/services/contacts_auto_save";
import { use_auth } from "@/contexts/auth_context";
import { show_toast } from "@/components/toast/simple_toast";
import { show_action_toast } from "@/components/toast/action_toast";
import { format_bytes } from "@/lib/utils";
import {
  MAX_RECIPIENTS_PER_FIELD,
  MAX_RECIPIENTS_PER_SEND,
  recipient_limit_violation,
} from "@/lib/recipient_limits";
import { list_contacts, decrypt_contacts } from "@/services/api/contacts";
import {
  create_scheduled_email,
  type ScheduledEmailContent,
} from "@/services/api/scheduled";
import { emit_email_sent, emit_scheduled_changed } from "@/hooks/mail_events";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  get_preferred_sender_id,
  set_preferred_sender_id,
  subscribe_preferred_sender,
} from "@/lib/preferred_sender";
import { use_preferred_sender_ready } from "@/hooks/use_preferred_sender_ready";
import { resolve_from_sender } from "@/components/compose/resolve_from_sender";
import {
  type Attachment,
  type DraftStatus,
  type RecipientsState,
  type InputsState,
  type VisibilityState,
  recipients_reducer,
  is_valid_email,
  generate_attachment_id,
  get_aster_footer,
  EVENT_DISPATCH_DELAY_MS,
} from "@/components/compose/compose_shared";
import {
  MAX_ATTACHMENTS_PER_SEND,
  ensure_attachment_limits,
  get_max_attachment_size,
  get_max_total_attachments_size,
} from "@/services/attachment_limits";
import {
  describe_oversized_file,
  describe_too_many_attachments,
  describe_would_exceed_total,
  prompt_attachment_upgrade,
} from "@/services/attachment_rejection";
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
import {
  get_forward_mail_id,
  clear_forward_mail_id,
} from "@/services/forward_store";
import { fetch_my_badges } from "@/services/api/user";
import { use_my_badge_prefs } from "@/stores/my_badge_prefs_store";
import { build_badge_html } from "@/components/compose/compose_draft_helpers";
import { use_signatures } from "@/contexts/signatures_context";
import { sanitize_html, sanitize_outgoing_html } from "@/lib/html_sanitizer";
import { inline_email_css } from "@/lib/forward_css_inliner";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import {
  app_hour12,
  app_locale,
  get_display_time_zone,
} from "@/utils/date_format";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import { user_facing_error } from "@/utils/user_facing_error";

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
  thread_token,
  thread_ghost_email,
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
  const my_badge_prefs = use_my_badge_prefs();
  const include_badge_signature =
    preferences.show_badges_in_signature &&
    !!my_badge_prefs?.show_badge_signature &&
    !!my_badge_prefs?.active_badge_slug;
  const active_badge =
    include_badge_signature && my_badge_prefs?.active_badge_slug
      ? (badges.find((b) => b.slug === my_badge_prefs.active_badge_slug) ??
        null)
      : null;

  useEffect(() => {
    fetch_my_badges().then((r) => {
      if (r.data) set_badges(r.data);
      set_badges_loaded(true);
    });
  }, []);
  const { sender_options, loading: sender_loading } = use_sender_aliases();
  const [selected_sender, set_selected_sender_state] =
    useState<SenderOption | null>(null);
  const sender_manually_selected_ref = useRef(false);
  const preferred_sender_ready = use_preferred_sender_ready();

  const set_selected_sender = useCallback((value: SenderOption | null) => {
    sender_manually_selected_ref.current = value !== null;
    set_selected_sender_state(value);
  }, []);
  const [preferred_sender_id, set_preferred_sender_state] = useState<
    string | null
  >(() => get_preferred_sender_id());
  const ghost_mode = use_ghost_mode(thread_token, thread_ghost_email);
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
  const send_lock_started_at_ref = useRef(0);
  const forward_content_ref = useRef("");
  const content_initialized_ref = useRef(false);
  const attachments_touched_ref = useRef(false);

  useEffect(() => {
    if (!is_sending) return;

    const timer = window.setTimeout(() => {
      is_sending_ref.current = false;
      send_lock_started_at_ref.current = 0;
      set_is_sending(false);
    }, SEND_LOCK_STALL_MS);

    return () => window.clearTimeout(timer);
  }, [is_sending]);

  const effective_mail_id = original_mail_id || get_forward_mail_id();
  const original_mail_id_ref = useRef(effective_mail_id);

  original_mail_id_ref.current = effective_mail_id;
  const attachments_ref = useRef<Attachment[]>([]);

  attachments_ref.current = attachments;

  const original_has_attachments_ref = useRef(false);
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

    return date.toLocaleDateString(app_locale(), {
      timeZone: get_display_time_zone(),
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      hour12: app_hour12(),
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

    return header + inline_email_css(email_body);
  }, [
    t,
    email_body,
    email_subject,
    email_timestamp,
    sender_email,
    sender_name,
    format_date,
  ]);

  const [is_discard_open, set_is_discard_open] = useState(false);

  const has_unsaved_content = useCallback(() => {
    if (forward_message.trim()) return true;
    if (attachments_touched_ref.current) return true;

    const fields = ["to", "cc", "bcc"] as const;

    return fields.some(
      (field) => recipients[field].length > 0 || inputs[field].trim() !== "",
    );
  }, [forward_message, inputs, recipients]);

  const commit_pending_recipient_inputs = useCallback(() => {
    const pending: Record<"to" | "cc" | "bcc", string> = {
      to: inputs.to.trim(),
      cc: inputs.cc.trim(),
      bcc: inputs.bcc.trim(),
    };

    (["to", "cc", "bcc"] as const).forEach((field) => {
      if (pending[field]) {
        dispatch_recipients({ type: "ADD", field, email: pending[field] });
      }
    });

    if (pending.to || pending.cc || pending.bcc) {
      set_inputs((prev) => ({
        to: pending.to ? "" : prev.to,
        cc: pending.cc ? "" : prev.cc,
        bcc: pending.bcc ? "" : prev.bcc,
      }));
    }

    return merge_pending_recipients(recipients, pending);
  }, [inputs.to, inputs.cc, inputs.bcc, recipients]);

  const handle_close = useCallback(() => {
    if (has_unsaved_content()) {
      set_is_discard_open(true);

      return;
    }

    on_close();
  }, [has_unsaved_content, on_close]);

  const confirm_discard = useCallback(() => {
    set_is_discard_open(false);
    on_close();
  }, [on_close]);

  const cancel_discard = useCallback(() => {
    set_is_discard_open(false);
  }, []);

  const request_discard = useCallback(() => {
    set_is_discard_open(true);
  }, []);

  use_escape_layer(is_open, handle_close, "forward_modal");

  useEffect(() => {
    if (is_open) {
      dispatch_recipients({ type: "RESET" });
      set_inputs({ to: "", cc: "", bcc: "" });
      set_visibility({ cc: false, bcc: false });
      set_is_sending(false);
      set_is_discard_open(false);
      set_error_message(null);
      set_attachments([]);
      original_has_attachments_ref.current = false;
      attachments_touched_ref.current = false;
      set_is_loading_attachments(false);
      set_attachment_error(null);
      set_scheduled_time(null);
      set_is_scheduling(false);
      set_expires_at(null);
      set_expiry_password(null);
      sender_manually_selected_ref.current = false;
      set_selected_sender_state(null);
      set_is_forward_visible(false);
      set_is_plain_text_mode(false);
      is_sending_ref.current = false;
      send_lock_started_at_ref.current = 0;
      content_initialized_ref.current = false;
      forward_content_ref.current = "";
    } else {
      clear_forward_mail_id();
    }
  }, [is_open]);

  useEffect(() => {
    if (!is_open || content_initialized_ref.current) return;
    if (preferences.signature_mode === "auto" && signatures_loading) return;
    if (include_badge_signature && !badges_loaded) return;

    content_initialized_ref.current = true;

    setTimeout(() => {
      forward_content_ref.current = build_forward_content();
      if (!message_editor_ref.current) return;

      const badge_html = active_badge ? build_badge_html([active_badge]) : "";
      let content = "";

      if (preferences.signature_mode === "auto" && default_signature) {
        const signature_html = get_formatted_signature(default_signature);

        content = "<br><br>" + signature_html + badge_html;
      } else if (badge_html) {
        content = "<br><br>" + badge_html;
      }

      const sanitized = sanitize_html(content, {
        external_content_mode: is_any_lockdown_active() ? "never" : "always",
        lockdown_mode: is_any_lockdown_active(),
      });

      message_editor_ref.current.innerHTML = sanitized.html;
      set_forward_message(message_editor_ref.current.innerHTML);
    }, 0);
  }, [
    is_open,
    build_forward_content,
    signatures_loading,
    badges_loaded,
    include_badge_signature,
    active_badge,
    default_signature,
    get_formatted_signature,
    preferences.signature_mode,
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
        let dropped = 0;
        let locked = 0;

        const original_attachments = response.data.attachments;

        for (let index = 0; index < original_attachments.length; index++) {
          const att = original_attachments[index];

          if (cancelled) return;

          try {
            const meta = await decrypt_attachment_meta(
              att.encrypted_meta,
              att.meta_nonce,
              att.mail_item_id,
              att.seq_num,
            );

            const decrypted_data = await decrypt_attachment_data(
              att.encrypted_data,
              att.data_nonce,
              meta.session_key,
              att.mail_item_id,
              att.seq_num,
            );

            if (
              total_size + decrypted_data.byteLength >
              get_max_total_attachments_size()
            ) {
              dropped += original_attachments.length - index;

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
            dropped += 1;
            locked += 1;
          }
        }

        if (!cancelled) {
          original_has_attachments_ref.current = true;

          if (loaded.length > 0) {
            set_attachments(loaded);
          }

          if (dropped > 0) {
            set_attachment_error(
              locked > 0
                ? t("common.forward_attachments_locked")
                : t("common.forward_attachments_unavailable"),
            );
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
    if (sender_loading) return;
    if (sender_manually_selected_ref.current) return;
    if (ghost_mode.is_ghost_enabled) return;
    if (!preferred_sender_ready && !preferred_sender_id) return;

    const resolved = resolve_from_sender({
      options: sender_options,
      prefer_external: is_external,
      preferred_sender_id,
    });

    if (!resolved) return;
    if (resolved.option.id === selected_sender?.id) return;

    set_selected_sender_state(resolved.option);
  }, [
    is_external,
    sender_options,
    sender_loading,
    selected_sender,
    preferred_sender_id,
    preferred_sender_ready,
    ghost_mode.is_ghost_enabled,
  ]);

  useEffect(() => {
    return subscribe_preferred_sender((id) => set_preferred_sender_state(id));
  }, []);

  const handle_set_preferred = useCallback((id: string | null) => {
    set_preferred_sender_id(id);
    set_preferred_sender_state(id);
  }, []);

  useEffect(() => {
    if (ghost_mode.is_ghost_enabled && ghost_mode.ghost_sender) {
      set_selected_sender_state(ghost_mode.ghost_sender);
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
    if (
      !can_acquire_send_lock(
        {
          held: is_sending_ref.current,
          started_at: send_lock_started_at_ref.current,
        },
        Date.now(),
      )
    )
      return;

    const send_recipients = commit_pending_recipient_inputs();

    if (send_recipients.to.length === 0) {
      set_error_message(t("errors.no_recipients"));

      return;
    }

    const recipient_violation = recipient_limit_violation(
      send_recipients.to,
      send_recipients.cc,
      send_recipients.bcc,
    );

    if (recipient_violation) {
      set_error_message(
        recipient_violation === "field"
          ? t("common.too_many_recipients_in_field", {
              max: MAX_RECIPIENTS_PER_FIELD,
            })
          : t("common.too_many_recipients_in_message", {
              max: MAX_RECIPIENTS_PER_SEND,
            }),
      );

      return;
    }

    if (is_loading_attachments) return;

    is_sending_ref.current = true;
    send_lock_started_at_ref.current = Date.now();
    set_error_message(null);
    set_is_sending(true);

    if (preferences.auto_save_recent_recipients) {
      void auto_save_recipients_to_contacts(
        [...send_recipients.to, ...send_recipients.cc, ...send_recipients.bcc],
        { own_addresses: user?.email ? [user.email] : [] },
      );
    }

    const { content: send_content, embedded_attachment_ids } =
      apply_inline_image_substitutions(
        forward_content_ref.current || build_forward_content(),
        attachments_ref.current,
      );

    if (selected_sender?.type === "external" && selected_sender.address_hash) {
      const subject = `${t("mail.forward_subject_prefix")} ${email_subject}`;
      const ext_body =
        (forward_message ? forward_message + "<br><br>" : "") +
        sanitize_outgoing_html(send_content) +
        get_aster_footer(t, preferences.show_aster_branding);
      const external_attachments =
        attachments_ref.current.length > 0
          ? prepare_external_attachments(attachments_ref.current)
          : undefined;
      const ext_result = await send_via_external_account(
        selected_sender.address_hash,
        send_recipients.to,
        send_recipients.cc,
        send_recipients.bcc,
        subject,
        ext_body,
        external_attachments,
      ).catch((error: unknown) => ({
        error:
          error instanceof Error
            ? error.message
            : t("common.failed_to_send_email"),
      }));

      if (ext_result.error) {
        is_sending_ref.current = false;
        send_lock_started_at_ref.current = 0;
        set_error_message(ext_result.error);
        set_is_sending(false);

        return;
      }

      is_sending_ref.current = false;
      send_lock_started_at_ref.current = 0;
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
    const fwd_sender_display_name =
      selected_sender && selected_sender.type !== "primary"
        ? selected_sender.display_name
        : undefined;

    const store_mail_id = get_forward_mail_id();
    const fwd_mail_id =
      original_mail_id_ref.current || original_mail_id || store_mail_id;
    const loaded_attachments =
      attachments_ref.current.length > 0
        ? attachments_ref.current
        : attachments;
    const remaining_attachments = loaded_attachments.filter(
      (att) => !embedded_attachment_ids.has(att.id),
    );
    const fwd_attachments =
      remaining_attachments.length > 0 ? remaining_attachments : undefined;
    const fwd_server_source_id = original_has_attachments_ref.current
      ? undefined
      : fwd_mail_id;

    const result = await send_forward(
      {
        original,
        recipients: send_recipients.to,
        cc_recipients: send_recipients.cc,
        bcc_recipients: send_recipients.bcc,
        message: forward_message,
        prebuilt_content: send_content,
        expires_at: expires_at?.toISOString(),
        sender_email: fwd_sender_email,
        sender_alias_hash: fwd_sender_alias_hash,
        sender_display_name: fwd_sender_display_name,
        attachments: fwd_attachments,
        forward_original_mail_id: fwd_server_source_id,
      },
      {
        on_complete: () => {
          is_sending_ref.current = false;
          send_lock_started_at_ref.current = 0;
          set_is_sending(false);
          setTimeout(() => {
            emit_email_sent();
          }, 100);
          show_action_toast({
            message: t("common.email_sent"),
            action_type: "read",
            email_ids: [],
            duration_ms: 5000,
            on_view_message: () => {
              window.dispatchEvent(
                new CustomEvent("astermail:navigate-to-sent"),
              );
            },
          });
        },
        on_cancel: () => {
          is_sending_ref.current = false;
          send_lock_started_at_ref.current = 0;
          set_is_sending(false);
        },
        on_error: (error) => {
          is_sending_ref.current = false;
          send_lock_started_at_ref.current = 0;
          set_error_message(error);
          set_is_sending(false);
        },
      },
      delay_ms,
      preferences.show_aster_branding,
    ).catch((error: unknown) => ({
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : t("common.failed_to_send_email"),
      queued_id: undefined,
    }));

    if (result.success && result.queued_id) {
      if (delay_seconds > 0) {
        undo_send_manager.add({
          id: result.queued_id,
          to: send_recipients.to,
          subject: `${t("mail.forward_subject_prefix")} ${email_subject}`,
          body: forward_message,
          sender_email: fwd_sender_email,
          scheduled_time: Date.now() + delay_ms,
          total_seconds: delay_seconds,
          is_server_queued: result.is_server_queued,
          server_queue_id: result.is_server_queued
            ? result.queued_id
            : undefined,
        });
      }

      on_close();
    } else if (!result.success) {
      is_sending_ref.current = false;
      send_lock_started_at_ref.current = 0;
      set_error_message(result.error || t("common.failed_to_forward"));
      set_is_sending(false);
    }
  }, [
    t,
    commit_pending_recipient_inputs,
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
    preferences.auto_save_recent_recipients,
    on_close,
    expires_at,
    selected_sender,
    attachments,
    is_loading_attachments,
    original_mail_id,
    build_forward_content,
    preferences.show_aster_branding,
  ]);

  const handle_scheduled_send = useCallback(async () => {
    if (!user || !vault || !scheduled_time) return;

    const send_recipients = commit_pending_recipient_inputs();

    if (send_recipients.to.length === 0) return;

    if (attachments.length > 0) {
      set_error_message(t("common.scheduled_no_attachments"));

      return;
    }

    is_sending_ref.current = true;
    set_is_scheduling(true);
    set_error_message(null);

    const { content: scheduled_content } = apply_inline_image_substitutions(
      forward_content_ref.current || build_forward_content(),
      attachments_ref.current,
    );
    const scheduled_body =
      (forward_message ? forward_message + "<br><br>" : "") +
      sanitize_outgoing_html(scheduled_content) +
      get_aster_footer(t, preferences.show_aster_branding);
    const content: ScheduledEmailContent = {
      to_recipients: send_recipients.to,
      cc_recipients: send_recipients.cc,
      bcc_recipients: send_recipients.bcc,
      subject: `${t("mail.forward_subject_prefix")} ${email_subject}`,
      body: scheduled_body,
      scheduled_at: scheduled_time.toISOString(),
    };

    try {
      const response = await create_scheduled_email(vault, content);

      if (response.error) {
        set_error_message(response.error);
        set_is_scheduling(false);
        is_sending_ref.current = false;
        send_lock_started_at_ref.current = 0;

        return;
      }

      on_close();

      setTimeout(() => {
        emit_scheduled_changed({ action: "created" });
      }, EVENT_DISPATCH_DELAY_MS);
    } catch (error) {
      set_error_message(
        user_facing_error(error, t("common.failed_to_schedule")),
      );
    } finally {
      set_is_scheduling(false);
      is_sending_ref.current = false;
      send_lock_started_at_ref.current = 0;
    }
  }, [
    t,
    commit_pending_recipient_inputs,
    user,
    vault,
    scheduled_time,
    email_subject,
    forward_message,
    on_close,
    attachments,
    build_forward_content,
    preferences.show_aster_branding,
  ]);

  const get_total_attachments_size = useCallback(() => {
    return attachments.reduce((total, att) => total + att.size_bytes, 0);
  }, [attachments]);

  const handle_file_select = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;

      if (!files || files.length === 0) return;

      set_attachment_error(null);
      await ensure_attachment_limits();
      const new_attachments: Attachment[] = [];
      const current_total = get_total_attachments_size();
      let running_total = current_total;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (
          attachments.length + new_attachments.length >=
          MAX_ATTACHMENTS_PER_SEND
        ) {
          set_attachment_error(describe_too_many_attachments(t));
          break;
        }

        if (file.size > get_max_attachment_size()) {
          const rejection = describe_oversized_file(t, file.name);

          set_attachment_error(rejection.message);

          if (rejection.can_upgrade)
            prompt_attachment_upgrade(rejection.message);
          continue;
        }

        if (running_total + file.size > get_max_total_attachments_size()) {
          set_attachment_error(describe_would_exceed_total(t, file.name));
          continue;
        }

        const mime_type = file.type || "application/octet-stream";

        const exists = attachments.some((a) => a.name === file.name);

        if (exists) {
          set_attachment_error(
            t("common.file_already_attached", { name: file.name }),
          );
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
          set_attachment_error(
            t("common.failed_to_read_named_file", { name: file.name }),
          );
        }
      }

      if (new_attachments.length > 0) {
        attachments_touched_ref.current = true;
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
      await ensure_attachment_limits();
      const new_attachments: Attachment[] = [];
      const current_total = get_total_attachments_size();
      let running_total = current_total;

      for (const file of files) {
        if (
          attachments.length + new_attachments.length >=
          MAX_ATTACHMENTS_PER_SEND
        ) {
          set_attachment_error(describe_too_many_attachments(t));
          break;
        }

        if (file.size > get_max_attachment_size()) {
          const rejection = describe_oversized_file(t, file.name);

          set_attachment_error(rejection.message);

          if (rejection.can_upgrade)
            prompt_attachment_upgrade(rejection.message);
          continue;
        }

        if (running_total + file.size > get_max_total_attachments_size()) {
          set_attachment_error(describe_would_exceed_total(t, file.name));
          continue;
        }

        const mime_type = file.type || "application/octet-stream";

        const exists = attachments.some((a) => a.name === file.name);

        if (exists) {
          set_attachment_error(
            t("common.file_already_attached", { name: file.name }),
          );
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
          set_attachment_error(
            t("common.failed_to_read_named_file", { name: file.name }),
          );
        }
      }

      if (new_attachments.length > 0) {
        attachments_touched_ref.current = true;
        set_attachments((prev) => [...prev, ...new_attachments]);
      }
    },
    [attachments, get_total_attachments_size, t],
  );

  files_drop_ref.current = handle_files_drop;

  const remove_attachment = useCallback((id: string) => {
    attachments_touched_ref.current = true;
    set_attachments((prev) => prev.filter((a) => a.id !== id));
    set_attachment_error(null);
  }, []);

  const trigger_file_select = useCallback(() => {
    file_input_ref.current?.click();
  }, []);

  const can_send =
    (recipients.to.length > 0 || is_valid_email(inputs.to.trim())) &&
    !is_sending &&
    !is_loading_attachments;

  return {
    t,
    reduce_motion,
    user,
    sender_options,
    selected_sender,
    set_selected_sender,
    preferred_sender_id,
    handle_set_preferred,
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
    is_discard_open,
    confirm_discard,
    cancel_discard,
    request_discard,
    handle_file_select,
    handle_files_drop,
    remove_attachment,
    trigger_file_select,
    can_send,
    is_external,
    email_subject,
  };
}
