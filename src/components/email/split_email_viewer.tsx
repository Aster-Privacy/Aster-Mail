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
import type { ExternalContentReport } from "@/lib/html_sanitizer";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { EncryptionInfoDropdown } from "@/components/common/encryption_info_dropdown";
import { TrackingProtectionShield } from "@/components/email/tracking_protection_shield";
import {
  EmailTag,
  hex_to_variant,
  type TagIconName,
} from "@/components/ui/email_tag";
import { use_tags } from "@/hooks/use_tags";
import { get_cached_iframe_height } from "@/components/email/sandboxed_email_renderer";
import { Skeleton } from "@/components/ui/skeleton";
import { use_preferences } from "@/contexts/preferences_context";
import { is_system_email } from "@/lib/utils";
import {
  use_email_viewer,
  type ReplyData,
  type ForwardData,
} from "@/components/email/use_email_viewer";
import {
  ViewerToolbarActions,
  ViewerThreadContent,
  ViewerErrorState,
  get_external_content_mode,
  set_external_content_mode,
} from "@/components/email/viewer_shared";
import { set_forward_mail_id } from "@/services/forward_store";
import { get_label_hints } from "@/stores/label_hints_store";
import { execute_unsubscribe } from "@/utils/unsubscribe_detector";
import { show_action_toast } from "@/components/toast/action_toast";
import {
  persist_unsubscribe,
  use_unsubscribed_senders,
} from "@/hooks/use_unsubscribed_senders";

export type SplitReplyData = ReplyData;
export type SplitForwardData = ForwardData;

import type { LocalEmailData } from "@/components/email/email_viewer_types";

interface SplitEmailViewerProps {
  email_id: string;
  local_email?: LocalEmailData;
  on_close: () => void;
  snoozed_until?: string;
  on_reply?: (data: SplitReplyData) => void;
  on_forward?: (data: SplitForwardData) => void;
  on_navigate_prev?: () => void;
  on_navigate_next?: () => void;
  can_go_prev?: boolean;
  can_go_next?: boolean;
  current_index?: number;
  total_count?: number;
  grouped_email_ids?: string[];
  folders?: { id: string; name: string; color: string }[];
  on_folder_toggle?: (folder_id: string) => void;
  label_hints?: { token: string; name: string; color?: string; icon?: string; show_icon?: boolean }[];
}

