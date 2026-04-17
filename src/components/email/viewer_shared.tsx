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
import type { MailItem } from "@/services/api/mail";
import type { DraftWithContent } from "@/services/api/multi_drafts";
import type { ExternalContentReport } from "@/lib/html_sanitizer";
import type { DecryptedEmail } from "@/components/email/use_email_viewer";
import type { PreloadedSanitizedContent } from "@/components/email/hooks/preload_cache";

import React, { useState, useCallback, useEffect } from "react";
import {
  XMarkIcon,
  NoSymbolIcon,
  CheckCircleIcon,
  ArchiveBoxIcon,
  TrashIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  EllipsisHorizontalIcon,
  PrinterIcon,
  FolderIcon,
  MapPinIcon,
  QueueListIcon,
} from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@aster/ui";

import { use_external_link } from "@/contexts/external_link_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EncryptionInfoDropdown } from "@/components/common/encryption_info_dropdown";
import { is_system_email } from "@/lib/utils";
import {
  EmailTag,
  hex_to_variant,
  type TagIconName,
} from "@/components/ui/email_tag";
import { EmailProfileTrigger } from "@/components/email/email_profile_trigger";
import { SnoozeBadge } from "@/components/ui/snooze_badge";
import {
  ThreadMessagesList,
  type ThreadMessagesListRef,
} from "@/components/email/thread_message_block";
import { ViewSourceModal } from "@/components/modals/view_source_modal";
import { ExpirationCountdown } from "@/components/email/expiration_countdown";
import { ThreadDraftBadge } from "@/components/email/thread_draft_badge";
import { SendingMessageBlock } from "@/components/email/sending_message_block";

let loaded_content_email_id: string | null = null;

export function get_external_content_mode(
  email_id: string,
): "loaded" | undefined {
  return loaded_content_email_id === email_id ? "loaded" : undefined;
}

export function set_external_content_mode(email_id: string): void {
  loaded_content_email_id = email_id;
}

interface ViewerToolbarActionsProps {
  is_pinned: boolean;
  is_pin_loading: boolean;
  is_archive_loading: boolean;
  is_trash_loading: boolean;
  is_spam_loading: boolean;
  is_read: boolean;
  thread_messages: DecryptedThreadMessage[];
  thread_expand_state: {
    all_expanded: boolean;
    all_collapsed: boolean;
    has_unread: boolean;
  };
  thread_list_ref: React.RefObject<ThreadMessagesListRef | null>;
  email: DecryptedEmail;
  mail_item: MailItem | null;
  on_pin_toggle: () => void;
  on_archive: () => void;
  on_trash: () => void;
  on_read_toggle: () => void;
  on_spam: () => void;
  on_not_spam?: () => void;
  is_spam?: boolean;
  on_print: () => void;
  on_unsubscribe: () => void;
  can_go_prev?: boolean;
  can_go_next?: boolean;
  on_navigate_prev?: () => void;
  on_navigate_next?: () => void;
  current_index?: number;
  total_count?: number;
  button_size?: string;
  button_px?: number;
  icon_size?: string;
  dropdown_align?: "start" | "end";
  hide_class?: string;
}

