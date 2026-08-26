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
import type {} from "@/services/api/mail";
import type { DraftWithContent } from "@/services/api/multi_drafts";
import type { ExternalContentReport } from "@/lib/html_sanitizer";
import type { DecryptedEmail } from "@/components/email/use_email_viewer";
import type { PreloadedSanitizedContent } from "@/components/email/hooks/preload_cache";

import React, { useState, useCallback, useEffect, useMemo } from "react";

import { use_preferences } from "@/contexts/preferences_context";
import { is_system_email } from "@/lib/utils";
import {
  ThreadMessagesList,
  type ThreadMessagesListRef,
} from "@/components/email/thread_message_block";
import { SendingMessageBlock } from "@/components/email/sending_message_block";
import { ThreadDraftBadge } from "@/components/email/thread_draft_badge";
import { PurchaseDetailsBanner } from "@/components/email/banners/purchase_details_banner";
import { ShippingDetailsBanner } from "@/components/email/banners/shipping_details_banner";
import { CalendarInviteBanner } from "@/components/email/banners/calendar_invite_banner";
import { extract_email_details } from "@/services/extraction/extractor";

export interface ViewerThreadContentProps {
  email: DecryptedEmail;
  thread_messages: DecryptedThreadMessage[];
  thread_list_ref: React.RefObject<ThreadMessagesListRef | null>;
  current_user_email: string;
  current_user_name?: string;
  thread_draft?: DraftWithContent | null;
  sending_message?: DecryptedThreadMessage | null;
  on_reply: (msg: DecryptedThreadMessage) => void;
  on_reply_all: (msg: DecryptedThreadMessage) => void;
  on_forward: (msg: DecryptedThreadMessage) => void;
  on_archive: (msg: DecryptedThreadMessage) => void;
  on_trash: (msg: DecryptedThreadMessage) => void;
  on_print: (msg: DecryptedThreadMessage) => void;
  on_view_source: (msg: DecryptedThreadMessage) => void;
  on_report_phishing: (msg: DecryptedThreadMessage) => void;
  on_not_spam?: (msg: DecryptedThreadMessage) => void;
  on_toggle_message_read: (message_id: string, next_read: boolean) => void;
  on_edit_thread_draft?: (draft: DraftWithContent) => void;
  on_thread_draft_deleted?: () => void;
  on_draft_saved?: (draft: {
    id: string;
    version: number;
    content: import("@/services/api/multi_drafts").DraftContent;
  }) => void;
  external_content_mode?: "always";
  on_external_content_detected?: (report: ExternalContentReport) => void;
  thread_sanitized?: Map<string, PreloadedSanitizedContent>;
  size_bytes?: number;
  on_unsubscribe?: () => Promise<"success" | "manual">;
  on_manual_unsubscribed?: () => void;
  unsubscribe_url?: string;
  loaded_content_types?: Set<string>;
  on_load_external_content?: (types?: string[]) => void;
}

