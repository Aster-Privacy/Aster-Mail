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

import type { DecryptedContact } from "@/types/contacts";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useReducer,
} from "react";

import { use_draggable_modal } from "@/hooks/use_draggable_modal";
import { use_editor } from "@/hooks/use_editor";
import { MODAL_SIZES } from "@/constants/modal";
import {
  build_reply_recipients,
} from "@/services/mail_actions";
import { build_reply_subject } from "@/lib/reply_subject";
import {
  SEND_LOCK_STALL_MS,
} from "@/components/compose/send_lock";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_signatures } from "@/contexts/signatures_context";
import { show_toast } from "@/components/toast/simple_toast";
import {
  create_draft,
  update_draft,
  type DraftContent,
} from "@/services/api/multi_drafts";
import {
  get_vault_from_memory,
  wait_for_keys_ready,
  are_keys_ready,
} from "@/services/crypto/memory_key_store";
import { api_client } from "@/services/api/client";
import { has_csrf_token } from "@/services/api/csrf";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { use_date_format } from "@/hooks/use_date_format";
import {
  type Attachment,
  type DraftStatus,
  type RecipientsState,
  type InputsState,
  recipients_reducer,
  get_aster_footer,
} from "@/components/compose/compose_shared";
import {
  use_sender_aliases,
  type SenderOption,
} from "@/hooks/use_sender_aliases";
import { use_ghost_mode } from "@/hooks/use_ghost_mode";
import {
  get_preferred_sender_id,
  sender_id_matches,
  set_preferred_sender_id,
  subscribe_preferred_sender,
} from "@/lib/preferred_sender";
import {
  list_all_contacts,
  decrypt_contacts,
} from "@/services/api/contacts";
import {
  sanitize_html,
  sanitize_outgoing_html,
  repair_comment_markup,
} from "@/lib/html_sanitizer";
import { inline_email_css } from "@/lib/forward_css_inliner";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import { fetch_my_badges } from "@/services/api/user";
import { use_my_badge_prefs } from "@/stores/my_badge_prefs_store";
import { build_badge_html } from "@/components/compose/compose_draft_helpers";

import { ignore_error } from "@/lib/ignore_error";
import { signature_allowed_for_draft_type } from "@/utils/signature_scope";

import {
  UseReplyModalProps,
} from "./reply_modal_types";


