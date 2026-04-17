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
import type { TranslationKey } from "@/lib/i18n/types";
import type { NavigateFunction } from "react-router-dom";
import type { DecryptedThreadMessage } from "@/types/thread";
import type { DraftWithContent } from "@/services/api/multi_drafts";
import type { DecryptedEmail } from "@/components/email/hooks/use_email_detail";
import type { MailItem } from "@/services/api/mail";
import type { ExternalContentReport } from "@/lib/html_sanitizer";

import { motion, AnimatePresence } from "framer-motion";
import {
  ExclamationCircleIcon,
  LockClosedIcon,
  EnvelopeIcon,
  UserIcon,
  ChatBubbleLeftIcon,
  NoSymbolIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpirationCountdown } from "@/components/email/expiration_countdown";
import { UnsubscribeBanner } from "@/components/email/unsubscribe_banner";
import { ThreadMessagesList } from "@/components/email/thread_message_block";
import { ThreadDraftBadge } from "@/components/email/thread_draft_badge";
import { use_should_reduce_motion } from "@/provider";
import { use_preferences } from "@/contexts/preferences_context";
import { is_system_email } from "@/lib/utils";

interface EmailDetailBodyProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  navigate: NavigateFunction;
  user: { display_name?: string; email?: string } | null;
  email: DecryptedEmail | null;
  mail_item: MailItem | null;
  is_loading: boolean;
  error: string | null;
  thread_messages: DecryptedThreadMessage[];
  thread_draft: DraftWithContent | null;
  current_user_email: string;
  is_sender_dropdown_open: boolean;
  set_is_sender_dropdown_open: (open: boolean) => void;
  set_is_block_sender_modal_open: (open: boolean) => void;
  handle_copy_text: (text: string, label: string) => void;
  handle_per_message_reply: (msg: DecryptedThreadMessage) => void;
  handle_per_message_reply_all: (msg: DecryptedThreadMessage) => void;
  handle_per_message_forward: (msg: DecryptedThreadMessage) => void;
  handle_per_message_archive: (msg: DecryptedThreadMessage) => void;
  handle_per_message_trash: (msg: DecryptedThreadMessage) => void;
  handle_per_message_print: (msg: DecryptedThreadMessage) => void;
  handle_per_message_view_source: (msg: DecryptedThreadMessage) => void;
  handle_per_message_report_phishing: (msg: DecryptedThreadMessage) => void;
  handle_per_message_not_spam?: (msg: DecryptedThreadMessage) => void;
  handle_toggle_message_read: (message_id: string) => void;
  handle_edit_thread_draft: (draft: DraftWithContent) => void;
  handle_thread_draft_deleted: () => void;
  on_external_content_detected?: (report: ExternalContentReport) => void;
}

function EmailDetailSkeleton(): React.ReactElement {
  return (
    <div className="max-w-4xl mx-auto flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <Skeleton className="w-5 h-5 sm:w-6 sm:h-6" />
          <Skeleton className="h-6 sm:h-8 w-48 sm:w-72" />
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <Skeleton className="w-8 h-8" />
          <Skeleton className="w-8 h-8" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>

      <div className="mb-4 mt-2 flex items-start gap-2 sm:gap-3">
        <Skeleton className="w-8 h-8 sm:w-12 sm:h-12 rounded-full flex-shrink-0" />
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
            <Skeleton className="h-4 sm:h-5 w-28 sm:w-36" />
            <Skeleton className="h-3 sm:h-4 w-36 sm:w-44" />
          </div>
          <Skeleton className="h-3 sm:h-4 w-16 sm:w-24" />
        </div>
      </div>

      <div className="flex-1 rounded-lg p-3 sm:p-4 mt-4">
        <div className="space-y-2 sm:space-y-3">
          <Skeleton className="h-3 sm:h-4 w-full" />
          <Skeleton className="h-3 sm:h-4 w-[95%]" />
          <Skeleton className="h-3 sm:h-4 w-[88%]" />
          <Skeleton className="h-3 sm:h-4 w-[92%]" />
          <Skeleton className="h-3 sm:h-4 w-[70%]" />
          <div className="h-3 sm:h-4" />
          <Skeleton className="h-3 sm:h-4 w-[85%]" />
          <Skeleton className="h-3 sm:h-4 w-[90%]" />
          <Skeleton className="h-3 sm:h-4 w-[60%]" />
        </div>
      </div>
    </div>
  );
}

