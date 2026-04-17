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
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { is_system_email } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";

interface ThreadMessageActionsProps {
  message: DecryptedThreadMessage;
  on_reply?: (message: DecryptedThreadMessage) => void;
  on_reply_all?: (message: DecryptedThreadMessage) => void;
  on_forward?: (message: DecryptedThreadMessage) => void;
}

export function ThreadMessageActions({
  message,
  on_reply,
  on_reply_all,
  on_forward,
}: ThreadMessageActionsProps): React.ReactElement | null {
  const { t } = use_i18n();

  const total_recipients =
    (message.to_recipients?.length ?? 0) + (message.cc_recipients?.length ?? 0);
  const show_reply_all = on_reply_all && total_recipients >= 2;

  if (!on_reply && !show_reply_all && !on_forward) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-3 @md:px-4 py-3 border-t border-[var(--thread-card-border)] bg-[var(--thread-content-bg)]">
      {on_reply && (
        <Button
          className={`gap-1.5 ${is_system_email(message.sender_email) ? "opacity-50 pointer-events-none" : ""}`}
          size="md"
          onClick={() => on_reply(message)}
        >
          <ArrowUturnLeftIcon className="w-4 h-4" />
          {t("mail.reply")}
        </Button>
      )}
      {show_reply_all && (
        <Button
          className={`gap-1.5 ${is_system_email(message.sender_email) ? "opacity-50 pointer-events-none" : ""}`}
          size="md"
          variant="outline"
          onClick={() => on_reply_all(message)}
        >
          <ArrowUturnLeftIcon className="w-4 h-4" />
          {t("mail.reply_all")}
        </Button>
      )}
      {on_forward && (
        <Button
          className="gap-1.5"
          size="md"
          variant="outline"
          onClick={() => on_forward(message)}
        >
          <ArrowUturnRightIcon className="w-4 h-4" />
          {t("mail.forward")}
        </Button>
      )}
    </div>
  );
}
