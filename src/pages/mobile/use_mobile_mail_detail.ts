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
import type { DecryptedThreadMessage } from "@/types/thread";
import type { ExternalContentReport } from "@/lib/html_sanitizer";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { swipe_nav_state } from "./mobile_mail_detail_swipe";

import { use_spam_confirm } from "@/components/email/use_spam_confirm";
import { use_email_detail } from "@/components/email/hooks/use_email_detail";
import { build_reply_recipient_for_message } from "@/components/email/build_reply_recipient";
import { use_email_actions } from "@/hooks/use_email_actions";
import { remove_email_from_view_cache } from "@/hooks/use_email_list";
import { use_date_format } from "@/hooks/use_date_format";
import { use_should_reduce_motion } from "@/provider";
import { use_preferences } from "@/contexts/preferences_context";
import { show_toast } from "@/components/toast/simple_toast";
import { show_action_toast } from "@/components/toast/action_toast";
import { get_aster_footer } from "@/components/compose/compose_shared";
import { update_item_metadata } from "@/services/crypto/mail_metadata";
import { emit_mail_item_updated } from "@/hooks/mail_events";
import { preload_email_detail } from "@/components/email/hooks/use_email_detail";
import { haptic_impact } from "@/native/haptic_feedback";
import { block_sender } from "@/services/api/blocked_senders";
import { use_snooze } from "@/hooks/use_snooze";
import { use_i18n } from "@/lib/i18n/context";
import { build_reply_subject } from "@/lib/reply_subject";
import {
  is_lockdown_enabled,
  LOCKDOWN_CHANGED_EVENT,
} from "@/services/lockdown_store";
import { use_auth_safe } from "@/contexts/auth_context";

import { ignore_error } from "@/lib/ignore_error";

