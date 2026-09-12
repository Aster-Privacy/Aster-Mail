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
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";

interface SendFailureBannerProps {
  send_status?: string;
  send_error?: string;
  className?: string;
}

export function SendFailureBanner({
  send_status,
  send_error,
  className,
}: SendFailureBannerProps) {
  const { t } = use_i18n();

  if (send_status !== "failed" && send_status !== "bounced") {
    return null;
  }

  const reason = send_error?.trim();

  return (
    <div
      className={`rounded-md bg-surface-2 border border-red-500/40 ${className ?? ""}`}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <ExclamationTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-txt leading-snug">
            {t("mail.send_failed_title")}
          </p>
          <p className="text-xs text-txt-muted mt-1 leading-snug">
            {t("mail.send_failed_help")}
          </p>
          {reason && (
            <p className="text-xs text-txt-muted mt-2 break-words font-mono leading-snug">
              {reason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
