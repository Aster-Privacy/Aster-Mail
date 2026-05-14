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
import type { TranslationKey } from "@/lib/i18n";
import type { MailItem } from "@/services/api/mail";
import type { DecryptedEmail } from "@/components/email/hooks/use_popup_viewer";
import type { ExternalContentReport } from "@/lib/html_sanitizer";

import { useState, useMemo } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { show_toast } from "@/components/toast/simple_toast";
import { EncryptionInfoDropdown } from "@/components/common/encryption_info_dropdown";
import { TrackingProtectionShield } from "@/components/email/tracking_protection_shield";
import { ExpirationCountdown } from "@/components/email/expiration_countdown";
import { SnoozeBadge } from "@/components/ui/snooze_badge";
import {
  EmailTag,
  hex_to_variant,
  type TagIconName,
} from "@/components/ui/email_tag";
import { use_tags } from "@/hooks/use_tags";
import { is_system_email } from "@/lib/utils";
import { get_label_hints } from "@/stores/label_hints_store";

interface PopupEmailHeaderProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  email: DecryptedEmail;
  mail_item: MailItem | null;
  is_fullscreen: boolean;
  thread_messages: DecryptedThreadMessage[];
  timestamp_date: React.MutableRefObject<Date | null>;
  snoozed_until?: string;
  format_email_popup: (date: Date) => string;
  on_close: () => void;
  on_compose?: (email: string) => void;
  tracking_report?: ExternalContentReport | null;
  label_hints?: { token: string; name: string; color?: string; icon?: string; show_icon?: boolean }[];
}

export function PopupEmailHeader({
  t,
  email,
  mail_item,
  is_fullscreen,
  thread_messages,
  timestamp_date,
  snoozed_until,
  format_email_popup,
  on_close,
  on_compose,
  tracking_report,
  label_hints,
}: PopupEmailHeaderProps) {
  const [show_headers, set_show_headers] = useState(false);
  const { get_tag_by_token } = use_tags();
  const label_chips = useMemo(() => {
    const seen = new Set<string>();
    const from_item: { token: string; name: string; color?: string; icon?: string; show_icon: boolean }[] = [];
    for (const f of mail_item?.labels ?? []) {
      if (f.name && !seen.has(f.token)) {
        seen.add(f.token);
        from_item.push({ token: f.token, name: f.name, color: f.color as string | undefined, icon: f.icon, show_icon: true });
      }
    }
    for (const f of mail_item?.folders ?? []) {
      if (f.name && !seen.has(f.token)) {
        seen.add(f.token);
        from_item.push({ token: f.token, name: f.name, color: (f.color as string | undefined) || "#3b82f6", icon: f.icon || "folder", show_icon: true });
      }
    }
    for (const token of mail_item?.tag_tokens ?? []) {
      const tag = get_tag_by_token(token);
      if (tag?.name && !seen.has(token)) {
        seen.add(token);
        from_item.push({ token, name: tag.name, color: tag.color, icon: tag.icon, show_icon: true });
      }
    }
    const store_hints = get_label_hints(mail_item?.id ?? email.id);
    const resolved = from_item.length > 0 ? from_item : (label_hints?.length ? label_hints : store_hints);
    if (is_system_email(email.sender_email)) {
      return [{ token: "__system__", name: t("common.system"), color: "#3b82f6", icon: "info", show_icon: true }, ...resolved];
    }
    return resolved;
  }, [mail_item?.labels, mail_item?.folders, mail_item?.tag_tokens, mail_item?.id, label_hints, get_tag_by_token, email.id, email.sender_email, t]);

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1 flex-shrink-0">
          <EncryptionInfoDropdown
            has_pq_protection={!!mail_item?.ephemeral_pq_key}
            has_recipient_key={!!mail_item?.has_recipient_key}
            is_external={!!mail_item?.is_external}
            sender_verification={email.sender_verification}
            size={20}
          />
          {tracking_report && (
            <TrackingProtectionShield report={tracking_report} size={20} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 flex-1 min-w-0">
          <h1 className="text-lg font-semibold leading-snug break-words text-txt-primary">
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
        {email.expires_at && (
          <ExpirationCountdown expires_at={email.expires_at} size="sm" />
        )}
        <span className="text-sm flex-shrink-0 text-txt-muted">
          {email.timestamp}
        </span>
        {is_fullscreen && (
          <button
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex-shrink-0"
            onClick={on_close}
          >
            <XMarkIcon className="w-5 h-5 text-txt-muted" />
          </button>
        )}
      </div>

      {thread_messages.length > 1 && (
        <div className="flex items-start gap-3">
          <ProfileAvatar
            clickable
            use_domain_logo
            email={email.sender_email}
            name={email.sender}
            on_compose={on_compose}
            size="md"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-txt-primary">
                {email.sender}
              </span>
              {snoozed_until && (
                <SnoozeBadge
                  className="flex-shrink-0"
                  size="default"
                  snoozed_until={snoozed_until}
                />
              )}
            </div>

            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-xs text-txt-muted hover:text-txt-secondary transition-colors text-left max-w-[32ch] truncate">
                    {email.to.length > 0
                      ? `${t("common.to_label")} ${email.to
                          .map((r) => r.name || r.email)
                          .join(", ")}`
                      : t("common.to_me")}{" "}
                    &#x25BC;
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
                      onClick={() => {
                        navigator.clipboard
                          .writeText(email.sender_email)
                          .then(() => {
                            show_toast(t("common.email_copied"), "success");
                          })
                          .catch(() => {});
                      }}
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
                            <span>{r.name || r.email || t("common.unknown")}</span>
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
                          <span>{r.name || r.email || t("common.unknown")}</span>
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
                          <span>{r.name || r.email || t("common.unknown")}</span>
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
                    {timestamp_date.current
                      ? format_email_popup(timestamp_date.current)
                      : email.timestamp}
                  </span>
                </div>
                <div className="flex">
                  <span className="w-14 flex-shrink-0 font-medium text-txt-muted">
                    {t("common.subject_label")}
                  </span>
                  <span className="text-txt-secondary">{email.subject}</span>
                </div>
                {email.raw_headers && email.raw_headers.length > 0 && (
                  <>
                    <div className="border-t border-edge-primary pt-2 mt-1">
                      <button
                        className="text-xs text-accent-primary hover:text-accent-secondary transition-colors"
                        onClick={() => set_show_headers(!show_headers)}
                      >
                        {show_headers
                          ? t("mail.hide_headers")
                          : t("mail.show_headers")}
                      </button>
                    </div>
                    {show_headers && (
                      <div className="max-h-64 overflow-y-auto space-y-1.5 text-[11px] font-mono">
                        {email.raw_headers.map((header, index) => (
                          <div key={index} className="flex gap-2">
                            <span className="flex-shrink-0 font-semibold text-txt-muted whitespace-nowrap">
                              {header.name}:
                            </span>
                            <span className="text-txt-secondary break-all">
                              {header.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </PopoverContent>
            </Popover>
            {(mail_item?.thread_message_count ?? thread_messages.length) >
              1 && (
              <span className="text-xs text-txt-muted">
                {mail_item?.thread_message_count ?? thread_messages.length}{" "}
                {t("mail.messages_label")}
              </span>
            )}
          </div>
        </div>
      </div>
      )}
    </>
  );
}