export function use_mobile_mail_detail() {
  const navigate = useNavigate();
  const location = useLocation();
  const from_view = (location.state as { from_view?: string } | null)
    ?.from_view;
  const detail = use_email_detail();
  const auth = use_auth_safe();
  const account_id = auth?.current_account_id ?? "";
  const email_actions = use_email_actions();
  const { format_email_detail } = use_date_format();
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const { request_spam, spam_confirm_dialog } = use_spam_confirm();
  const [is_starred, set_is_starred] = useState<boolean | null>(null);
  const [is_pinned, set_is_pinned] = useState<boolean | null>(null);
  const [expanded_ids, set_expanded_ids] = useState<Set<string>>(new Set());
  const [read_ids, set_read_ids] = useState<Set<string>>(new Set());
  const [menu_message, set_menu_message] =
    useState<DecryptedThreadMessage | null>(null);
  const [menu_source, set_menu_source] = useState<"message" | "toolbar">(
    "message",
  );
  const [view_source_message, set_view_source_message] =
    useState<DecryptedThreadMessage | null>(null);
  const [external_content_report, set_external_content_report] =
    useState<ExternalContentReport | null>(null);
  const [external_content_loaded, set_external_content_loaded] =
    useState(false);
  const [lockdown_active, set_lockdown_active] = useState(() =>
    is_lockdown_enabled(account_id),
  );

  useEffect(() => {
    const update = () =>
      set_lockdown_active(is_lockdown_enabled(auth?.current_account_id ?? ""));

    window.addEventListener(LOCKDOWN_CHANGED_EVENT, update);
    window.addEventListener("storage", update);

    return () => {
      window.removeEventListener(LOCKDOWN_CHANGED_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, [auth?.current_account_id]);
  const [show_toolbar_customizer, set_show_toolbar_customizer] =
    useState(false);
  const [subject_expanded, set_subject_expanded] = useState(false);
  const [show_block_confirm, set_show_block_confirm] = useState(false);
  const [blocking_sender, set_blocking_sender] = useState(false);
  const [block_target, set_block_target] = useState<{
    email: string;
    name: string;
  } | null>(null);
  const snooze_actions = use_snooze();
  const [show_snooze_sheet, set_show_snooze_sheet] = useState(false);
  const [snooze_target_id, set_snooze_target_id] = useState<string | null>(
    null,
  );
  const [dark_mode_overrides, set_dark_mode_overrides] = useState<
    Map<string, boolean>
  >(new Map());
  const [details_message, set_details_message] =
    useState<DecryptedThreadMessage | null>(null);

  useEffect(() => {
    const handle_back = (e: Event) => {
      if (details_message) {
        e.preventDefault();
        set_details_message(null);
      } else if (show_block_confirm) {
        e.preventDefault();
        set_show_block_confirm(false);
        set_blocking_sender(false);
        set_block_target(null);
      } else if (show_snooze_sheet) {
        e.preventDefault();
        set_show_snooze_sheet(false);
        set_snooze_target_id(null);
      } else if (view_source_message) {
        e.preventDefault();
        set_view_source_message(null);
      } else if (menu_message) {
        e.preventDefault();
        set_menu_message(null);
      } else if (show_toolbar_customizer) {
        e.preventDefault();
        set_show_toolbar_customizer(false);
      }
    };

    window.addEventListener("capacitor:backbutton", handle_back);

    return () =>
      window.removeEventListener("capacitor:backbutton", handle_back);
  }, [
    menu_message,
    view_source_message,
    show_toolbar_customizer,
    show_block_confirm,
    show_snooze_sheet,
    details_message,
  ]);

  const auto_read_ids = useRef<Set<string>>(new Set());
  const first_unread_ref = useRef<HTMLDivElement>(null);
  const has_scrolled = useRef(false);
  const touch_start_ref = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );
  const swipe_locked_ref = useRef(false);
  const scroll_ref = useRef<HTMLDivElement>(null);

  const messages = detail.thread_messages;

  const display_messages: DecryptedThreadMessage[] = useMemo(() => {
    if (messages.length > 0) return messages;
    if (!detail.email) return [];

    return [
      {
        id: detail.email.id,
        item_type: (detail.mail_item?.item_type || "received") as
          | "received"
          | "sent"
          | "draft",
        sender_name: detail.email.sender,
        sender_email: detail.email.sender_email,
        display_sender_name: detail.email.display_sender_name,
        display_sender_email: detail.email.display_sender_email,
        forwarding_service: detail.email.forwarding_service,
        subject: detail.email.subject,
        body: detail.email.body || "",
        html_content: detail.email.html_content,
        timestamp: detail.email.timestamp,
        is_read: detail.email.is_read,
        is_starred: detail.email.is_starred,
        is_deleted: false,
        is_external: false,
        attachments: (detail.email.attachments ?? []).map(
          (att: { name: string; size: string }, i: number) => ({
            id: `att-${i}`,
            filename: att.name,
            content_type: "",
            size: parseInt(att.size, 10) || 0,
          }),
        ),
      },
    ];
  }, [messages, detail.email, detail.mail_item]);

  const message_ids_key = useMemo(
    () => display_messages.map((m) => m.id).join(","),
    [display_messages],
  );

  useEffect(() => {
    if (display_messages.length === 0) return;

    const new_expanded = new Set<string>();

    if (display_messages.length === 1) {
      new_expanded.add(display_messages[0].id);
    } else {
      new_expanded.add(display_messages[display_messages.length - 1].id);
      display_messages
        .filter((m) => !m.is_read)
        .slice(-5)
        .forEach((m) => new_expanded.add(m.id));
    }
    set_expanded_ids(new_expanded);

    const new_read = new Set<string>();

    display_messages.forEach((m) => {
      if (m.is_read) new_read.add(m.id);
    });
    set_read_ids(new_read);

    auto_read_ids.current = new Set();
  }, [message_ids_key]);

  const mark_message_read = useCallback(
    (msg: DecryptedThreadMessage) => {
      if (read_ids.has(msg.id)) return;

      set_read_ids((prev) => {
        const next = new Set(prev);

        next.add(msg.id);

        return next;
      });

      update_item_metadata(
        msg.id,
        {
          encrypted_metadata: msg.encrypted_metadata,
          metadata_nonce: msg.metadata_nonce,
        },
        { is_read: true },
      ).then((result) => {
        if (!result.success) {
          set_read_ids((prev) => {
            const next = new Set(prev);

            next.delete(msg.id);

            return next;
          });
        } else {
          emit_mail_item_updated({
            id: msg.id,
            is_read: true,
            encrypted_metadata: result.encrypted?.encrypted_metadata,
            metadata_nonce: result.encrypted?.metadata_nonce,
          });
        }
      });
    },
    [read_ids],
  );

  useEffect(() => {
    display_messages.forEach((msg) => {
      const is_unread = !msg.is_read && !read_ids.has(msg.id);

      if (
        expanded_ids.has(msg.id) &&
        is_unread &&
        !auto_read_ids.current.has(msg.id)
      ) {
        auto_read_ids.current.add(msg.id);
        mark_message_read(msg);
      }
    });
  }, [expanded_ids, message_ids_key]);

  const first_unread_id = useMemo(() => {
    const unread = display_messages.find(
      (m) => !m.is_read && !read_ids.has(m.id),
    );

    return unread?.id ?? null;
  }, [display_messages, read_ids]);

  useEffect(() => {
    if (has_scrolled.current) return;
    if (!first_unread_ref.current) return;
    has_scrolled.current = true;
    requestAnimationFrame(() => {
      first_unread_ref.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [first_unread_id]);

  const handle_back = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handle_toggle_expand = useCallback(
    (msg: DecryptedThreadMessage) => {
      const is_expanding = !expanded_ids.has(msg.id);

      set_expanded_ids((prev) => {
        const next = new Set(prev);

        if (next.has(msg.id)) {
          next.delete(msg.id);
        } else {
          next.add(msg.id);
        }

        return next;
      });

      if (is_expanding && !read_ids.has(msg.id)) {
        auto_read_ids.current.add(msg.id);
        mark_message_read(msg);
      }
    },
    [expanded_ids, read_ids, mark_message_read],
  );

  const handle_toggle_star = useCallback(async () => {
    if (detail.email) {
      haptic_impact("light");
      const current = is_starred ?? detail.email.is_starred;

      set_is_starred(!current);
      try {
        await email_actions.toggle_star(detail.email as never);
      } catch {
        set_is_starred(current);
      }
    }
  }, [detail.email, email_actions, is_starred]);

  const handle_toggle_pin = useCallback(async () => {
    if (detail.email) {
      haptic_impact("light");
      const current = is_pinned ?? detail.email.is_pinned ?? false;

      set_is_pinned(!current);
      set_menu_message(null);
      try {
        await email_actions.toggle_pin(detail.email as never);
      } catch {
        set_is_pinned(current);
      }
    }
  }, [detail.email, email_actions, is_pinned]);

  const action_in_flight = useRef(false);

  const advance_after_action = useCallback(() => {
    const destination = detail.get_next_email_destination();

    action_in_flight.current = false;
    if (destination === "/") {
      navigate(-1);
    } else {
      navigate(destination, { replace: true });
    }
  }, [detail, navigate]);

  const is_archived =
    detail.mail_item?.is_archived === true ||
    detail.mail_item?.metadata?.is_archived === true ||
    from_view === "archive";

  const handle_archive = useCallback(async () => {
    if (action_in_flight.current || !detail.email) return;
    action_in_flight.current = true;
    haptic_impact("light");
    const ok = is_archived
      ? await email_actions.unarchive_email(detail.email as never)
      : await email_actions.archive_email(detail.email as never);

    if (!ok) {
      action_in_flight.current = false;
      show_toast(
        is_archived
          ? t("common.something_went_wrong")
          : t("common.failed_to_archive_emails"),
        "error",
      );

      return;
    }
    remove_email_from_view_cache(detail.email.id);
    advance_after_action();
  }, [detail.email, email_actions, advance_after_action, is_archived, t]);

  const is_trashed =
    detail.mail_item?.is_trashed === true ||
    detail.mail_item?.metadata?.is_trashed === true ||
    from_view === "trash";

  const handle_delete = useCallback(async () => {
    if (action_in_flight.current || !detail.email) return;
    action_in_flight.current = true;
    haptic_impact("light");
    const ok = is_trashed
      ? await email_actions.permanently_delete(detail.email as never)
      : await email_actions.delete_email(detail.email as never);

    if (!ok) {
      action_in_flight.current = false;
      show_toast(
        is_trashed
          ? t("common.failed_to_permanently_delete")
          : t("common.failed_to_delete_emails"),
        "error",
      );

      return;
    }
    remove_email_from_view_cache(detail.email.id);
    advance_after_action();
  }, [detail.email, email_actions, advance_after_action, is_trashed, t]);

  const handle_spam = useCallback(async () => {
    if (action_in_flight.current || !detail.email) return;
    action_in_flight.current = true;
    haptic_impact("light");
    const ok = await email_actions.mark_as_spam(detail.email as never);

    if (!ok) {
      action_in_flight.current = false;
      show_toast(t("common.something_went_wrong"), "error");

      return;
    }
    remove_email_from_view_cache(detail.email.id);
    navigate(-1);
  }, [detail.email, email_actions, navigate, t]);

  const handle_not_spam = useCallback(async () => {
    if (action_in_flight.current || !detail.email) return;
    const target = detail.email;

    action_in_flight.current = true;
    haptic_impact("light");
    const ok = await email_actions.unmark_spam(target as never);

    if (!ok) {
      action_in_flight.current = false;
      show_toast(t("common.something_went_wrong"), "error");

      return;
    }
    remove_email_from_view_cache(target.id);
    navigate(-1);
    show_action_toast({
      message: t("common.marked_as_not_spam"),
      action_type: "not_spam",
      email_ids: [target.id],
      on_undo: async () => {
        await email_actions.mark_as_spam(target as never);
        emit_mail_item_updated({ id: target.id, is_spam: true });
      },
    });
  }, [detail.email, email_actions, navigate, t]);

  const handle_print = useCallback(() => {
    if (menu_message) {
      detail.handle_per_message_print(menu_message);
    }
    set_menu_message(null);
  }, [detail, menu_message]);

  const dispatch_compose = useCallback(
    (msg: DecryptedThreadMessage, mode: "reply" | "reply_all" | "forward") => {
      const subject = msg.subject || "";
      const body = msg.body || "";
      const quoted = `\n\n${t("mail.reply_quote_header", { date: new Date(msg.timestamp).toLocaleString(), name: msg.display_sender_name || msg.sender_name })}\n${body
        .split("\n")
        .map((l) => "> " + l)
        .join("\n")}`;
      const message_with_footer =
        get_aster_footer(t, preferences.show_aster_branding) + quoted;
      const thread_token = detail.mail_item?.thread_token;

      if (mode === "forward") {
        window.dispatchEvent(
          new CustomEvent("aster:mobile-compose", {
            detail: {
              to_recipients: [],
              cc_recipients: [],
              bcc_recipients: [],
              subject: subject.startsWith(t("mail.forward_subject_prefix"))
                ? subject
                : `${t("mail.forward_subject_prefix")} ${subject}`,
              message: message_with_footer,
              draft_type: "forward",
              forward_from_id: msg.id,
              thread_token,
            },
          }),
        );
      } else {
        const { recipient_email } = build_reply_recipient_for_message(
          msg,
          detail.current_user_email ? [detail.current_user_email] : undefined,
        );
        const to = [recipient_email];
        const cc: string[] = [];

        if (mode === "reply_all") {
          const my_email = detail.current_user_email?.toLowerCase();
          const seen = new Set(
            [recipient_email, msg.sender_email]
              .filter(Boolean)
              .map((value) => value.toLowerCase()),
          );

          const collect = (
            entries: { email: string }[] | undefined,
            target: string[],
          ) => {
            entries?.forEach((r) => {
              const normalized = r.email?.toLowerCase();

              if (
                !normalized ||
                normalized === my_email ||
                seen.has(normalized)
              ) {
                return;
              }

              seen.add(normalized);
              target.push(r.email);
            });
          };

          collect(msg.to_recipients, to);
          collect(msg.cc_recipients, cc);
        }
        window.dispatchEvent(
          new CustomEvent("aster:mobile-compose", {
            detail: {
              to_recipients: to,
              cc_recipients: cc,
              bcc_recipients: [],
              subject: build_reply_subject(
                subject,
                t("mail.reply_subject_prefix"),
              ),
              message: message_with_footer,
              draft_type: "reply",
              reply_to_id: msg.id,
              thread_token,
            },
          }),
        );
      }
    },
    [t, detail.current_user_email, detail.mail_item?.thread_token],
  );

  const is_dark_mode_message = useCallback(
    (msg_id: string) =>
      dark_mode_overrides.get(msg_id) ?? preferences.force_dark_mode_emails,
    [dark_mode_overrides, preferences.force_dark_mode_emails],
  );

  const is_dark_mode_opted_out = useCallback(
    (msg_id: string) => dark_mode_overrides.get(msg_id) === false,
    [dark_mode_overrides],
  );

  const handle_toggle_dark_mode = useCallback(() => {
    if (menu_message) {
      const next_value = !is_dark_mode_message(menu_message.id);

      set_dark_mode_overrides((prev) => {
        const next = new Map(prev);

        next.set(menu_message.id, next_value);

        return next;
      });
    }
    set_menu_message(null);
  }, [menu_message, is_dark_mode_message]);

  const handle_toggle_all_dark_mode = useCallback(() => {
    const all_active =
      display_messages.length > 0 &&
      display_messages.every((m) => is_dark_mode_message(m.id));

    set_dark_mode_overrides(
      new Map(display_messages.map((m) => [m.id, !all_active])),
    );
    set_menu_message(null);
  }, [display_messages, is_dark_mode_message]);

  const handle_view_source = useCallback(() => {
    if (menu_message) {
      set_view_source_message(menu_message);
    }
    set_menu_message(null);
  }, [menu_message]);

  const handle_report_phishing = useCallback(() => {
    if (menu_message) {
      const target = menu_message;

      request_spam(() => detail.handle_per_message_report_phishing(target));
    }
    set_menu_message(null);
  }, [detail, menu_message, request_spam]);

  const handle_menu_archive = useCallback(() => {
    haptic_impact("light");
    if (menu_message) {
      detail.handle_per_message_archive(menu_message);
    }
    set_menu_message(null);
  }, [detail, menu_message]);

  const handle_menu_trash = useCallback(() => {
    haptic_impact("light");
    if (menu_message) {
      detail.handle_per_message_trash(menu_message);
    }
    set_menu_message(null);
  }, [detail, menu_message]);

  const handle_menu_reply = useCallback(() => {
    if (menu_message) {
      dispatch_compose(menu_message, "reply");
    }
    set_menu_message(null);
  }, [menu_message, dispatch_compose]);

  const handle_menu_reply_all = useCallback(() => {
    if (menu_message) {
      dispatch_compose(menu_message, "reply_all");
    }
    set_menu_message(null);
  }, [menu_message, dispatch_compose]);

  const handle_menu_forward = useCallback(() => {
    if (menu_message) {
      dispatch_compose(menu_message, "forward");
    }
    set_menu_message(null);
  }, [menu_message, dispatch_compose]);

  const handle_copy_message_id = useCallback(() => {
    if (menu_message) {
      navigator.clipboard
        .writeText(menu_message.id)
        .then(() => {
          show_toast(detail.t("common.message_id_copied"), "success");
        })
        .catch((caught) =>
          ignore_error(
            "pages/mobile/use_mobile_mail_detail:handle_back",
            caught,
          ),
        );
    }
    set_menu_message(null);
  }, [detail, menu_message]);

  const handle_block_sender = useCallback(async () => {
    if (!block_target) return;
    set_blocking_sender(true);
    haptic_impact("medium");
    const result = await block_sender(block_target.email, block_target.name);

    set_blocking_sender(false);
    set_show_block_confirm(false);
    set_block_target(null);
    if (result.data) {
      show_toast(t("common.sender_blocked"), "success");
    } else {
      show_toast(result.error || t("errors.failed_to_block_sender"), "error");
    }
  }, [block_target]);

  const handle_snooze = useCallback(
    async (snoozed_until: Date) => {
      if (!snooze_target_id) return;
      const target = snooze_target_id;

      set_show_snooze_sheet(false);
      set_snooze_target_id(null);
      try {
        await snooze_actions.snooze(target, snoozed_until);
        show_toast(t("common.email_snoozed"), "success");
        navigate(-1);
      } catch {
        show_toast(t("errors.failed_to_snooze"), "error");
      }
    },
    [snooze_target_id, snooze_actions, navigate],
  );

  const handle_load_external_content = useCallback(() => {
    set_external_content_loaded(true);
    set_external_content_report(null);
  }, []);

  const handle_touch_start = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      touch_start_ref.current = null;

      return;
    }
    swipe_locked_ref.current = false;
    touch_start_ref.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  }, []);

  const handle_touch_move = useCallback((e: React.TouchEvent) => {
    if (!touch_start_ref.current || swipe_locked_ref.current) return;
    const touch = e.touches[0];
    const abs_dx = Math.abs(touch.clientX - touch_start_ref.current.x);
    const abs_dy = Math.abs(touch.clientY - touch_start_ref.current.y);

    if (abs_dy > 10 && abs_dy > abs_dx * 0.5) {
      swipe_locked_ref.current = true;
    }
  }, []);

  const handle_touch_end = useCallback(
    (e: React.TouchEvent) => {
      if (!touch_start_ref.current || swipe_locked_ref.current) {
        touch_start_ref.current = null;

        return;
      }
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touch_start_ref.current.x;
      const abs_dx = Math.abs(dx);
      const abs_dy = Math.abs(touch.clientY - touch_start_ref.current.y);
      const elapsed = Date.now() - touch_start_ref.current.time;

      touch_start_ref.current = null;

      const valid_flick = abs_dx >= 80 && abs_dx > abs_dy * 2 && elapsed < 350;
      const can_go =
        (dx > 0 && detail.can_go_newer) || (dx < 0 && detail.can_go_older);

      if (valid_flick && can_go && scroll_ref.current) {
        swipe_nav_state.direction = dx > 0 ? "right" : "left";
        const dir = dx > 0 ? 1 : -1;

        scroll_ref.current.style.transition =
          "transform 0.15s ease-out, opacity 0.12s ease-out";
        scroll_ref.current.style.transform = `translateX(${dir * window.innerWidth * 0.4}px)`;
        scroll_ref.current.style.opacity = "0";
        haptic_impact("light");
        setTimeout(() => {
          if (dx > 0) detail.handle_go_newer();
          else detail.handle_go_older();
        }, 120);
      }
    },
    [
      detail.can_go_newer,
      detail.can_go_older,
      detail.handle_go_newer,
      detail.handle_go_older,
    ],
  );

  useEffect(() => {
    if (detail.is_loading || !detail.email) return;
    const user_email = detail.current_user_email;
    const grouping = detail.preferences.conversation_grouping !== false;

    if (detail.can_go_newer && !detail.preferences.low_network_mode) {
      preload_email_detail(
        detail.email_list[detail.current_email_index - 1],
        user_email,
        false,
        grouping,
      );
    }
    if (detail.can_go_older && !detail.preferences.low_network_mode) {
      preload_email_detail(
        detail.email_list[detail.current_email_index + 1],
        user_email,
        false,
        grouping,
      );
    }
  }, [
    detail.is_loading,
    detail.email,
    detail.can_go_newer,
    detail.can_go_older,
    detail.email_list,
    detail.current_email_index,
    detail.current_user_email,
    detail.preferences.conversation_grouping,
    detail.preferences.low_network_mode,
  ]);

  const get_last_message = useCallback(() => {
    if (!detail.email) return null;

    return (
      messages[messages.length - 1] ?? {
        id: detail.email.id,
        item_type: "received" as const,
        sender_name: detail.email.sender,
        sender_email: detail.email.sender_email,
        display_sender_name: detail.email.display_sender_name,
        display_sender_email: detail.email.display_sender_email,
        forwarding_service: detail.email.forwarding_service,
        subject: detail.email.subject,
        body: detail.email.body,
        timestamp: detail.email.timestamp,
        is_read: detail.email.is_read,
        is_starred: detail.email.is_starred,
        is_deleted: false,
        is_external: false,
      }
    );
  }, [detail, messages]);

  return {
    detail,
    format_email_detail,
    reduce_motion,
    t,
    preferences,
    update_preference,
    request_spam,
    spam_confirm_dialog,
    is_starred,
    is_pinned,
    expanded_ids,
    menu_message,
    set_menu_message,
    menu_source,
    set_menu_source,
    view_source_message,
    set_view_source_message,
    external_content_report,
    set_external_content_report,
    external_content_loaded,
    lockdown_active,
    show_toolbar_customizer,
    set_show_toolbar_customizer,
    subject_expanded,
    set_subject_expanded,
    show_block_confirm,
    set_show_block_confirm,
    blocking_sender,
    block_target,
    set_block_target,
    show_snooze_sheet,
    set_show_snooze_sheet,
    set_snooze_target_id,
    details_message,
    set_details_message,
    first_unread_ref,
    scroll_ref,
    display_messages,
    first_unread_id,
    handle_back,
    handle_toggle_expand,
    handle_toggle_star,
    handle_toggle_pin,
    is_archived,
    handle_archive,
    handle_delete,
    handle_spam,
    handle_not_spam,
    handle_print,
    dispatch_compose,
    is_dark_mode_message,
    is_dark_mode_opted_out,
    handle_toggle_dark_mode,
    handle_toggle_all_dark_mode,
    handle_view_source,
    handle_report_phishing,
    handle_menu_archive,
    handle_menu_trash,
    handle_menu_reply,
    handle_menu_reply_all,
    handle_menu_forward,
    handle_copy_message_id,
    handle_block_sender,
    handle_snooze,
    handle_load_external_content,
    handle_touch_start,
    handle_touch_move,
    handle_touch_end,
    get_last_message,
  };
}
