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
import {
  ArrowUpCircleIcon,
  ExclamationCircleIcon,
  SignalSlashIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  retry_pending_reply,
  use_pending_reply_status,
} from "@/hooks/pending_reply_messages";

interface PendingSendStatusProps {
  message_id: string;
}

const STATUS_ENTER = { duration: 0.18, ease: [0.2, 0, 0, 1] as const };

export function PendingSendStatus({ message_id }: PendingSendStatusProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const status = use_pending_reply_status(message_id);

  if (!status || status.phase === "sent") return null;

  const is_failed = status.phase === "failed";
  const is_offline = status.phase === "offline";
  const is_sending = status.phase === "sending";
  const label = is_failed
    ? t("mail.pending_send_failed")
    : is_offline
      ? t("mail.pending_send_offline")
      : t("common.sending");
  const Icon = is_failed
    ? ExclamationCircleIcon
    : is_offline
      ? SignalSlashIcon
      : ArrowUpCircleIcon;
  const pulse = is_sending && !reduce_motion;

  return (
    <div
      aria-live="polite"
      className="pb-2"
      data-pending-send-phase={status.phase}
      role="status"
    >
      <div
        className={`flex min-h-5 items-center gap-1.5 text-xs ${is_failed ? "text-[var(--color-danger)]" : "text-txt-muted"}`}
      >
        <motion.span
          animate={{ opacity: pulse ? [1, 0.35, 1] : 1 }}
          className="flex flex-shrink-0"
          transition={
            pulse
              ? { duration: 1.4, ease: "easeInOut", repeat: Infinity }
              : { duration: 0.2 }
          }
        >
          <Icon className="w-3.5 h-3.5" />
        </motion.span>
        <motion.span
          key={status.phase}
          animate={{ opacity: 1 }}
          className="block min-w-0 truncate"
          initial={{ opacity: reduce_motion ? 1 : 0.35 }}
          title={is_failed && status.error ? status.error : undefined}
          transition={reduce_motion ? { duration: 0 } : STATUS_ENTER}
        >
          {label}
        </motion.span>
        {status.can_retry && (
          <button
            className="flex flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-[var(--accent-color)] outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent-color)_60%,transparent)]"
            type="button"
            onClick={() => retry_pending_reply(message_id)}
          >
            {t("common.retry")}
          </button>
        )}
      </div>
    </div>
  );
}