export function use_reply_modal_state(props: UseReplyModalProps) {
  const {
    is_open,
    on_close,
    recipient_name,
    recipient_email,
    quote_sender_name,
    quote_sender_email,
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
    on_draft_saved,
    existing_draft,
  } = props;

  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { user, vault } = use_auth();
  const { preferences } = use_preferences();
  const { format_email_detail } = use_date_format();
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
  const [selected_sender, set_selected_sender] = useState<SenderOption | null>(
    null,
  );
  const ghost_mode = use_ghost_mode(thread_token, thread_ghost_email);
  const [preferred_sender_id, set_preferred_sender_state] = useState<
    string | null
  >(() => get_preferred_sender_id());
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
  const [show_cc, set_show_cc] = useState(false);
  const [contacts, set_contacts] = useState<DecryptedContact[]>([]);
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
  const [include_quoted, set_include_quoted] = useState(true);
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
  const [show_from_mismatch, set_show_from_mismatch] = useState(false);
  const [send_after_sender_switch, set_send_after_sender_switch] =
    useState(false);
  const from_mismatch_ack_ref = useRef(false);
  const pending_send_kind_ref = useRef<"send" | "scheduled" | null>(null);
  const handle_send_ref = useRef<() => void>(() => {});
  const handle_scheduled_send_ref = useRef<() => void>(() => {});

  const message_editor_ref = useRef<HTMLDivElement>(null);
  const file_input_ref = useRef<HTMLInputElement>(null);
  const attachments_scroll_ref = useRef<HTMLDivElement>(null);
  const pending_thread_token_ref = useRef<string | null>(null);
  const optimistic_id_ref = useRef<string | null>(null);
  const save_draft_timeout = useRef<number | null>(null);
  const last_saved_text = useRef<string>("");
  const is_sending_ref = useRef(false);
  const send_lock_started_at_ref = useRef(0);
  const last_send_time_ref = useRef<number>(0);
  const content_initialized_ref = useRef(false);
  const initial_content_ref = useRef<string>("");

  useEffect(() => {
    if (!is_sending) return;

    const timer = window.setTimeout(() => {
      is_sending_ref.current = false;
      send_lock_started_at_ref.current = 0;
      last_send_time_ref.current = 0;
      set_is_sending(false);
    }, SEND_LOCK_STALL_MS);

    return () => window.clearTimeout(timer);
  }, [is_sending]);

  const reply_message_ref = useRef("");
  const save_draft_fn_ref = useRef<(text: string) => Promise<void>>(
    async () => {},
  );
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

    for (const addr of (original_to ?? []).filter(Boolean)) {
      const normalized = addr.toLowerCase().trim();
      const match = sender_options.find(
        (s) => s.is_enabled && s.email?.toLowerCase() === normalized,
      );

      if (match) {
        set_selected_sender(match);

        return;
      }
    }

    if (is_external) {
      const ext = sender_options.find(
        (s) => s.type === "external" && s.is_enabled,
      );

      if (ext) {
        set_selected_sender(ext);

        return;
      }
    }

    if (preferred_sender_id) {
      const match = sender_options.find(
        (s) => s.is_enabled && sender_id_matches(s.id, preferred_sender_id),
      );

      if (match) {
        set_selected_sender(match);
      }
    }
  }, [
    sender_options,
    sender_loading,
    selected_sender,
    reply_from_address,
    original_to,
    is_external,
    preferred_sender_id,
  ]);

  useEffect(() => {
    return subscribe_preferred_sender((id) => set_preferred_sender_state(id));
  }, []);

  const handle_set_preferred = useCallback((id: string | null) => {
    set_preferred_sender_id(id);
    set_preferred_sender_state(id);
  }, []);

  const own_addresses = useMemo(
    () =>
      [user?.email, ...sender_options.map((s) => s.email)].filter(
        (value): value is string => !!value,
      ),
    [user?.email, sender_options],
  );

  const seeded_recipients = useMemo(
    () =>
      build_reply_recipients(
        {
          original: {
            sender_email: recipient_email,
            sender_name: recipient_name,
            subject: original_subject,
            body: "",
            timestamp: original_timestamp,
            cc: original_cc,
            to: original_to,
          },
          message: "",
          reply_all,
          own_addresses,
        },
        user?.email ?? "",
      ),
    [
      recipient_email,
      recipient_name,
      original_subject,
      original_timestamp,
      original_cc,
      original_to,
      reply_all,
      own_addresses,
      user?.email,
    ],
  );

  const seed_signature = `${seeded_recipients.to.join(",")}|${seeded_recipients.cc.join(",")}`;
  const seeded_signature_ref = useRef<string | null>(null);
  const draft_seeded_ref = useRef<string | null>(null);

  const draft_recipients = useMemo(() => {
    if (
      !existing_draft ||
      (existing_draft.reply_to_id &&
        existing_draft.reply_to_id !== original_email_id)
    ) {
      return null;
    }

    const to = existing_draft.content.to_recipients ?? [];

    if (to.length === 0) return null;

    return {
      id: existing_draft.id,
      to,
      cc: existing_draft.content.cc_recipients ?? [],
    };
  }, [existing_draft, original_email_id]);

  useEffect(() => {
    if (!is_open) {
      seeded_signature_ref.current = null;
      draft_seeded_ref.current = null;

      return;
    }

    const apply = (to: string[], cc: string[]) => {
      dispatch_recipients({ type: "SET", field: "to", emails: to });
      dispatch_recipients({ type: "SET", field: "cc", emails: cc });
      set_inputs({ to: "", cc: "", bcc: "" });
      if (cc.length > 0) set_show_cc(true);
    };

    if (draft_recipients && draft_seeded_ref.current === null) {
      draft_seeded_ref.current = draft_recipients.id;
      seeded_signature_ref.current = seed_signature;
      apply(draft_recipients.to, draft_recipients.cc);

      return;
    }

    if (seeded_signature_ref.current === seed_signature) return;

    seeded_signature_ref.current = seed_signature;
    apply(seeded_recipients.to, seeded_recipients.cc);
  }, [is_open, seed_signature, seeded_recipients, draft_recipients]);

  useEffect(() => {
    if (!is_open || contacts.length > 0) return;

    let cancelled = false;

    list_all_contacts()
      .then(async (response) => {
        if (cancelled || !response.data?.items) return;

        const decrypted = await decrypt_contacts(response.data.items);

        if (!cancelled) set_contacts(decrypted);
      })
      .catch((caught) => ignore_error("components/modals/hooks/use_reply_modal_state:apply", caught));

    return () => {
      cancelled = true;
    };
  }, [is_open, contacts.length]);

  const commit_pending_recipient_inputs = useCallback(() => {
    const pending_to = inputs.to.trim();
    const pending_cc = inputs.cc.trim();

    if (pending_to) {
      dispatch_recipients({ type: "ADD", field: "to", email: pending_to });
      set_inputs((prev) => ({ ...prev, to: "" }));
    }
    if (pending_cc) {
      dispatch_recipients({ type: "ADD", field: "cc", email: pending_cc });
      set_inputs((prev) => ({ ...prev, cc: "" }));
    }

    const merge = (existing: string[], pending: string) => {
      if (!pending) return existing;
      if (existing.some((e) => e.toLowerCase() === pending.toLowerCase())) {
        return existing;
      }

      return [...existing, pending];
    };

    return {
      to: merge(recipients.to, pending_to),
      cc: merge(recipients.cc, pending_cc),
    };
  }, [inputs.to, inputs.cc, recipients.to, recipients.cc]);

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

  const format_date = useCallback(
    (timestamp: string): string => {
      const date = new Date(timestamp);

      if (Number.isNaN(date.getTime())) return timestamp;

      return format_email_detail(date);
    },
    [format_email_detail],
  );

  const build_quoted_content = useCallback(
    (for_display: boolean = false): string => {
      const formatted_date = format_date(original_timestamp);
      const attribution_name = quote_sender_name || recipient_name;
      const attribution_email = quote_sender_email || recipient_email;
      const safe_name = attribution_name
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const safe_email = attribution_email
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const header = t("mail.reply_quote_header", {
        date: formatted_date,
        name: `${safe_name} &lt;${safe_email}&gt;`,
      });

      if (for_display) {
        const plain_body = (() => {
          const doc = new DOMParser().parseFromString(
            repair_comment_markup(original_body),
            "text/html",
          );

          doc
            .querySelectorAll("script, style, head")
            .forEach((el) => el.remove());
          doc.querySelectorAll("img").forEach((el) => {
            const alt = el.getAttribute("alt");

            el.replaceWith(alt?.trim() ? `[${alt.trim()}]` : "[image]");
          });
          doc.querySelectorAll("br").forEach((el) => el.replaceWith("\n"));
          doc
            .querySelectorAll("p, div, tr, li")
            .forEach((el) => el.after("\n"));

          return (doc.body.textContent ?? "")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        })();

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

      return `<br><br><div class="aster_quote"><div class="aster_quote_attr">${header}</div><blockquote class="aster_quote_body" style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex">${sanitize_outgoing_html(inline_email_css(original_body))}</blockquote></div>`;
    },
    [
      t,
      original_body,
      original_timestamp,
      recipient_email,
      recipient_name,
      quote_sender_email,
      quote_sender_name,
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
    send_lock_started_at_ref.current = 0;
    set_is_sending(false);
    set_error_message(null);
    set_attachments([]);
    set_attachment_error(null);
    set_show_quoted(false);
    set_include_quoted(true);
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
          external_content_mode: is_any_lockdown_active() ? "never" : "always",
          lockdown_mode: is_any_lockdown_active(),
        });

        message_editor_ref.current.innerHTML = sanitized_result.html;
        set_reply_message(message_editor_ref.current.innerHTML);
        message_editor_ref.current.focus();
      }, 0);

      return;
    }

    if (preferences.signature_mode === "auto" && signatures_loading) return;
    if (include_badge_signature && !badges_loaded) return;

    content_initialized_ref.current = true;

    setTimeout(() => {
      if (!message_editor_ref.current) return;

      let content = "";

      const badge_html = active_badge ? build_badge_html([active_badge]) : "";

      if (
        preferences.signature_mode === "auto" &&
        default_signature &&
        signature_allowed_for_draft_type(preferences, "reply")
      ) {
        content =
          get_formatted_signature(default_signature) +
          badge_html +
          get_aster_footer(t, preferences.show_aster_branding);
      } else {
        content =
          badge_html + get_aster_footer(t, preferences.show_aster_branding);
      }

      const sanitized_result = sanitize_html(content, {
        external_content_mode: is_any_lockdown_active() ? "never" : "always",
        lockdown_mode: is_any_lockdown_active(),
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
    preferences.signature_in_replies,
    include_badge_signature,
    active_badge,
    badges_loaded,
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

      if (!are_keys_ready()) {
        await wait_for_keys_ready();
      }

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

      const subject = build_reply_subject(
        original_subject,
        t("mail.reply_subject_prefix"),
      );

      const content: DraftContent = {
        to_recipients:
          recipients.to.length > 0 ? recipients.to : [recipient_email],
        cc_recipients: recipients.cc,
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
      recipients.to,
      recipients.cc,
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
    if (!is_open || !original_email_id || !has_user_content(reply_message))
      return;
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
  }, [
    is_open,
    original_email_id,
    reply_message,
    save_thread_draft,
    has_user_content,
  ]);

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

  return {
    t,
    reduce_motion,
    user,
    vault,
    preferences,
    sender_options,
    selected_sender,
    set_selected_sender,
    ghost_mode,
    preferred_sender_id,
    recipients,
    dispatch_recipients,
    inputs,
    set_inputs,
    show_cc,
    set_show_cc,
    contacts,
    reply_message,
    is_sending,
    set_is_sending,
    error_message,
    set_error_message,
    is_minimized,
    set_is_minimized,
    is_expanded,
    set_is_expanded,
    attachments,
    set_attachments,
    attachment_error,
    set_attachment_error,
    show_quoted,
    set_show_quoted,
    include_quoted,
    set_include_quoted,
    draft_id,
    set_draft_id,
    set_draft_version,
    expires_at,
    set_expires_at,
    expiry_password,
    set_expiry_password,
    scheduled_time,
    set_scheduled_time,
    is_scheduling,
    set_is_scheduling,
    draft_status,
    last_saved_time,
    show_delete_confirm,
    set_show_delete_confirm,
    is_plain_text_mode,
    set_is_plain_text_mode,
    show_from_mismatch,
    set_show_from_mismatch,
    send_after_sender_switch,
    set_send_after_sender_switch,
    from_mismatch_ack_ref,
    pending_send_kind_ref,
    handle_send_ref,
    handle_scheduled_send_ref,
    message_editor_ref,
    file_input_ref,
    attachments_scroll_ref,
    pending_thread_token_ref,
    optimistic_id_ref,
    save_draft_timeout,
    last_saved_text,
    is_sending_ref,
    send_lock_started_at_ref,
    last_send_time_ref,
    files_drop_ref,
    editor,
    active_formats,
    handle_drag_start,
    get_position_style,
    is_mac,
    handle_set_preferred,
    own_addresses,
    commit_pending_recipient_inputs,
    is_mobile,
    build_quoted_content,
    exec_format_command,
    handle_insert_link,
  };
}
