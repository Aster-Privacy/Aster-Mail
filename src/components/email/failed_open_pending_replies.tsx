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
import { useMemo } from "react";
import { SignalSlashIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { strip_html_tags } from "@/lib/html_text";
import { use_pending_reply_version } from "@/hooks/pending_reply_messages";
import { pending_replies_for_failed_open } from "@/components/email/hooks/offline_reopen";
import { PendingSendStatus } from "@/components/email/pending_send_status";

interface FailedOpenPendingRepliesProps {
  email_id: string | null | undefined;
  thread_token: string | null | undefined;
}

export function FailedOpenPendingReplies({
  email_id,
  thread_token,
}: FailedOpenPendingRepliesProps) {
  const { t } = use_i18n();
  const store_version = use_pending_reply_version();
  const replies = useMemo(
    () =>
      email_id ? pending_replies_for_failed_open(email_id, thread_token) : [],
    [email_id, thread_token, store_version],
  );

  if (replies.length === 0) return null;

  return (
    <div className="mx-auto mt-6 flex w-[36rem] max-w-full flex-col gap-2 text-left">
      {replies.map((reply) => {
        const recipients = (reply.to_recipients ?? [])
          .map((recipient) => recipient.name || recipient.email)
          .join(", ");

        return (
          <div
            key={reply.id}
            className="rounded-xl border border-edge-primary bg-surf-secondary px-4 pt-3"
            data-testid="failed-open-pending-reply"
          >
            <p className="text-sm font-medium text-txt-primary">
              {reply.sender_name || reply.sender_email}
            </p>
            {recipients && (
              <p className="truncate text-xs text-txt-muted">
                {t("mail.to_recipients_prefix", { recipients })}
              </p>
            )}
            <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm text-txt-secondary">
              {strip_html_tags(reply.html_content || reply.body)}
            </p>
            <div className="mt-2">
              <PendingSendStatus message_id={reply.id} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function OfflineCopyNotice() {
  const { t } = use_i18n();

  return (
    <div
      aria-live="polite"
      className="flex items-center gap-2 border-b border-edge-primary px-4 py-2 text-xs text-txt-muted"
      role="status"
    >
      <SignalSlashIcon className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="min-w-0">{t("mail.offline_saved_copy")}</span>
    </div>
  );
}
