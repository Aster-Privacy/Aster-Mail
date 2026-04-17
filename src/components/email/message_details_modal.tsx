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

import { useMemo } from "react";
import {
  ArrowDownTrayIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";

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

interface MessageDetailsModalProps {
  is_open: boolean;
  on_close: () => void;
  message: DecryptedThreadMessage;
  size_bytes?: number;
}

function build_headers(message: DecryptedThreadMessage): string | null {
  if (message.raw_headers && message.raw_headers.length > 0) {
    return message.raw_headers.map((h) => `${h.name}: ${h.value}`).join("\n");
  }

  return null;
}

export function MessageDetailsModal({
  is_open,
  on_close,
  message,
  size_bytes,
}: MessageDetailsModalProps): React.ReactElement | null {
  const { t } = use_i18n();
  const { format_email_detail } = use_date_format();

  const headers = useMemo(() => build_headers(message), [message]);

  if (!is_open) return null;

  const handle_copy_headers = () => {
    if (!headers) return;
    navigator.clipboard
      .writeText(headers)
      .then(() => {
        show_toast(t("mail.headers_copied"), "success");
      })
      .catch(() => {});
  };

  const handle_download_headers = () => {
    if (!headers) return;
    const blob = new Blob([headers], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe_id = message.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);

    a.href = url;
    a.rel = "noopener";
    a.download = `headers-${safe_id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal is_open={is_open} on_close={on_close} size="lg">
      <ModalHeader>
        <ModalTitle>{t("mail.message_details")}</ModalTitle>
      </ModalHeader>
      <ModalBody className="space-y-2.5 text-sm">
        <div className="flex">
          <span className="w-24 flex-shrink-0 font-medium text-txt-muted">
            {t("common.from_label")}
          </span>
          <span className="min-w-0 text-txt-secondary break-words">
            {message.sender_name} &lt;{message.sender_email}&gt;
          </span>
        </div>

        {message.to_recipients && message.to_recipients.length > 0 && (
          <div className="flex">
            <span className="w-24 flex-shrink-0 font-medium text-txt-muted">
              {t("common.to_label")}
            </span>
            <span className="min-w-0 text-txt-secondary break-words">
              {message.to_recipients
                .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
                .join(", ")}
            </span>
          </div>
        )}

        <div className="flex">
          <span className="w-24 flex-shrink-0 font-medium text-txt-muted">
            {t("common.date_label")}
          </span>
          <span className="text-txt-secondary">
            {format_email_detail(new Date(message.timestamp))}
          </span>
        </div>

        <div className="flex">
          <span className="w-24 flex-shrink-0 font-medium text-txt-muted">
            {t("common.subject_label")}
          </span>
          <span className="min-w-0 text-txt-secondary break-words">
            {message.subject}
          </span>
        </div>

        <div className="flex">
          <span className="w-24 flex-shrink-0 font-medium text-txt-muted">
            {t("mail.message_id_label")}
          </span>
          <span className="min-w-0 text-txt-secondary break-all font-mono text-xs">
            &lt;{message.id}@astermail.org&gt;
          </span>
        </div>

        {size_bytes != null && size_bytes > 0 && (
          <div className="flex">
            <span className="w-24 flex-shrink-0 font-medium text-txt-muted">
              {t("mail.size_label")}
            </span>
            <span className="text-txt-secondary">
              {format_bytes(size_bytes)}
            </span>
          </div>
        )}

        <div className="flex items-center">
          <span className="w-24 flex-shrink-0 font-medium text-txt-muted">
            {t("mail.encryption_label")}
          </span>
          <EncryptionInfoDropdown
            has_pq_protection={false}
            has_recipient_key={message.has_recipient_key}
            is_external={message.is_external}
            label={
              message.is_external && !message.has_recipient_key
                ? t("common.protected_in_transit")
                : t("mail.zero_access_encrypted")
            }
            size={14}
          />
        </div>

        <div className="pt-3 mt-3 border-t border-edge-primary">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-txt-primary text-sm">
              {t("mail.message_headers")}
            </span>
            {headers && (
              <div className="flex items-center gap-1.5">
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
            <pre className="max-h-[250px] overflow-auto rounded-lg bg-[var(--bg-tertiary,var(--surf-tertiary))] p-3 text-xs leading-relaxed text-txt-secondary font-mono select-all">
              {headers}
            </pre>
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
