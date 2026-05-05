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
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

import { EncryptionInfoDropdown } from "@/components/common/encryption_info_dropdown";
import { TrackingProtectionShield } from "@/components/email/tracking_protection_shield";
import { get_cached_iframe_height } from "@/components/email/sandboxed_email_renderer";
import { Skeleton } from "@/components/ui/skeleton";
import { use_i18n } from "@/lib/i18n/context";
import { type DraftWithContent } from "@/services/api/multi_drafts";
import { is_system_email } from "@/lib/utils";
import {
  EmailTag,
  hex_to_variant,
  type TagIconName,
} from "@/components/ui/email_tag";
import { use_tags } from "@/hooks/use_tags";
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
import { execute_unsubscribe } from "@/utils/unsubscribe_detector";
import { show_action_toast } from "@/components/toast/action_toast";
import {
  persist_unsubscribe,
  use_unsubscribed_senders,
} from "@/hooks/use_unsubscribed_senders";

export type FullReplyData = ReplyData;
export type FullForwardData = ForwardData;

import type { LocalEmailData } from "@/components/email/email_viewer_types";

interface FullEmailViewerProps {
  email_id: string;
  local_email?: LocalEmailData;
  on_back: () => void;
  snoozed_until?: string;
  on_reply?: (data: FullReplyData) => void;
  on_forward?: (data: FullForwardData) => void;
  on_edit_draft?: (draft: DraftWithContent) => void;
  on_navigate_prev?: () => void;
  on_navigate_next?: () => void;
  can_go_prev?: boolean;
  can_go_next?: boolean;
  current_index?: number;
  total_count?: number;
  grouped_email_ids?: string[];
  folders?: { id: string; name: string; color: string }[];
  on_folder_toggle?: (folder_id: string) => void;
}

