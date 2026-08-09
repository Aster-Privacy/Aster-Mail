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
import type { } from "@/services/api/multi_drafts";
import type { ExternalContentReport } from "@/lib/html_sanitizer";
import type { DecryptedEmail } from "@/components/email/use_email_viewer";
import type { } from "@/components/email/hooks/preload_cache";

import React, {    } from "react";

import { use_i18n } from "@/lib/i18n/context";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { BadgeChip } from "@/components/ui/badge_chip";
import { use_peer_profile } from "@/hooks/use_peer_profile";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EncryptionInfoDropdown } from "@/components/common/encryption_info_dropdown";
import { TrackingProtectionShield } from "@/components/email/tracking_protection_shield";
import { is_system_email } from "@/lib/utils";

import { OfficialBadge } from "@/components/email/official_badge";
import {
  EmailTag,
  hex_to_variant,
  type TagIconName,
} from "@/components/ui/email_tag";
import { EmailProfileTrigger } from "@/components/email/email_profile_trigger";
import { SnoozeBadge } from "@/components/ui/snooze_badge";
import { ExpirationCountdown } from "@/components/email/expiration_countdown";

export interface ViewerEmailHeaderProps {
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
  tracking_report?: ExternalContentReport | null;
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
  subject_class = "text-xl sm:text-2xl font-semibold truncate flex-1 min-w-0",
  avatar_class = "w-8 h-8 sm:w-10 sm:h-10",
  avatar_size = "lg",
  gap_class = "gap-3 sm:gap-4",
  email_button_hide_class = "hidden sm:inline",
  flex_wrap_class = "flex-wrap sm:flex-nowrap",
  tracking_report,
}: ViewerEmailHeaderProps): React.ReactElement {
  const { t } = use_i18n();
  const peer_profile = use_peer_profile(
    is_system_email(email.sender_email) ? null : email.sender_email,
  );
  const peer_badge = peer_profile?.active_badge ?? null;
  const show_sender_badge =
    (peer_profile?.show_badge_profile ?? false) && !!peer_badge;
  const display_sender =
    peer_profile?.display_name || email.display_sender_name || email.sender;
  const show_sender_email = email.display_sender_email ?? email.sender_email;

  return (
    <>
      {!hide_subject && (
        <div className="flex items-center gap-2 mb-6">
          <div className="flex items-center gap-1 flex-shrink-0">
            <EncryptionInfoDropdown
              has_pq_protection={has_pq_protection}
              has_recipient_key={has_recipient_key}
              is_external={is_external}
              sender_verification={email.sender_verification}
              size={encryption_size}
            />
            {tracking_report && (
              <TrackingProtectionShield
                report={tracking_report}
                size={encryption_size}
              />
            )}
          </div>
          <h1 className={`${subject_class} text-txt-primary`}>
            {email.subject || t("mail.no_subject")}
          </h1>
          {mail_item?.labels
            ?.filter((l) => l.name)
            .map((label) => (
              <EmailTag
                key={label.token}
                className="flex-shrink-0"
                custom_color={label.color}
                icon={(label.icon as TagIconName) || "folder"}
                label={label.name}
                variant={label.color ? hex_to_variant(label.color) : "neutral"}
              />
            ))}
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
          email={show_sender_email}
          image_url={peer_profile?.profile_picture ?? undefined}
          name={display_sender}
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
                name={display_sender}
              >
                <span className="text-txt-primary">{display_sender}</span>
              </EmailProfileTrigger>
              <OfficialBadge email={email.sender_email} size="md" />
              {show_sender_badge && peer_badge && (
                <BadgeChip
                  badge={peer_badge}
                  className="flex-shrink-0"
                  show_find_order={false}
                  size="sm"
                />
              )}
              <button
                className={`text-xs whitespace-nowrap ${email_button_hide_class} hover:underline transition-all text-txt-muted`}
                onClick={() =>
                  copy_to_clipboard(show_sender_email, t("common.email"))
                }
              >
                &lt;{show_sender_email}&gt;
              </button>
              {is_system_email(email.sender_email) && (
                <EmailTag
                  className="flex-shrink-0"
                  icon="info"
                  label={t("common.system")}
                  variant="blue"
                />
              )}
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
                  {t("common.to_recipient")} {t("common.me")} &#9660;
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-80 p-3 text-xs space-y-2 bg-surf-primary border-edge-primary"
                side="bottom"
              >
                <div className="flex">
                  <span className="min-w-14 flex-shrink-0 whitespace-nowrap pr-2 font-medium text-txt-muted">
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
                  <span className="min-w-14 flex-shrink-0 whitespace-nowrap pr-2 font-medium pt-0.5 text-txt-muted">
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
                    <span className="min-w-14 flex-shrink-0 whitespace-nowrap pr-2 font-medium pt-0.5 text-txt-muted">
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
                    <span className="min-w-14 flex-shrink-0 whitespace-nowrap pr-2 font-medium pt-0.5 text-txt-muted">
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
                  <span className="min-w-14 flex-shrink-0 whitespace-nowrap pr-2 font-medium text-txt-muted">
                    {t("common.date_label")}
                  </span>
                  <span className="text-txt-secondary">
                    {format_email_detail(new Date(email.timestamp))}
                  </span>
                </div>
                <div className="flex">
                  <span className="min-w-14 flex-shrink-0 whitespace-nowrap pr-2 font-medium text-txt-muted">
                    {t("common.subject_label")}
                  </span>
                  <span className="min-w-0 text-txt-secondary break-words">
                    {email.subject || t("mail.no_subject")}
                  </span>
                </div>
              </PopoverContent>
            </Popover>
            {(mail_item?.thread_message_count ?? thread_messages.length) >
              1 && (
              <span className="text-xs text-txt-muted">
                {t("mail.n_messages", {
                  count:
                    mail_item?.thread_message_count ?? thread_messages.length,
                })}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

