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
import type {
  ExtractedPurchaseDetails,
  ExtractedShippingDetails,
} from "@/services/extraction/types";
import type { ExternalContentReport } from "@/lib/html_sanitizer";
import type { MailItem } from "@/services/api/mail";
import type { TranslationKey } from "@/lib/i18n";
import type { DraftContent } from "@/services/api/multi_drafts";
import type { DecryptedEmail } from "@/components/email/hooks/use_popup_viewer";

import { useState, useCallback } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";



import { PurchaseDetailsBanner } from "@/components/email/banners/purchase_details_banner";
import { ShippingDetailsBanner } from "@/components/email/banners/shipping_details_banner";
import { ThreadMessagesList } from "@/components/email/thread_message_block";
import { get_latest_expanded_id } from "@/services/thread_service";
import { use_preferences } from "@/contexts/preferences_context";
import { PopupEmailHeader } from "@/components/email/popup/popup_email_header";
import { is_system_email } from "@/lib/utils";
import { execute_unsubscribe } from "@/utils/unsubscribe_detector";
import { show_action_toast } from "@/components/toast/action_toast";
import {
  persist_unsubscribe,
  use_unsubscribed_senders,
} from "@/hooks/use_unsubscribed_senders";

interface ExtractionResult {
  has_purchase_details: boolean;
  has_shipping_details: boolean;
  purchase: ExtractedPurchaseDetails | null;
  shipping: ExtractedShippingDetails | null;
}

interface PopupEmailBodyProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  email: DecryptedEmail | null;
  mail_item: MailItem | null;
  error: string | null;
  is_fullscreen: boolean;
  thread_messages: DecryptedThreadMessage[];
  timestamp_date: React.MutableRefObject<Date | null>;
  extraction_result: ExtractionResult | null;
  external_content_state: {
    mode: "blocked" | "loaded" | "dismissed";
    report: ExternalContentReport | null;
  };
  external_content_mode: "always" | undefined;
  snoozed_until?: string;
  format_email_popup: (date: Date) => string;
  current_user_email: string;
  on_close: () => void;
  on_compose?: (email: string) => void;
  on_external_content_detected: (report: ExternalContentReport) => void;
  on_load_external_content: (types?: string[]) => void;
  loaded_content_types: Set<string>;
  on_dismiss_external_content: () => void;
  on_per_message_reply: (msg: DecryptedThreadMessage) => void;
  on_per_message_reply_all: (msg: DecryptedThreadMessage) => void;
  on_per_message_forward: (msg: DecryptedThreadMessage) => void;
  on_per_message_archive: (msg: DecryptedThreadMessage) => void;
  on_per_message_trash: (msg: DecryptedThreadMessage) => void;
  on_per_message_print: (msg: DecryptedThreadMessage) => void;
  on_per_message_report_phishing: (msg: DecryptedThreadMessage) => void;
  on_per_message_not_spam?: (msg: DecryptedThreadMessage) => void;
  is_spam?: boolean;
  on_toggle_message_read: (message_id: string) => void;
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
  thread_token?: string;
}

