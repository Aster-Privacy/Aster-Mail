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

import { useMemo, useState } from "react";
import {
  ArrowDownTrayIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";

import { trigger_download } from "@/utils/download_blob";
import { copy_text_or_throw } from "@/utils/copy_text";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
} from "@/components/ui/modal";
import { EncryptionInfoDropdown } from "@/components/common/encryption_info_dropdown";
import { format_bytes } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";
import { use_date_format } from "@/hooks/use_date_format";
import { show_toast } from "@/components/toast/simple_toast";
import { resolve_received_on_address } from "@/utils/delivered_to";
import {
  format_raw_headers,
  get_message_id,
} from "@/utils/message_header_details";
import {
  DetailsRow,
  EmailAuthDetails,
  HeadersBox,
  HeadersViewToggle,
  MailingListValue,
  ReplyToValue,
  get_header_insights,
  type HeadersViewMode,
} from "@/components/email/message_details_sections";

interface MessageDetailsModalProps {
  is_open: boolean;
  on_close: () => void;
  message: DecryptedThreadMessage;
  size_bytes?: number;
}

export function MessageDetailsModal({
  is_open,
  on_close,
  message,
  size_bytes,
}: MessageDetailsModalProps): React.ReactElement | null {
  const { t } = use_i18n();
  const { format_full_datetime } = use_date_format();

  const [headers_mode, set_headers_mode] =
    useState<HeadersViewMode>("formatted");
  const headers = useMemo(
    () => format_raw_headers(message.raw_headers),
    [message.raw_headers],
  );
  const message_id = useMemo(
    () => get_message_id(message.raw_headers),
    [message.raw_headers],
  );
  const is_received = message.item_type === "received";
  const sender_email = message.display_sender_email ?? message.sender_email;
  const insights = useMemo(
    () =>
      get_header_insights(message.raw_headers, message, message.sender_email),
    [message],
  );

  if (!is_open) return null;

  const handle_copy_headers = () => {
    if (!headers) return;
    copy_text_or_throw(headers)
      .then(() => {
        show_toast(t("mail.headers_copied"), "success");
      })
      .catch(() => show_toast(t("common.failed_to_copy"), "error"));
  };

  const handle_download_headers = () => {
    if (!headers) return;
    const safe_id = message.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);

    trigger_download(
      new Blob([headers], { type: "text/plain;charset=utf-8" }),
      `headers-${safe_id}.txt`,
    );
  };

  return (
    <Modal is_open={is_open} on_close={on_close} size="2xl">
      <ModalHeader>
        <ModalTitle>{t("mail.message_details")}</ModalTitle>
      </ModalHeader>
      <ModalBody className="space-y-2.5 text-sm">
        <div className="flex">
          <span className="min-w-24 flex-shrink-0 whitespace-nowrap pe-2 font-medium text-txt-muted">
            {t("common.from_label")}
          </span>
          <span className="min-w-0 text-txt-secondary break-words">
            {message.display_sender_name ?? message.sender_name} &lt;
            {message.display_sender_email ?? message.sender_email}&gt;
          </span>
        </div>

        {insights.reply_to && (
          <DetailsRow label={t("mail.reply_to_label")} variant="desktop">
            <ReplyToValue {...insights.reply_to} />
          </DetailsRow>
        )}

        {message.to_recipients && message.to_recipients.length > 0 && (
          <div className="flex">
            <span className="min-w-24 flex-shrink-0 whitespace-nowrap pe-2 font-medium text-txt-muted">
              {t("common.to_label")}
            </span>
            <span className="min-w-0 text-txt-secondary break-words">
              {message.to_recipients
                .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
                .join(", ")}
            </span>
          </div>
        )}

        {message.cc_recipients && message.cc_recipients.length > 0 && (
          <div className="flex">
            <span className="min-w-24 flex-shrink-0 whitespace-nowrap pe-2 font-medium text-txt-muted">
              {t("common.cc_label")}
            </span>
            <span className="min-w-0 text-txt-secondary break-words">
              {message.cc_recipients
                .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
                .join(", ")}
            </span>
          </div>
        )}

        {message.bcc_recipients && message.bcc_recipients.length > 0 && (
          <div className="flex">
            <span className="min-w-24 flex-shrink-0 whitespace-nowrap pe-2 font-medium text-txt-muted">
              {t("common.bcc_label")}
            </span>
            <span className="min-w-0 text-txt-secondary break-words">
              {message.bcc_recipients
                .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
                .join(", ")}
            </span>
          </div>
        )}

        {(() => {
          const received_on =
            message.item_type === "received"
              ? resolve_received_on_address(message)
              : undefined;

          return received_on ? (
            <div className="flex">
              <span className="min-w-24 flex-shrink-0 whitespace-nowrap pe-2 font-medium text-txt-muted">
                {t("common.received_on_label")}
              </span>
              <span className="min-w-0 text-txt-secondary break-words">
                {received_on}
              </span>
            </div>
          ) : null;
        })()}

        <div className="flex">
          <span className="min-w-24 flex-shrink-0 whitespace-nowrap pe-2 font-medium text-txt-muted">
            {t("common.date_label")}
          </span>
          <span className="text-txt-secondary">
            {format_full_datetime(new Date(message.timestamp))}
          </span>
        </div>

        <div className="flex">
          <span className="min-w-24 flex-shrink-0 whitespace-nowrap pe-2 font-medium text-txt-muted">
            {t("common.subject_label")}
          </span>
          <span className="min-w-0 text-txt-secondary break-words" dir="auto">
            {message.subject || t("mail.no_subject")}
          </span>
        </div>

        {insights.mailing_list && (
          <DetailsRow label={t("mail.mailing_list_label")} variant="desktop">
            <MailingListValue {...insights.mailing_list} />
          </DetailsRow>
        )}

        {message_id && (
          <div className="flex">
            <span className="min-w-24 flex-shrink-0 whitespace-nowrap pe-2 font-medium text-txt-muted">
              {t("mail.message_id_label")}
            </span>
            <span className="min-w-0 text-txt-secondary break-all font-mono text-xs">
              {message_id}
            </span>
          </div>
        )}

        {size_bytes != null && size_bytes > 0 && (
          <div className="flex">
            <span className="min-w-24 flex-shrink-0 whitespace-nowrap pe-2 font-medium text-txt-muted">
              {t("mail.size_label")}
            </span>
            <span className="text-txt-secondary">
              {format_bytes(size_bytes)}
            </span>
          </div>
        )}

        <div className="flex items-center">
          <span className="min-w-24 flex-shrink-0 whitespace-nowrap pe-2 font-medium text-txt-muted">
            {t("mail.encryption_label")}
          </span>
          <EncryptionInfoDropdown
            e2e_verified={!!message.e2e_verified}
            has_pq_protection={false}
            has_recipient_key={message.has_recipient_key}
            is_external={message.is_external}
            label={
              (!message.is_external || message.has_recipient_key) &&
              message.e2e_verified
                ? t("mail.zero_access_encrypted")
                : t("common.protected_in_transit")
            }
            sender_verification={message.sender_verification}
            size={14}
          />
        </div>

        {is_received && (
          <section className="mt-3 space-y-2.5 border-t border-edge-primary pt-3">
            <h4 className="text-sm font-medium text-txt-primary">
              {t("mail.authentication_section")}
            </h4>
            <EmailAuthDetails
              results={message}
              sender_email={sender_email}
              variant="desktop"
            />
            {insights.signed_by && (
              <DetailsRow label={t("mail.signed_by_label")} variant="desktop">
                <bdi dir="ltr">{insights.signed_by}</bdi>
              </DetailsRow>
            )}
            {insights.mailed_by && (
              <DetailsRow label={t("mail.mailed_by_label")} variant="desktop">
                <bdi dir="ltr">{insights.mailed_by}</bdi>
              </DetailsRow>
            )}
          </section>
        )}

        <div className="pt-3 mt-3 border-t border-edge-primary">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-txt-primary text-sm">
              {t("mail.message_headers")}
            </span>
            {headers && (
              <div className="flex items-center gap-1.5">
                <HeadersViewToggle
                  mode={headers_mode}
                  on_change={set_headers_mode}
                />
                <button
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-txt-muted hover:bg-surf-hover hover:text-txt-secondary"
                  type="button"
                  onClick={handle_copy_headers}
                >
                  <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                  {t("mail.copy_headers")}
                </button>
                <button
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-txt-muted hover:bg-surf-hover hover:text-txt-secondary"
                  type="button"
                  onClick={handle_download_headers}
                >
                  <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                  {t("mail.download_headers")}
                </button>
              </div>
            )}
          </div>
          {headers ? (
            <HeadersBox
              className="max-h-[max(250px,calc(100dvh-34rem))]"
              mode={headers_mode}
              raw_headers={message.raw_headers}
              text={headers}
            />
          ) : (
            <p className="rounded-lg bg-[var(--bg-tertiary,var(--surf-tertiary))] p-3 text-xs text-txt-muted">
              {t("mail.no_raw_headers")}
            </p>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
