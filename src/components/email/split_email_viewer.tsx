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

import { useState, useEffect, useCallback, useRef } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { get_cached_iframe_height } from "@/components/email/sandboxed_email_renderer";
import { Skeleton } from "@/components/ui/skeleton";
import { use_preferences } from "@/contexts/preferences_context";
import { ExternalContentBanner } from "@/components/email/external_content_banner";
import {
  use_email_viewer,
  type ReplyData,
  type ForwardData,
} from "@/components/email/use_email_viewer";
import {
  ViewerToolbarActions,
  ViewerEmailHeader,
  ViewerUnsubscribeBanner,
  ViewerThreadContent,
  ViewerErrorState,
  get_external_content_mode,
  set_external_content_mode,
} from "@/components/email/viewer_shared";
import { set_forward_mail_id } from "@/services/forward_store";

export type SplitReplyData = ReplyData;
export type SplitForwardData = ForwardData;

interface SplitEmailViewerProps {
  email_id: string;
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
}

export function SplitEmailViewer({
  email_id,
  on_close,
  snoozed_until,
  on_reply,
  on_forward,
  on_navigate_prev,
  on_navigate_next,
  can_go_prev = false,
  can_go_next = false,
  current_index,
  total_count,
  grouped_email_ids,
}: SplitEmailViewerProps): React.ReactElement {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const viewer = use_email_viewer({
    email_id,
    on_dismiss: on_close,
    on_reply,
    on_forward,
    use_refresh_listener: true,
    grouped_email_ids,
  });

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

  if (prev_email_id_ref.current !== email_id) {
    prev_email_id_ref.current = email_id;
    const cached = get_external_content_mode(email_id);

    set_external_content_state({ mode: cached || "blocked", report: null });
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

  const handle_load_external_content = useCallback(() => {
    set_external_content_state({ mode: "loaded", report: null });
    set_external_content_mode(email_id);
  }, [email_id]);

  const handle_dismiss_external_content = useCallback(() => {
    set_external_content_state((prev) => ({ ...prev, mode: "dismissed" }));
  }, []);

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
            button_px={28}
            button_size="h-7 w-7"
            can_go_next={can_go_next}
            can_go_prev={can_go_prev}
            current_index={current_index}
            dropdown_align="start"
            email={email}
            hide_class="hidden @lg:flex"
            icon_size="w-3.5 h-3.5"
            is_archive_loading={viewer.is_archive_loading}
            is_pin_loading={viewer.is_pin_loading}
            is_pinned={viewer.is_pinned}
            is_read={viewer.is_read}
            is_spam={viewer.mail_item?.is_spam === true}
            is_spam_loading={viewer.is_spam_loading}
            is_trash_loading={viewer.is_trash_loading}
            mail_item={viewer.mail_item}
            on_archive={viewer.handle_archive}
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
          <div className="px-1 py-2 @md:px-2 @md:py-3">
            <ViewerEmailHeader
              avatar_class="w-8 h-8 @lg:w-10 @lg:h-10"
              avatar_size="md"
              copy_to_clipboard={viewer.copy_to_clipboard}
              email={email}
              email_button_hide_class="hidden @xl:inline"
              encryption_size={18}
              flex_wrap_class="flex-wrap @xl:flex-nowrap"
              format_email_detail={viewer.format_email_detail}
              gap_class="gap-2 @lg:gap-3"
              has_pq_protection={viewer.has_pq_protection}
              has_recipient_key={viewer.has_recipient_key}
              is_external={viewer.is_external}
              mail_item={viewer.mail_item}
              popover_content_class="max-w-80 w-[calc(100vw-2rem)] p-3 text-xs space-y-2"
              snoozed_until={snoozed_until}
              subject_class="text-base @md:text-lg @2xl:text-xl font-semibold break-words min-w-0 flex-1 text-left"
              thread_messages={viewer.thread_messages}
            />

            <ViewerUnsubscribeBanner email={email} />

            {external_content_state.mode === "blocked" &&
              external_content_state.report &&
              external_content_state.report.blocked_count > 0 && (
                <ExternalContentBanner
                  blocked_content={external_content_state.report}
                  on_dismiss={handle_dismiss_external_content}
                  on_load={handle_load_external_content}
                />
              )}

            <ViewerThreadContent
              current_user_email={viewer.current_user_email}
              email={email}
              external_content_mode={external_content_mode}
              on_archive={viewer.handle_per_message_archive}
              on_external_content_detected={handle_external_content_detected}
              on_forward={viewer.handle_per_message_forward}
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
              on_view_source={viewer.handle_per_message_view_source}
              size_bytes={viewer.mail_item?.metadata?.size_bytes}
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