export function EmailDetailBody({
  t,
  navigate,
  user,
  email,
  mail_item,
  is_loading,
  error,
  thread_messages,
  thread_draft,
  current_user_email,
  is_sender_dropdown_open,
  set_is_sender_dropdown_open,
  set_is_block_sender_modal_open,
  handle_copy_text,
  handle_per_message_reply,
  handle_per_message_reply_all,
  handle_per_message_forward,
  handle_per_message_archive,
  handle_per_message_trash,
  handle_per_message_print,
  handle_per_message_view_source,
  handle_per_message_report_phishing,
  handle_per_message_not_spam,
  handle_toggle_message_read,
  handle_edit_thread_draft,
  handle_thread_draft_deleted,
  on_external_content_detected,
}: EmailDetailBodyProps) {
  const reduce_motion = use_should_reduce_motion();
  const { preferences } = use_preferences();

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 pb-20 sm:pb-6">
      {is_loading && !email ? (
        <EmailDetailSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-full gap-4 px-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <ExclamationCircleIcon className="w-7 h-7 sm:w-8 sm:h-8 text-red-500" />
          </div>
          <div className="text-center">
            <h3 className="text-sm sm:text-base font-semibold mb-1 text-txt-primary">
              {t("common.message_not_found" as TranslationKey)}
            </h3>
            <p className="text-xs sm:text-sm text-txt-muted">{error}</p>
          </div>
          <Button onClick={() => navigate(-1)}>
            {t("common.go_back" as TranslationKey)}
          </Button>
        </div>
      ) : email ? (
        <div className="max-w-4xl mx-auto flex flex-col h-full">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 sm:mb-6 gap-2 sm:gap-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 sm:mb-2">
                <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-txt-primary break-words flex-1 min-w-0">
                  {email.subject}
                </h1>
                {mail_item?.expires_at && (
                  <ExpirationCountdown
                    expires_at={mail_item.expires_at}
                    size="md"
                  />
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm text-txt-muted">
                  {email.timestamp}
                </span>
                {thread_messages.length > 1 && (
                  <span className="text-xs text-txt-muted">
                    ·{" "}
                    {t("common.n_messages_count" as TranslationKey, {
                      count: thread_messages.length,
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mb-4 sm:mb-6 flex items-start gap-2 sm:gap-3">
            <button
              className="flex-shrink-0"
              onClick={() =>
                set_is_sender_dropdown_open(!is_sender_dropdown_open)
              }
            >
              <ProfileAvatar
                use_domain_logo
                className="cursor-pointer hover:opacity-80"
                email={email.sender_email}
                name={email.sender}
                size="md"
              />
            </button>
            <div className="flex-1 min-w-0 relative">
              <div className="flex flex-col sm:flex-row sm:items-center gap-0 sm:gap-2 flex-wrap">
                <button
                  className="font-medium text-xs sm:text-sm text-txt-primary hover:text-blue-500 transition-colors text-left"
                  onClick={() =>
                    set_is_sender_dropdown_open(!is_sender_dropdown_open)
                  }
                >
                  {email.sender}
                </button>
                <span className="text-xs sm:text-sm text-txt-muted truncate">
                  &lt;{email.sender_email}&gt;
                </span>
              </div>
              <div className="text-xs sm:text-sm text-txt-muted mt-0.5 truncate">
                {email.to.length > 0
                  ? `${t("common.to_label")} ${email.to
                      .map((r) => r.email)
                      .join(", ")}`
                  : t("common.to_me")}
              </div>

              <AnimatePresence>
                {is_sender_dropdown_open && (
                  <>
                    <motion.div
                      animate={{ opacity: 1 }}
                      className="fixed inset-0 z-40"
                      exit={{ opacity: 0 }}
                      initial={reduce_motion ? false : { opacity: 0 }}
                      transition={{ duration: reduce_motion ? 0 : 0.1 }}
                      onClick={() => set_is_sender_dropdown_open(false)}
                    />
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute top-full left-0 z-50 w-64 sm:w-72 border rounded-lg shadow-lg mt-2 overflow-hidden bg-surf-primary border-edge-secondary"
                      exit={{ opacity: 0, y: -4 }}
                      initial={reduce_motion ? false : { opacity: 0, y: -4 }}
                      transition={{ duration: reduce_motion ? 0 : 0.15 }}
                    >
                      <div className="p-2 sm:p-3">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <ProfileAvatar
                            use_domain_logo
                            email={email.sender_email}
                            name={email.sender}
                            size="md"
                          />
                          <div className="flex-1 min-w-0">
                            <button
                              className="font-medium text-xs sm:text-sm text-txt-primary hover:text-blue-500 transition-colors text-left w-full truncate"
                              onClick={() =>
                                handle_copy_text(email.sender, "name")
                              }
                            >
                              {email.sender}
                            </button>
                            <button
                              className="text-xs text-txt-muted hover:text-blue-500 transition-colors text-left w-full truncate"
                              onClick={() =>
                                handle_copy_text(email.sender_email, "email")
                              }
                            >
                              {email.sender_email}
                            </button>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      <div className="p-1">
                        <button className="w-full flex items-center gap-2 sm:gap-2.5 text-left px-2 sm:px-3 py-2 text-xs sm:text-sm text-txt-secondary hover:bg-surf-hover rounded-md">
                          <EnvelopeIcon className="w-4 h-4" />
                          {t("common.new_message")}
                        </button>
                        <button className="w-full flex items-center gap-2 sm:gap-2.5 text-left px-2 sm:px-3 py-2 text-xs sm:text-sm text-txt-secondary hover:bg-surf-hover rounded-md">
                          <UserIcon className="w-4 h-4" />
                          {t("common.add_to_contacts")}
                        </button>
                        <button className="w-full flex items-center gap-2 sm:gap-2.5 text-left px-2 sm:px-3 py-2 text-xs sm:text-sm text-txt-secondary hover:bg-surf-hover rounded-md">
                          <ChatBubbleLeftIcon className="w-4 h-4" />
                          {t("common.view_all_messages" as TranslationKey)}
                        </button>
                        <Separator className="my-1" />
                        <button
                          className="w-full flex items-center gap-2 sm:gap-2.5 text-left px-2 sm:px-3 py-2 text-xs sm:text-sm text-red-500 hover:bg-red-500/10 rounded-md"
                          onClick={() => {
                            set_is_sender_dropdown_open(false);
                            set_is_block_sender_modal_open(true);
                          }}
                        >
                          <NoSymbolIcon className="w-4 h-4" />
                          {t("mail.block_sender" as TranslationKey)}
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          {email.unsubscribe_info?.has_unsubscribe &&
            !is_system_email(email.sender_email) && (
              <div className="mb-4 sm:mb-6">
                <UnsubscribeBanner
                  sender_email={email.sender_email}
                  sender_name={email.sender}
                  unsubscribe_info={email.unsubscribe_info}
                />
              </div>
            )}

          <div className="mt-4">
            <ThreadMessagesList
              hide_counter
              current_user_email={current_user_email}
              default_expanded_id={email.id}
              force_all_dark_mode={preferences.force_dark_mode_emails}
              messages={
                thread_messages.length > 0
                  ? thread_messages
                  : [
                      {
                        id: email.id,
                        item_type: "received" as const,
                        sender_name: email.sender,
                        sender_email: email.sender_email,
                        subject: email.subject,
                        body: email.body,
                        timestamp: email.timestamp,
                        is_read: email.is_read,
                        is_starred: email.is_starred,
                        is_deleted: false,
                        is_external: mail_item?.is_external ?? false,
                        to_recipients: email.to.map((r) => ({
                          name: r.name || "",
                          email: r.email,
                        })),
                      },
                    ]
              }
              on_archive={handle_per_message_archive}
              on_external_content_detected={on_external_content_detected}
              on_forward={handle_per_message_forward}
              on_not_spam={
                mail_item?.is_spam ? handle_per_message_not_spam : undefined
              }
              on_print={handle_per_message_print}
              on_reply={handle_per_message_reply}
              on_reply_all={handle_per_message_reply_all}
              on_report_phishing={handle_per_message_report_phishing}
              on_toggle_message_read={handle_toggle_message_read}
              on_trash={handle_per_message_trash}
              on_view_source={handle_per_message_view_source}
              size_bytes={mail_item?.metadata?.size_bytes}
              subject={email.subject}
            />

            {thread_draft && (
              <ThreadDraftBadge
                current_user_email={current_user_email}
                current_user_name={user?.display_name}
                draft={thread_draft}
                on_deleted={handle_thread_draft_deleted}
                on_edit={handle_edit_thread_draft}
              />
            )}
          </div>

          {email.attachments.length > 0 && (
            <div className="mt-4 sm:mt-6">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <span className="text-xs sm:text-sm font-medium text-txt-primary">
                  {t("common.attachments_label")}
                </span>
                <span className="text-xs text-txt-muted">
                  (
                  {email.attachments.length > 1
                    ? t("common.n_files_plural" as TranslationKey, {
                        count: email.attachments.length,
                      })
                    : t("common.n_files" as TranslationKey, {
                        count: email.attachments.length,
                      })}
                  )
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-2">
                {email.attachments.map((attachment, idx) => (
                  <button
                    key={idx}
                    className="flex items-center gap-2 px-2 sm:px-3 py-2 border rounded-lg cursor-pointer hover:bg-surf-hover w-full sm:w-auto bg-surf-card border-edge-secondary"
                  >
                    <div className="w-6 h-6 sm:w-7 sm:h-7 bg-blue-500 rounded flex items-center justify-center flex-shrink-0">
                      <DocumentTextIcon className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                    </div>
                    <div className="text-left min-w-0 flex-1">
                      <span className="text-xs sm:text-sm font-medium text-txt-primary block truncate">
                        {attachment.name}
                      </span>
                      <span className="text-xs text-txt-muted">
                        {attachment.size}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : mail_item ? (
        <div className="flex flex-col items-center justify-center h-full gap-4 px-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <LockClosedIcon className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500" />
          </div>
          <div className="text-center max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold mb-1 text-txt-primary">
              {t("common.unable_to_decrypt" as TranslationKey)}
            </h3>
            <p className="text-xs sm:text-sm text-txt-muted">
              {t("common.decrypt_session_expired_message" as TranslationKey)}
            </p>
          </div>
          <div className="p-3 rounded-lg max-w-sm w-full bg-amber-500/[0.08] border border-amber-500/20">
            <p className="text-xs text-txt-secondary text-center">
              {t("common.decrypt_try_sign_out" as TranslationKey)}
            </p>
          </div>
          <Button onClick={() => navigate(-1)}>
            {t("auth.back_to_inbox")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