export function FullEmailViewer({
  email_id,
  local_email,
  on_back,
  snoozed_until: _snoozed_until,
  on_reply,
  on_forward,
  on_edit_draft,
  on_navigate_prev,
  on_navigate_next,
  can_go_prev = false,
  can_go_next = false,
  current_index,
  total_count,
  grouped_email_ids,
  folders,
  on_folder_toggle,
}: FullEmailViewerProps): React.ReactElement {
  const { t } = use_i18n();
  const { is_unsubscribed, mark_unsubscribed } = use_unsubscribed_senders();
  const { get_tag_by_token } = use_tags();
  const viewer = use_email_viewer({
    email_id,
    local_email,
    on_dismiss: on_back,
    on_reply,
    on_forward,
    on_edit_draft,
    use_refresh_listener: !local_email,
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
    const cached = get_external_content_mode(email_id);

    if (cached === "loaded") {
      set_external_content_state((prev) =>
        prev.mode === "loaded" ? prev : { mode: "loaded", report: null },
      );
    }
  }, [email_id]);

  const handle_keyboard_reply = useCallback(
    () => viewer.handle_reply(),
    [viewer.handle_reply],
  );
  const handle_keyboard_forward = useCallback(
    () => viewer.handle_forward(),
    [viewer.handle_forward],
  );

  useEffect(() => {
    const handle_keyboard_back = (e: KeyboardEvent) => {
      if (e["key"] === "Escape") {
        on_back();
      }
    };

    window.addEventListener("astermail:keyboard-reply", handle_keyboard_reply);
    window.addEventListener(
      "astermail:keyboard-forward",
      handle_keyboard_forward,
    );
    window.addEventListener("keydown", handle_keyboard_back);

    return () => {
      window.removeEventListener(
        "astermail:keyboard-reply",
        handle_keyboard_reply,
      );
      window.removeEventListener(
        "astermail:keyboard-forward",
        handle_keyboard_forward,
      );
      window.removeEventListener("keydown", handle_keyboard_back);
    };
  }, [handle_keyboard_reply, handle_keyboard_forward, on_back]);

  if (viewer.error || (!viewer.email && !viewer.is_loading)) {
    return (
      <div className="flex flex-col h-full bg-surf-primary">
        <div className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-3 border-b border-edge-primary flex-shrink-0">
          <button
            className="flex items-center gap-2 px-3 py-1.5 -ml-3 rounded-lg text-sm font-medium transition-all hover:bg-surf-hover text-txt-secondary"
            onClick={on_back}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span>{t("common.back")}</span>
          </button>
        </div>
        <ViewerErrorState
          show_back_button
          error={viewer.error}
          on_dismiss={on_back}
        />
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
      <div className="flex items-center gap-1 px-2 sm:px-3 py-2 border-b border-edge-primary flex-shrink-0">
        <button
          className="flex items-center gap-1.5 px-2 py-1.5 mr-1 rounded-lg text-sm font-medium transition-all hover:bg-surf-hover text-txt-secondary"
          onClick={on_back}
        >
          <ArrowLeftIcon className="w-4 h-4" />
        </button>

        {email ? (
          <>
            <ViewerToolbarActions
              spread_layout
              can_go_next={can_go_next}
              can_go_prev={can_go_prev}
              current_index={current_index}
              dropdown_align="end"
              email={email}
              folders={folders}
              is_archive_loading={viewer.is_archive_loading}
              is_pin_loading={viewer.is_pin_loading}
              is_pinned={viewer.is_pinned}
              is_read={viewer.is_read}
              is_spam={viewer.mail_item?.is_spam === true}
              is_spam_loading={viewer.is_spam_loading}
              is_trash_loading={viewer.is_trash_loading}
              mail_item={viewer.mail_item}
              on_archive={viewer.handle_archive}
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
          </>
        ) : (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Skeleton className="w-8 h-8 rounded-md" />
            <Skeleton className="w-8 h-8 rounded-md" />
            <Skeleton className="w-8 h-8 rounded-md" />
          </div>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto relative"
        style={{ scrollbarGutter: "stable" }}
      >
        {show_content_skeleton && (
          <div className="absolute inset-0 z-10 bg-surf-primary px-2 py-3 sm:px-3 sm:py-4">
            <Skeleton className="h-7 mb-6 w-full max-w-[66%]" />
            <div className="flex items-start gap-3 sm:gap-4 mb-6 min-w-0">
              <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2 min-w-0">
                <Skeleton className="h-4 w-full max-w-[120px]" />
                <Skeleton className="h-3 w-full max-w-[90px]" />
              </div>
              <Skeleton className="h-3 w-24 flex-shrink-0 hidden sm:block" />
            </div>
            <div className="space-y-3 pt-4">
              <Skeleton className="w-full h-4" />
              <Skeleton className="w-full h-4" />
              <Skeleton className="h-4 w-full max-w-[75%]" />
              <Skeleton className="w-full h-4" />
              <Skeleton className="h-4 w-full max-w-[50%]" />
            </div>
          </div>
        )}
        {email && (
          <div className="py-4 sm:py-5">
            <h1 className={`px-4 sm:px-6 text-xl sm:text-2xl font-semibold text-txt-primary break-words ${viewer.mail_item?.folders?.length || viewer.mail_item?.tag_tokens?.length ? "mb-2" : "mb-4"}`}>
              <span className="inline-flex items-center gap-1 mr-2" style={{ verticalAlign: "-0.15em" }}>
                <EncryptionInfoDropdown
                  has_pq_protection={viewer.has_pq_protection}
                  has_recipient_key={viewer.has_recipient_key}
                  is_external={viewer.is_external}
                  size={22}
                />
                {external_content_state.report && (
                  <TrackingProtectionShield
                    report={external_content_state.report}
                    size={22}
                  />
                )}
              </span>
              {email.subject}
            </h1>

            {(viewer.mail_item?.folders?.length || viewer.mail_item?.tag_tokens?.length) ? (
              <div className="px-4 sm:px-6 flex flex-wrap gap-1.5 mb-4">
                {viewer.mail_item?.folders?.filter((f) => f.name).map((folder) => (
                  <EmailTag
                    key={folder.token}
                    className="flex-shrink-0"
                    custom_color={folder.color}
                    icon={(folder.icon as TagIconName) || "folder"}
                    label={folder.name}
                    variant={folder.color ? hex_to_variant(folder.color) : "neutral"}
                  />
                ))}
                {viewer.mail_item?.tag_tokens?.map((token) => {
                  const tag = get_tag_by_token(token);
                  if (!tag?.name) return null;
                  return (
                    <EmailTag
                      key={token}
                      className="flex-shrink-0"
                      custom_color={tag.color}
                      icon={tag.icon as TagIconName}
                      label={tag.name}
                      show_icon={!!tag.icon}
                      variant={tag.color ? hex_to_variant(tag.color) : "neutral"}
                    />
                  );
                })}
              </div>
            ) : null}

            <ViewerThreadContent
              current_user_email={viewer.current_user_email}
              current_user_name={viewer.current_user_name}
              email={email}
              external_content_mode={external_content_mode}
              loaded_content_types={loaded_content_types}
              on_archive={viewer.handle_per_message_archive}
              on_edit_thread_draft={viewer.handle_edit_thread_draft}
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
              on_draft_saved={viewer.handle_draft_saved}
              on_thread_draft_deleted={viewer.handle_thread_draft_deleted}
              on_toggle_message_read={viewer.handle_toggle_message_read}
              on_trash={viewer.handle_per_message_trash}
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
              sending_message={viewer.sending_message}
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