export function ViewerToolbarActions({
  is_pinned,
  is_pin_loading,
  is_archive_loading,
  is_trash_loading,
  is_spam_loading,
  is_read,
  thread_messages,
  thread_expand_state,
  thread_list_ref,
  email,
  mail_item,
  on_pin_toggle,
  on_archive,
  on_trash,
  on_read_toggle,
  on_spam,
  on_not_spam,
  is_spam,
  on_print,
  on_unsubscribe,
  button_size = "h-8 w-8",
  button_px,
  icon_size = "w-4 h-4",
  dropdown_align = "end",
  hide_class = "",
}: ViewerToolbarActionsProps): React.ReactElement {
  const { t } = use_i18n();
  const btn_style = button_px
    ? {
        width: button_px,
        height: button_px,
        minWidth: button_px,
        minHeight: button_px,
      }
    : undefined;

  return (
    <>
      <Tooltip tip={is_pinned ? t("mail.unpin") : t("mail.pin_to_top")}>
        <Button
          className={`${hide_class} ${button_size} ${is_pinned ? "text-blue-500 bg-blue-500/10" : "text-[var(--text-muted)] hover:text-blue-500 hover:bg-blue-500/10"}`}
          disabled={is_pin_loading}
          size="icon"
          style={btn_style}
          variant="ghost"
          onClick={on_pin_toggle}
        >
          <MapPinIcon
            className={`${icon_size} ${is_pinned ? "-rotate-45" : ""}`}
          />
        </Button>
      </Tooltip>

      <Tooltip tip={t("mail.archive")}>
        <Button
          className={`${hide_class} ${button_size} text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]`}
          disabled={is_archive_loading}
          size="icon"
          style={btn_style}
          variant="ghost"
          onClick={on_archive}
        >
          <ArchiveBoxIcon className={icon_size} />
        </Button>
      </Tooltip>

      <Tooltip tip={t("mail.move_to_trash")}>
        <Button
          className={`${hide_class} ${button_size} text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10`}
          disabled={is_trash_loading}
          size="icon"
          style={btn_style}
          variant="ghost"
          onClick={on_trash}
        >
          <TrashIcon className={icon_size} />
        </Button>
      </Tooltip>

      {thread_messages.length > 1 && (
        <Tooltip
          tip={
            thread_expand_state.all_expanded
              ? t("common.collapse_all")
              : t("common.expand_all")
          }
        >
          <Button
            className={`${hide_class} ${button_size} text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]`}
            size="icon"
            style={btn_style}
            variant="ghost"
            onClick={() => {
              if (thread_expand_state.all_expanded) {
                thread_list_ref.current?.collapse_all();
              } else {
                thread_list_ref.current?.expand_all();
              }
            }}
          >
            <QueueListIcon className={icon_size} />
          </Button>
        </Tooltip>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className={`${button_size} text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]`}
            size="icon"
            style={btn_style}
            title={t("common.more")}
            variant="ghost"
          >
            <EllipsisHorizontalIcon className={icon_size} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={dropdown_align} className="w-48">
          <DropdownMenuItem onClick={on_read_toggle}>
            {is_read ? (
              <>
                <EnvelopeIcon className="w-4 h-4 mr-2" />
                {t("mail.mark_as_unread")}
              </>
            ) : (
              <>
                <EnvelopeOpenIcon className="w-4 h-4 mr-2" />
                {t("mail.mark_as_read")}
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={on_pin_toggle}>
            <MapPinIcon
              className={`w-4 h-4 mr-2 ${is_pinned ? "-rotate-45 text-blue-500" : ""}`}
            />
            {is_pinned ? t("mail.unpin") : t("mail.pin_to_top")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {is_spam && on_not_spam ? (
            <DropdownMenuItem disabled={is_spam_loading} onClick={on_not_spam}>
              <NoSymbolIcon className="w-4 h-4 mr-2" />
              {t("mail.not_spam")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={is_spam_loading} onClick={on_spam}>
              <NoSymbolIcon className="w-4 h-4 mr-2" />
              {t("mail.report_spam")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={is_trash_loading} onClick={on_trash}>
            <TrashIcon className="w-4 h-4 mr-2" />
            {mail_item?.is_trashed || email?.is_trashed
              ? t("mail.delete_permanently")
              : t("mail.move_to_trash")}
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <FolderIcon className="w-4 h-4 mr-2" />
            {t("mail.move_to_folder")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={on_print}>
            <PrinterIcon className="w-4 h-4 mr-2" />
            {t("mail.print")}
          </DropdownMenuItem>
          {thread_messages.length > 1 && thread_expand_state.has_unread && (
            <DropdownMenuItem
              onClick={() => thread_list_ref.current?.mark_all_read()}
            >
              <CheckCircleIcon className="w-4 h-4 mr-2" />
              {t("mail.mark_all_read")}
            </DropdownMenuItem>
          )}
          {email.unsubscribe_info?.has_unsubscribe && (
            <DropdownMenuItem onClick={on_unsubscribe}>
              <XMarkIcon className="w-4 h-4 mr-2" />
              {t("mail.unsubscribe")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

interface ViewerEmailHeaderProps {
  email: DecryptedEmail;
  mail_item: MailItem | null;
  is_external: boolean;
  has_recipient_key?: boolean;
  has_pq_protection: boolean;
  thread_messages: DecryptedThreadMessage[];
  format_email_detail: (date: Date) => string;
  copy_to_clipboard: (text: string, label: string) => void;
  snoozed_until?: string;
  encryption_size?: number;
  hide_subject?: boolean;
  subject_class?: string;
  avatar_class?: string;
  avatar_size?: "xs" | "sm" | "md" | "lg" | "xl";
  gap_class?: string;
  email_button_hide_class?: string;
  flex_wrap_class?: string;
  popover_content_class?: string;
}

export function ViewerEmailHeader({
  email,
  mail_item,
  is_external,
  has_recipient_key,
  has_pq_protection,
  thread_messages,
  format_email_detail,
  copy_to_clipboard,
  snoozed_until,
  encryption_size = 20,
  hide_subject = false,
  subject_class = "text-xl sm:text-2xl font-semibold break-words flex-1 min-w-0",
  avatar_class = "w-8 h-8 sm:w-10 sm:h-10",
  avatar_size = "lg",
  gap_class = "gap-3 sm:gap-4",
  email_button_hide_class = "hidden sm:inline",
  flex_wrap_class = "flex-wrap sm:flex-nowrap",
}: ViewerEmailHeaderProps): React.ReactElement {
  const { t } = use_i18n();

  return (
    <>
      {!hide_subject && (
        <div className="flex items-center gap-2 mb-6">
          <EncryptionInfoDropdown
            has_pq_protection={has_pq_protection}
            has_recipient_key={has_recipient_key}
            is_external={is_external}
            size={encryption_size}
          />
          <h1 className={`${subject_class} text-txt-primary`}>
            {email.subject}
          </h1>
          {email.expires_at && (
            <ExpirationCountdown expires_at={email.expires_at} size="md" />
          )}
        </div>
      )}

      <div className={`flex items-start ${gap_class} mb-6`}>
        <ProfileAvatar
          clickable
          use_domain_logo
          className={avatar_class}
          email={email.sender_email}
          name={email.sender}
          size={avatar_size}
        />
        <div className="flex-1 min-w-0">
          <div
            className={`flex items-start sm:items-center justify-between gap-2 ${flex_wrap_class}`}
          >
            <div className="flex items-center min-w-0 flex-shrink gap-2">
              <EmailProfileTrigger
                className="font-medium text-sm truncate"
                email={email.sender_email}
                name={email.sender}
              >
                <span className="text-txt-primary">{email.sender}</span>
              </EmailProfileTrigger>
              <button
                className={`text-xs whitespace-nowrap ${email_button_hide_class} hover:underline transition-all text-txt-muted`}
                onClick={() =>
                  copy_to_clipboard(email.sender_email, t("common.email"))
                }
              >
                &lt;{email.sender_email}&gt;
              </button>
              {is_system_email(email.sender_email) && (
                <EmailTag
                  className="flex-shrink-0"
                  icon="info"
                  label={t("common.system")}
                  variant="blue"
                />
              )}
              {mail_item?.labels
                ?.filter((l) => l.name)
                .map((label) => (
                  <EmailTag
                    key={label.token}
                    className="flex-shrink-0"
                    custom_color={label.color}
                    icon={(label.icon as TagIconName) || "folder"}
                    label={label.name}
                    variant={
                      label.color ? hex_to_variant(label.color) : "neutral"
                    }
                  />
                ))}
              {snoozed_until && (
                <SnoozeBadge
                  className="flex-shrink-0"
                  snoozed_until={snoozed_until}
                />
              )}
            </div>
            <span className="text-xs flex-shrink-0 whitespace-nowrap text-txt-muted">
              {format_email_detail(new Date(email.timestamp))}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Popover>
              <PopoverTrigger asChild>
                <button className="text-xs hover:text-[var(--text-secondary)] transition-colors text-left text-txt-muted">
                  to {t("common.me")} &#9660;
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-80 p-3 text-xs space-y-2 bg-surf-primary border-edge-primary"
                side="bottom"
              >
                <div className="flex">
                  <span className="w-14 flex-shrink-0 font-medium text-txt-muted">
                    {t("common.from_label")}
                  </span>
                  <span className="text-txt-secondary">
                    {email.sender ? `${email.sender} ` : ""}
                    <button
                      className="hover:underline text-txt-muted"
                      onClick={() =>
                        copy_to_clipboard(email.sender_email, t("common.email"))
                      }
                    >
                      &lt;{email.sender_email}&gt;
                    </button>
                  </span>
                </div>
                <div className="flex items-start">
                  <span className="w-14 flex-shrink-0 font-medium pt-0.5 text-txt-muted">
                    {t("common.to_label")}
                  </span>
                  <span className="flex-1 flex flex-wrap items-center gap-1 text-txt-secondary">
                    {email.to.length > 0
                      ? email.to.map((r, i) => (
                          <span
                            key={r.email || i}
                            className="inline-flex items-center gap-1"
                          >
                            <ProfileAvatar
                              use_domain_logo
                              email={r.email}
                              name={r.name || ""}
                              size="xs"
                            />
                            <span>
                              {r.name || r.email || t("common.unknown")}
                            </span>
                            {i < email.to.length - 1 && <span>,</span>}
                          </span>
                        ))
                      : t("common.me")}
                  </span>
                </div>
                {email.cc.length > 0 && (
                  <div className="flex items-start">
                    <span className="w-14 flex-shrink-0 font-medium pt-0.5 text-txt-muted">
                      {t("common.cc_label")}
                    </span>
                    <span className="flex-1 flex flex-wrap items-center gap-1 text-txt-secondary">
                      {email.cc.map((r, i) => (
                        <span
                          key={r.email || i}
                          className="inline-flex items-center gap-1"
                        >
                          <ProfileAvatar
                            use_domain_logo
                            email={r.email}
                            name={r.name || ""}
                            size="xs"
                          />
                          <span>
                            {r.name || r.email || t("common.unknown")}
                          </span>
                          {i < email.cc.length - 1 && <span>,</span>}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
                {email.bcc.length > 0 && (
                  <div className="flex items-start">
                    <span className="w-14 flex-shrink-0 font-medium pt-0.5 text-txt-muted">
                      {t("common.bcc_label")}
                    </span>
                    <span className="flex-1 flex flex-wrap items-center gap-1 text-txt-secondary">
                      {email.bcc.map((r, i) => (
                        <span
                          key={r.email || i}
                          className="inline-flex items-center gap-1"
                        >
                          <ProfileAvatar
                            use_domain_logo
                            email={r.email}
                            name={r.name || ""}
                            size="xs"
                          />
                          <span>
                            {r.name || r.email || t("common.unknown")}
                          </span>
                          {i < email.bcc.length - 1 && <span>,</span>}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
                <div className="flex">
                  <span className="w-14 flex-shrink-0 font-medium text-txt-muted">
                    {t("common.date_label")}
                  </span>
                  <span className="text-txt-secondary">
                    {format_email_detail(new Date(email.timestamp))}
                  </span>
                </div>
                <div className="flex">
                  <span className="w-14 flex-shrink-0 font-medium text-txt-muted">
                    {t("common.subject_label")}
                  </span>
                  <span className="text-txt-secondary">{email.subject}</span>
                </div>
              </PopoverContent>
            </Popover>
            {(mail_item?.thread_message_count ?? thread_messages.length) >
              1 && (
              <span className="text-xs text-txt-muted">
                {mail_item?.thread_message_count ?? thread_messages.length}{" "}
                messages
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

interface ViewerUnsubscribeBannerProps {
  email: Pick<
    DecryptedEmail,
    "id" | "sender" | "sender_email" | "unsubscribe_info"
  >;
}

export function ViewerUnsubscribeBanner({
  email,
}: ViewerUnsubscribeBannerProps): React.ReactElement | null {
  const { t } = use_i18n();
  const { handle_external_link } = use_external_link();
  const [status, set_status] = React.useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [dismissed, set_dismissed] = React.useState(false);

  React.useEffect(() => {
    set_dismissed(false);
    set_status("idle");
  }, [email.id]);

  if (dismissed) return null;
  if (!email.unsubscribe_info?.has_unsubscribe) return null;
  if (is_system_email(email.sender_email)) return null;

  const info = email.unsubscribe_info;

  const display_text =
    status === "loading"
      ? t("settings.unsubscribing")
      : status === "success"
        ? t("common.unsubscribed_successfully")
        : status === "error"
          ? t("common.unsubscribe_error_manual")
          : info.method === "one-click"
            ? t("common.one_click_unsubscribe_available")
            : info.method === "mailto"
              ? t("common.email_unsubscribe_available")
              : t("common.unsubscribe_link_available");

  const handle_unsubscribe = async () => {
    const { confirm_unsubscribe } = await import(
      "@/components/modals/unsubscribe_confirmation_modal"
    );
    const confirm_kind =
      info.method === "one-click"
        ? "one_click"
        : info.method === "mailto"
          ? "mailto"
          : "url";
    const confirm_destination =
      info.unsubscribe_link ||
      info.unsubscribe_mailto ||
      info.list_unsubscribe_header ||
      "";

    if (!confirm_destination) {
      return;
    }

    const confirmed = await confirm_unsubscribe(
      confirm_kind,
      confirm_destination,
      email.sender,
    );

    if (!confirmed) return;

    set_status("loading");

    try {
      const { track_subscription, unsubscribe } = await import(
        "@/services/api/subscriptions"
      );

      const track_result = await track_subscription({
        sender_email: email.sender_email,
        sender_name: email.sender,
        unsubscribe_link: info.unsubscribe_link,
        list_unsubscribe_header: info.list_unsubscribe_header,
      });

      if (!track_result.data?.subscription_id) {
        set_status("error");

        return;
      }

      const method =
        info.method === "one-click" || info.list_unsubscribe_header
          ? "list_unsubscribe"
          : info.unsubscribe_link
            ? "link"
            : "manual";

      const result = await unsubscribe(
        track_result.data.subscription_id,
        method as "auto" | "list_unsubscribe" | "link" | "manual",
      );

      set_status(result.data?.success ? "success" : "error");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_status("error");
    }
  };

  return (
    <div className="mb-4">
      <div className="rounded-lg bg-surf-tertiary text-txt-secondary border border-edge-primary">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <EnvelopeIcon
              className="w-5 h-5 flex-shrink-0"
              style={{
                color:
                  status === "success"
                    ? "var(--success-color, #22c55e)"
                    : "var(--text-tertiary)",
              }}
            />
            <span className="text-sm">{display_text}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {status === "idle" &&
              (info.unsubscribe_link ||
                info.unsubscribe_mailto ||
                info.list_unsubscribe_header) && (
                <button
                  className="rounded-md px-3 py-1 text-sm font-medium transition-colors bg-brand text-white"
                  type="button"
                  onClick={handle_unsubscribe}
                >
                  {t("mail.unsubscribe")}
                </button>
              )}
            {status === "error" && info.unsubscribe_link && (
              <button
                className="rounded-md px-3 py-1 text-sm font-medium transition-colors bg-brand text-white"
                type="button"
                onClick={() => handle_external_link(info.unsubscribe_link!)}
              >
                {t("common.open_link")}
              </button>
            )}
            <button
              className="p-1 rounded-md transition-colors text-txt-muted"
              title={t("common.dismiss")}
              type="button"
              onClick={() => set_dismissed(true)}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ViewerThreadContentProps {
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
  on_toggle_message_read: (message_id: string) => void;
  on_edit_thread_draft?: (draft: DraftWithContent) => void;
  on_thread_draft_deleted?: () => void;
  external_content_mode?: "always";
  on_external_content_detected?: (report: ExternalContentReport) => void;
  thread_sanitized?: Map<string, PreloadedSanitizedContent>;
  size_bytes?: number;
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
  on_edit_thread_draft,
  on_thread_draft_deleted,
  external_content_mode,
  on_external_content_detected,
  thread_sanitized,
  size_bytes,
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
    const handle_kb_reply = () => {
      if (thread_messages.length === 0) return;
      const last = thread_messages[thread_messages.length - 1];

      if (!is_system_email(last.sender_email)) {
        set_inline_reply_msg(last);
      }
    };

    window.addEventListener("astermail:keyboard-reply", handle_kb_reply);

    return () =>
      window.removeEventListener("astermail:keyboard-reply", handle_kb_reply);
  }, [thread_messages]);

  return (
    <div className="mt-4">
      <ThreadMessagesList
        key={email.id}
        ref={thread_list_ref as React.Ref<ThreadMessagesListRef>}
        hide_counter
        hide_expand_collapse
        current_user_email={current_user_email}
        default_expanded_id={email.id}
        external_content_mode={external_content_mode}
        force_all_dark_mode={preferences.force_dark_mode_emails}
        inline_mode={inline_mode}
        inline_reply_is_external={is_external_thread}
        inline_reply_msg={inline_reply_msg}
        inline_reply_thread_token={email.thread_token}
        messages={thread_messages}
        on_archive={on_archive}
        on_close_inline_reply={handle_close_inline_reply}
        on_external_content_detected={on_external_content_detected}
        on_forward={handle_inline_forward}
        on_not_spam={on_not_spam}
        on_print={on_print}
        on_reply={handle_inline_reply}
        on_reply_all={handle_inline_reply_all}
        on_report_phishing={on_report_phishing}
        on_set_inline_mode={handle_set_inline_mode}
        on_toggle_message_read={on_toggle_message_read}
        on_trash={on_trash}
        on_view_source={on_view_source}
        preloaded_sanitized={thread_sanitized}
        size_bytes={size_bytes}
        subject={email.subject}
      />

      {thread_draft &&
        !sending_message &&
        on_edit_thread_draft &&
        !inline_reply_msg && (
          <ThreadDraftBadge
            current_user_email={current_user_email}
            current_user_name={current_user_name ?? ""}
            draft={thread_draft}
            on_deleted={on_thread_draft_deleted ?? (() => {})}
            on_edit={on_edit_thread_draft}
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

interface ViewerViewSourceProps {
  view_source_message: DecryptedThreadMessage | null;
  on_close: () => void;
}

export function ViewerViewSource({
  view_source_message,
  on_close,
}: ViewerViewSourceProps): React.ReactElement {
  return (
    <ViewSourceModal
      html_body={view_source_message?.body ?? ""}
      is_open={!!view_source_message}
      message_id={view_source_message?.id ?? ""}
      on_close={on_close}
    />
  );
}

interface ViewerErrorStateProps {
  error: string | null;
  on_dismiss: () => void;
  show_back_button?: boolean;
}

export function ViewerErrorState({
  error,
  on_dismiss,
  show_back_button = false,
}: ViewerErrorStateProps): React.ReactElement {
  const { t } = use_i18n();

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center">
        <NoSymbolIcon className="w-12 h-12 mx-auto mb-3 text-txt-muted" />
        <p className="text-sm text-txt-muted">
          {error || t("common.failed_to_load_email")}
        </p>
        {show_back_button && (
          <button
            className="mt-4 px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-surf-secondary text-txt-primary"
            onClick={on_dismiss}
          >
            Back to Inbox
          </button>
        )}
      </div>
    </div>
  );
}