export function SplitEmailViewer({
  email_id,
  local_email,
  on_close,
  snoozed_until: _snoozed_until,
  on_reply,
  on_forward,
  on_navigate_prev,
  on_navigate_next,
  can_go_prev = false,
  can_go_next = false,
  current_index,
  total_count,
  grouped_email_ids,
  folders,
  on_folder_toggle,
  label_hints,
}: SplitEmailViewerProps): React.ReactElement {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const { is_unsubscribed, mark_unsubscribed } = use_unsubscribed_senders();
  const { get_tag_by_token } = use_tags();
  const viewer = use_email_viewer({
    email_id,
    local_email,
    on_dismiss: on_close,
    on_reply,
    on_forward,
    use_refresh_listener: !local_email,
    grouped_email_ids,
  });

  const label_chips = useMemo(() => {
    const seen = new Set<string>();
    const from_item: { token: string; name: string; color?: string; icon?: string; show_icon: boolean }[] = [];
    for (const f of viewer.mail_item?.labels ?? []) {
      if (f.name && !seen.has(f.token)) {
        seen.add(f.token);
        from_item.push({ token: f.token, name: f.name, color: f.color as string | undefined, icon: f.icon, show_icon: true });
      }
    }
    for (const f of viewer.mail_item?.folders ?? []) {
      if (f.name && !seen.has(f.token)) {
        seen.add(f.token);
        from_item.push({ token: f.token, name: f.name, color: (f.color as string | undefined) || "#3b82f6", icon: f.icon || "folder", show_icon: true });
      }
    }
    for (const token of viewer.mail_item?.tag_tokens ?? []) {
      const tag = get_tag_by_token(token);
      if (tag?.name && !seen.has(token)) {
        seen.add(token);
        from_item.push({ token, name: tag.name, color: tag.color, icon: tag.icon, show_icon: true });
      }
    }
    const store_hints = get_label_hints(email_id);
    const resolved = from_item.length > 0 ? from_item : (label_hints?.length ? label_hints : store_hints);
    if (viewer.email && is_system_email(viewer.email.sender_email)) {
      return [{ token: "__system__", name: t("common.system"), color: "#3b82f6", icon: "info", show_icon: true }, ...resolved];
    }
    return resolved;
  }, [viewer.mail_item?.labels, viewer.mail_item?.folders, viewer.mail_item?.tag_tokens, label_hints, get_tag_by_token, viewer.email, email_id, t]);

  const [content_ready, set_content_ready] = useState(
    () => !!get_cached_iframe_height(email_id),
  );

  useEffect(() => {
    const already_cached = !!get_cached_iframe_height(email_id);

    set_content_ready(already_cached);
    if (already_cached) return;

    const handler = () => {
      set_content_ready(true);
    };

    window.addEventListener("astermail:iframe-ready", handler);

    return () => window.removeEventListener("astermail:iframe-ready", handler);
  }, [email_id]);

  const prev_email_id_ref = useRef(email_id);
  const [external_content_state, set_external_content_state] = useState<{
    mode: "blocked" | "loaded" | "dismissed";
    report: ExternalContentReport | null;
  }>(() => {
    const cached = get_external_content_mode(email_id);

    return { mode: cached || "blocked", report: null };
  });
  const [loaded_content_types, set_loaded_content_types] = useState<Set<string>>(new Set());

  if (prev_email_id_ref.current !== email_id) {
    prev_email_id_ref.current = email_id;
    const cached = get_external_content_mode(email_id);

    set_external_content_state({ mode: cached || "blocked", report: null });
    set_loaded_content_types(new Set());
  }

  const handle_external_content_detected = useCallback(
    (report: ExternalContentReport) => {
      if (report.blocked_count > 0) {
        set_external_content_state((prev) => {
          if (prev.mode === "loaded") return prev;
          const merged_report: ExternalContentReport = prev.report
            ? {
                has_remote_images:
                  prev.report.has_remote_images || report.has_remote_images,
                has_remote_fonts:
                  prev.report.has_remote_fonts || report.has_remote_fonts,
                has_remote_css:
                  prev.report.has_remote_css || report.has_remote_css,
                has_tracking_pixels:
                  prev.report.has_tracking_pixels || report.has_tracking_pixels,
                blocked_count: prev.report.blocked_count + report.blocked_count,
                blocked_items: [
                  ...(prev.report.blocked_items || []),
                  ...(report.blocked_items || []),
                ],
                cleaned_links: [
                  ...(prev.report.cleaned_links || []),
                  ...(report.cleaned_links || []),
                ],
              }
            : report;

          return { mode: "blocked", report: merged_report };
        });
      }
    },
    [],
  );

  const handle_load_external_content = useCallback((types?: string[]) => {
    if (!types) {
      set_external_content_state((prev) => ({ mode: "loaded", report: prev.report }));
      set_external_content_mode(email_id);
      set_loaded_content_types(new Set());
      return;
    }
    set_loaded_content_types((prev) => {
      const next = new Set(prev);
      for (const t of types) next.add(t);
      return next;
    });
  }, [email_id]);

  const handle_unsubscribe = useCallback(async (): Promise<"success" | "manual"> => {
    const email = viewer.email;
    if (!email?.unsubscribe_info?.has_unsubscribe) return "success";
    if (is_system_email(email.sender_email)) return "success";

    const info = email.unsubscribe_info;

    try {
      const result = await execute_unsubscribe(info);
      if (result === "api") {
        show_action_toast({
          message: t("mail.successfully_unsubscribed"),
          action_type: "not_spam",
          email_ids: [],
        });
        mark_unsubscribed(email.sender_email);
        persist_unsubscribe(email.sender_email, email.sender || "", {
          unsubscribe_link: info.unsubscribe_link,
          list_unsubscribe_header: info.list_unsubscribe_header,
        }, "auto");
        return "success";
      }
      show_action_toast({
        message: t("mail.unsubscribe_manual_required"),
        action_type: "not_spam",
        email_ids: [],
      });
      persist_unsubscribe(email.sender_email, email.sender || "", {
        unsubscribe_link: info.unsubscribe_link,
        list_unsubscribe_header: info.list_unsubscribe_header,
      }, "manual");
      return "manual";
    } catch {
      show_action_toast({
        message: t("mail.unsubscribe_failed"),
        action_type: "not_spam",
        email_ids: [],
      });
      return "manual";
    }
  }, [viewer.email, t, mark_unsubscribed]);

  const external_content_mode =
    external_content_state.mode === "loaded" ? "always" : undefined;

  useEffect(() => {
    if (viewer.email?.thread_token) {
      const cached = get_external_content_mode(email_id);

      if (cached === "loaded") {
        set_external_content_state((prev) =>
          prev.mode === "loaded" ? prev : { mode: "loaded", report: null },
        );
      }
    }
  }, [email_id, viewer.email?.thread_token]);

  useEffect(() => {
    const handle_keyboard_forward = () => {
      if (!on_forward || !viewer.email) return;
      const last_msg =
        viewer.thread_messages.length > 0
          ? viewer.thread_messages[viewer.thread_messages.length - 1]
          : null;

      if (last_msg) {
        set_forward_mail_id(last_msg.id);
        on_forward({
          sender_name: last_msg.sender_name,
          sender_email: last_msg.sender_email,
          sender_avatar: "",
          email_subject: last_msg.subject,
          email_body: last_msg.body,
          email_timestamp: new Date(last_msg.timestamp).toLocaleString(),
          original_mail_id: last_msg.id,
        });
      }
    };

    window.addEventListener(
      "astermail:keyboard-forward",
      handle_keyboard_forward,
    );

    return () => {
      window.removeEventListener(
        "astermail:keyboard-forward",
        handle_keyboard_forward,
      );
    };
  }, [
    viewer.thread_messages,
    viewer.email,
    on_reply,
    on_forward,
    preferences.default_reply_behavior,
  ]);

  if (viewer.error || (!viewer.email && !viewer.is_loading)) {
    return (
      <div className="flex flex-col h-full bg-surf-primary">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge-primary">
          <span className="text-sm font-medium text-txt-primary">
            {t("common.error_label")}
          </span>
          <button
            className="p-1.5 rounded-md transition-colors text-txt-muted"
            onClick={on_close}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <ViewerErrorState error={viewer.error} on_dismiss={on_close} />
      </div>
    );
  }

  const email = viewer.email!;

  const show_content_skeleton =
    ((!viewer.was_preloaded && !content_ready) ||
      viewer.is_loading ||
      !viewer.email) &&
    !viewer.error;

  return (
    <div className="flex flex-col h-full bg-surf-primary">
      <div className="flex items-center gap-1 px-2 @md:px-3 py-2 border-b border-edge-primary flex-shrink-0">
        {email ? (
          <ViewerToolbarActions
            button_px={32}
            button_size="h-8 w-8"
            can_go_next={can_go_next}
            can_go_prev={can_go_prev}
            current_index={current_index}
            dropdown_align="start"
            email={email}
            hide_class="hidden @lg:flex"
            icon_size="w-4 h-4"
            is_archive_loading={viewer.is_archive_loading}
            is_pin_loading={viewer.is_pin_loading}
            is_pinned={viewer.is_pinned}
            is_read={viewer.is_read}
            is_spam={viewer.mail_item?.is_spam === true}
            is_spam_loading={viewer.is_spam_loading}
            is_trash_loading={viewer.is_trash_loading}
            mail_item={viewer.mail_item}
            on_archive={viewer.handle_archive}
            folders={folders}
            on_folder_toggle={on_folder_toggle}
            on_navigate_next={on_navigate_next}
            on_navigate_prev={on_navigate_prev}
            on_not_spam={viewer.handle_not_spam}
            on_pin_toggle={viewer.handle_pin_toggle}
            on_print={viewer.handle_print}
            on_read_toggle={viewer.handle_read_toggle}
            on_spam={viewer.handle_spam}
            on_trash={viewer.handle_trash}
            on_unsubscribe={viewer.handle_unsubscribe}
            thread_expand_state={viewer.thread_expand_state}
            thread_list_ref={viewer.thread_list_ref}
            thread_messages={viewer.thread_messages}
            total_count={total_count}
          />
        ) : (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Skeleton className="w-7 h-7 rounded-md" />
            <Skeleton className="w-7 h-7 rounded-md" />
            <Skeleton className="w-7 h-7 rounded-md" />
          </div>
        )}

        <div className="flex-1" />

        <button
          className="p-1.5 rounded-md transition-colors hover:bg-surf-hover flex-shrink-0 text-txt-muted"
          onClick={on_close}
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto relative"
        style={{ scrollbarGutter: "stable" }}
      >
        {show_content_skeleton && (
          <div className="absolute inset-0 z-10 bg-surf-primary p-4">
            <Skeleton className="h-6 mb-4 w-full max-w-[60%]" />
            <div className="flex items-start gap-3 mb-4">
              <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-full max-w-[100px]" />
                <Skeleton className="h-3 w-full max-w-[80px]" />
              </div>
            </div>
            <div className="space-y-3 pt-3">
              <Skeleton className="w-full h-4" />
              <Skeleton className="w-full h-4" />
              <Skeleton className="h-4 w-[75%]" />
              <Skeleton className="w-full h-4" />
              <Skeleton className="h-4 w-[50%]" />
            </div>
          </div>
        )}
        {email && (
          <div className="py-2 @md:py-3">
            <div className="px-3 @md:px-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 mb-3">
              <h1 className="text-base @md:text-lg @2xl:text-xl font-semibold text-txt-primary break-words">
                <span className="inline-flex items-center gap-1 mr-1.5" style={{ verticalAlign: "-0.15em" }}>
                  <EncryptionInfoDropdown
                    has_pq_protection={viewer.has_pq_protection}
                    has_recipient_key={viewer.has_recipient_key}
                    is_external={viewer.is_external}
                    sender_verification={email.sender_verification}
                    size={18}
                  />
                  {external_content_state.report && (
                    <TrackingProtectionShield
                      report={external_content_state.report}
                      size={18}
                    />
                  )}
                </span>
                {email.subject}
              </h1>
              {label_chips.map((chip) => (
                <EmailTag
                  key={chip.token}
                  className="flex-shrink-0"
                  custom_color={chip.color}
                  icon={(chip.icon as TagIconName) || "folder"}
                  label={chip.name}
                  show_icon={chip.show_icon}
                  variant={chip.color ? hex_to_variant(chip.color) : "neutral"}
                />
              ))}
            </div>

            <ViewerThreadContent
              current_user_email={viewer.current_user_email}
              email={email}
              external_content_mode={external_content_mode}
              loaded_content_types={loaded_content_types}
              on_archive={viewer.handle_per_message_archive}
              on_external_content_detected={handle_external_content_detected}
              on_forward={viewer.handle_per_message_forward}
              on_load_external_content={handle_load_external_content}
              on_not_spam={
                viewer.mail_item?.is_spam
                  ? viewer.handle_per_message_not_spam
                  : undefined
              }
              on_print={viewer.handle_per_message_print}
              on_reply={viewer.handle_per_message_reply}
              on_reply_all={viewer.handle_per_message_reply_all}
              on_report_phishing={viewer.handle_per_message_report_phishing}
              on_toggle_message_read={viewer.handle_toggle_message_read}
              on_trash={viewer.handle_per_message_trash}
              on_draft_saved={viewer.handle_draft_saved}
              on_edit_thread_draft={viewer.handle_edit_thread_draft}
              on_thread_draft_deleted={viewer.handle_thread_draft_deleted}
              on_unsubscribe={
                email.unsubscribe_info?.has_unsubscribe && !is_system_email(email.sender_email) && !is_unsubscribed(email.sender_email)
                  ? handle_unsubscribe
                  : undefined
              }
              on_manual_unsubscribed={() => {
                if (email) mark_unsubscribed(email.sender_email);
              }}
              unsubscribe_url={email.unsubscribe_info?.unsubscribe_link}
              on_view_source={viewer.handle_per_message_view_source}
              size_bytes={viewer.mail_item?.metadata?.size_bytes}
              thread_draft={viewer.thread_draft}
              thread_list_ref={viewer.thread_list_ref}
              thread_messages={viewer.thread_messages}
              thread_sanitized={viewer.thread_sanitized}
            />
          </div>
        )}
      </div>
    </div>
  );
}
