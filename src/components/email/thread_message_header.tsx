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

import {
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";

interface ThreadMessageHeaderProps {
  message: DecryptedThreadMessage;
  is_own_message: boolean;
  format_email_detail: (date: Date) => string;
}

export function ThreadMessageHeader({
  message,
  is_own_message,
  format_email_detail,
}: ThreadMessageHeaderProps): React.ReactElement {
  const { t } = use_i18n();

  return (
    <div className="flex items-start justify-between gap-2 px-3 @md:px-4 py-3 bg-[var(--thread-header-bg)]">
      <div className="flex flex-col gap-1 text-sm min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-txt-muted">{t("mail.to_label")}</span>
          {is_own_message ? (
            <div className="flex items-center gap-1 flex-wrap">
              {message.to_recipients && message.to_recipients.length > 0 ? (
                message.to_recipients.map((r, idx) => (
                  <button
                    key={r.email}
                    className="inline-flex items-center gap-1 cursor-pointer text-txt-secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard
                        .writeText(r.email)
                        .then(() => {
                          show_toast(t("common.email_copied"), "success");
                        })
                        .catch(() => {});
                    }}
                  >
                    <ProfileAvatar
                      use_domain_logo
                      email={r.email}
                      name={r.name || ""}
                      size="xs"
                    />
                    {r.name || r.email}
                    {idx < (message.to_recipients?.length ?? 0) - 1 && ","}
                  </button>
                ))
              ) : (
                <span className="text-txt-secondary">
                  {t("mail.unknown_recipient")}
                </span>
              )}
            </div>
          ) : (
            <span className="text-txt-secondary">{t("common.me")}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-xs @md:text-sm whitespace-nowrap text-txt-muted">
          {format_email_detail(new Date(message.timestamp))}
        </span>
        {message.send_status === "bounced" && (
          <span className="inline-flex items-center gap-1 text-xs text-red-500">
            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
            Bounced
          </span>
        )}
        {message.send_status === "failed" && (
          <span className="inline-flex items-center gap-1 text-xs text-red-500">
            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
            Failed
          </span>
        )}
        {message.send_status === "delivered" && (
          <span className="inline-flex items-center gap-1 text-xs text-green-500">
            <CheckCircleIcon className="h-3.5 w-3.5" />
            Delivered
          </span>
        )}
      </div>
    </div>
  );
}