export function PopupEmailBody({
  t,
  email,
  mail_item,
  error,
  is_fullscreen,
  thread_messages,
  timestamp_date,
  extraction_result,
  external_content_state,
  external_content_mode,
  snoozed_until,
  format_email_popup,
  current_user_email,
  on_close,
  on_compose,
  on_external_content_detected,
  on_load_external_content,
  loaded_content_types,
  on_dismiss_external_content: _on_dismiss_external_content,
  on_per_message_reply: _on_per_message_reply,
  on_per_message_reply_all: _on_per_message_reply_all,
  on_per_message_forward: _on_per_message_forward,
  on_per_message_archive,
  on_per_message_trash,
  on_per_message_print,
  on_per_message_report_phishing,
  on_per_message_not_spam,
  is_spam,
  on_toggle_message_read,
  on_draft_saved,
  existing_draft,
  thread_token,
}: PopupEmailBodyProps) {
  const { preferences } = use_preferences();
  const { is_unsubscribed, mark_unsubscribed } = use_unsubscribed_senders();
  const [inline_reply_msg, set_inline_reply_msg] =
    useState<DecryptedThreadMessage | null>(null);
  const [inline_mode, set_inline_mode] = useState<
    "reply" | "reply_all" | "forward"
  >("reply");

  const handle_inline_reply = useCallback((msg: DecryptedThreadMessage) => {
    if (is_system_email(msg.sender_email)) return;
    set_inline_reply_msg(msg);
    set_inline_mode("reply");
  }, []);

  const handle_inline_reply_all = useCallback((msg: DecryptedThreadMessage) => {
    if (is_system_email(msg.sender_email)) return;
    set_inline_reply_msg(msg);
    set_inline_mode("reply_all");
  }, []);

  const handle_inline_forward = useCallback((msg: DecryptedThreadMessage) => {
    set_inline_reply_msg(msg);
    set_inline_mode("forward");
  }, []);

  const handle_close_inline_reply = useCallback(() => {
    set_inline_reply_msg(null);
  }, []);

  const is_external_thread = thread_messages.some((m) => m.is_external);

  const handle_unsubscribe = useCallback(async (): Promise<"success" | "manual"> => {
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
  }, [email, t, mark_unsubscribed]);

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <XMarkIcon className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-sm text-txt-secondary text-center">{error}</p>
          <Button size="md" variant="outline" onClick={on_close}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-txt-muted">
              {t("common.decrypting")}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <>
        {extraction_result?.has_purchase_details &&
          extraction_result.purchase && (
            <PurchaseDetailsBanner
              className="mx-4 mt-4"
              details={extraction_result.purchase}
            />
          )}

        {extraction_result?.has_shipping_details &&
          extraction_result.shipping && (
            <ShippingDetailsBanner
              className="mx-4 mt-4"
              details={extraction_result.shipping}
            />
          )}

        <div className="p-4">
          <PopupEmailHeader
            email={email}
            format_email_popup={format_email_popup}
            is_fullscreen={is_fullscreen}
            mail_item={mail_item}
            on_close={on_close}
            on_compose={on_compose}
            snoozed_until={snoozed_until}
            t={t}
            thread_messages={thread_messages}
            timestamp_date={timestamp_date}
            tracking_report={external_content_state.report}
          />

          <div className="mt-4">
            <ThreadMessagesList
              hide_counter
              current_user_email={current_user_email}
              default_expanded_id={get_latest_expanded_id(thread_messages)}
              existing_draft={existing_draft}
              external_content_mode={external_content_mode}
              force_all_dark_mode={preferences.force_dark_mode_emails}
              loaded_content_types={loaded_content_types}
              inline_mode={inline_mode}
              inline_reply_is_external={is_external_thread}
              inline_reply_msg={inline_reply_msg}
              inline_reply_thread_token={thread_token}
              messages={thread_messages}
              on_archive={on_per_message_archive}
              on_close_inline_reply={handle_close_inline_reply}
              on_draft_saved={on_draft_saved}
              on_external_content_detected={on_external_content_detected}
              on_forward={handle_inline_forward}
              on_load_external_content={on_load_external_content}
              on_not_spam={is_spam ? on_per_message_not_spam : undefined}
              on_print={on_per_message_print}
              on_reply={handle_inline_reply}
              on_reply_all={handle_inline_reply_all}
              on_report_phishing={on_per_message_report_phishing}
              on_set_inline_mode={set_inline_mode}
              on_toggle_message_read={on_toggle_message_read}
              on_trash={on_per_message_trash}
              on_unsubscribe={
                email.unsubscribe_info?.has_unsubscribe && !is_system_email(email.sender_email) && !is_unsubscribed(email.sender_email)
                  ? handle_unsubscribe
                  : undefined
              }
              on_manual_unsubscribed={() => {
                if (email) mark_unsubscribed(email.sender_email);
              }}
              unsubscribe_url={email.unsubscribe_info?.unsubscribe_link}
              subject={email.subject}
            />
          </div>
        </div>
      </>
    </div>
  );
}