export function ViewerThreadContent({
  email,
  thread_messages,
  thread_list_ref,
  current_user_email,
  current_user_name,
  thread_draft,
  sending_message,
  on_reply: _on_reply,
  on_reply_all: _on_reply_all,
  on_forward: _on_forward,
  on_archive,
  on_trash,
  on_print,
  on_view_source,
  on_report_phishing,
  on_not_spam,
  on_toggle_message_read,
  on_edit_thread_draft: _on_edit_thread_draft,
  on_thread_draft_deleted,
  on_draft_saved,
  external_content_mode,
  on_external_content_detected,
  thread_sanitized,
  size_bytes,
  on_unsubscribe,
  on_manual_unsubscribed,
  unsubscribe_url,
  loaded_content_types,
  on_load_external_content,
}: ViewerThreadContentProps): React.ReactElement {
  const { preferences } = use_preferences();
  const [inline_reply_msg, set_inline_reply_msg] =
    useState<DecryptedThreadMessage | null>(null);
  const [inline_mode, set_inline_mode] = useState<
    "reply" | "reply_all" | "forward"
  >("reply");

  const handle_inline_reply = useCallback((msg: DecryptedThreadMessage) => {
    set_inline_reply_msg(msg);
    set_inline_mode("reply");
  }, []);

  const handle_inline_reply_all = useCallback((msg: DecryptedThreadMessage) => {
    set_inline_reply_msg(msg);
    set_inline_mode("reply_all");
  }, []);

  const handle_inline_forward = useCallback((msg: DecryptedThreadMessage) => {
    set_inline_reply_msg(msg);
    set_inline_mode("forward");
  }, []);

  const handle_set_inline_mode = useCallback(
    (mode: "reply" | "reply_all" | "forward") => {
      set_inline_mode(mode);
    },
    [],
  );

  const handle_close_inline_reply = useCallback(() => {
    set_inline_reply_msg(null);
  }, []);

  const is_external_thread = thread_messages.some((m) => m.is_external);

  useEffect(() => {
    const handle_kb_reply = (e: Event) => {
      if (thread_messages.length === 0) return;
      const last = thread_messages[thread_messages.length - 1];

      if (!is_system_email(last)) {
        const wants_reply_all =
          (e as CustomEvent<{ reply_all?: boolean }>).detail?.reply_all ===
            true || preferences.default_reply_behavior === "reply_all";

        set_inline_reply_msg(last);
        set_inline_mode(wants_reply_all ? "reply_all" : "reply");
      }
    };

    window.addEventListener("astermail:keyboard-reply", handle_kb_reply);

    return () =>
      window.removeEventListener("astermail:keyboard-reply", handle_kb_reply);
  }, [thread_messages, preferences.default_reply_behavior]);

  const memoized_draft = useMemo(
    () =>
      thread_draft
        ? {
            id: thread_draft.id,
            version: thread_draft.version,
            reply_to_id: thread_draft.reply_to_id,
            content: thread_draft.content,
          }
        : null,
    [
      thread_draft?.id,
      thread_draft?.version,
      thread_draft?.reply_to_id,
      thread_draft?.content,
    ],
  );

  const extraction = useMemo(
    () =>
      extract_email_details(
        email.subject ?? "",
        email.body ?? "",
        email.html_content,
        email.sender_email ?? "",
        email.sender ?? "",
      ),
    [
      email.subject,
      email.body,
      email.html_content,
      email.sender_email,
      email.sender,
    ],
  );

  return (
    <div className="mt-4">
      {extraction.has_purchase_details && extraction.purchase && (
        <PurchaseDetailsBanner
          className="mx-3 @md:mx-4 mb-3"
          details={extraction.purchase}
          email_id={email.id}
        />
      )}
      {extraction.has_shipping_details && extraction.shipping && (
        <ShippingDetailsBanner
          className="mx-3 @md:mx-4 mb-3"
          details={extraction.shipping}
          sender_email={email.sender_email}
          sender_name={email.sender}
        />
      )}
      <CalendarInviteBanner
        body={email.body}
        className="mx-3 @md:mx-4 mb-3"
        html_content={email.html_content}
      />
      <ThreadMessagesList
        key={email.id}
        ref={thread_list_ref as React.Ref<ThreadMessagesListRef>}
        hide_counter
        hide_expand_collapse
        current_user_email={current_user_email}
        default_expanded_id={email.id}
        existing_draft={memoized_draft}
        external_content_mode={external_content_mode}
        force_all_dark_mode={preferences.force_dark_mode_emails}
        inline_mode={inline_mode}
        inline_reply_is_external={is_external_thread}
        inline_reply_msg={inline_reply_msg}
        inline_reply_thread_token={email.thread_token}
        loaded_content_types={loaded_content_types}
        messages={thread_messages}
        on_archive={on_archive}
        on_close_inline_reply={handle_close_inline_reply}
        on_draft_saved={on_draft_saved}
        on_external_content_detected={on_external_content_detected}
        on_forward={handle_inline_forward}
        on_load_external_content={on_load_external_content}
        on_manual_unsubscribed={on_manual_unsubscribed}
        on_not_spam={on_not_spam}
        on_print={on_print}
        on_reply={handle_inline_reply}
        on_reply_all={handle_inline_reply_all}
        on_report_phishing={on_report_phishing}
        on_set_inline_mode={handle_set_inline_mode}
        on_toggle_message_read={on_toggle_message_read}
        on_trash={on_trash}
        on_unsubscribe={on_unsubscribe}
        on_view_source={on_view_source}
        preloaded_sanitized={thread_sanitized}
        size_bytes={size_bytes}
        subject={email.subject}
        unsubscribe_url={unsubscribe_url}
      />

      {thread_draft && !inline_reply_msg && (
        <ThreadDraftBadge
          current_user_email={current_user_email}
          current_user_name={current_user_name}
          draft={thread_draft}
          on_deleted={() => on_thread_draft_deleted?.()}
          on_edit={(draft) => {
            const target =
              thread_messages.find((m) => m.id === draft.reply_to_id) ??
              thread_messages[thread_messages.length - 1];

            if (!target) return;
            set_inline_reply_msg(target);
            set_inline_mode(
              draft.draft_type === "forward" ? "forward" : "reply",
            );
          }}
          thread_token={email.thread_token}
        />
      )}

      {sending_message && (
        <div className="mt-4">
          <SendingMessageBlock
            current_user_name={current_user_name ?? ""}
            message={sending_message}
          />
        </div>
      )}
    </div>
  );
}
