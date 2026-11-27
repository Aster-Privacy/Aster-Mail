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
import type { TranslationKey } from "@/lib/i18n/types";

import {
  ArrowUpCircleIcon,
  ExclamationCircleIcon,
  SignalSlashIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  retry_pending_reply,
  use_pending_reply_status,
} from "@/hooks/pending_reply_messages";
import {
  cancel_undo_send,
  undo_send_manager,
  type PendingSend,
} from "@/hooks/use_undo_send";
import { undo_action_toast_by_key } from "@/components/toast/action_toast";
import {
  plan_undo_send_result,
  undo_send_toast_key,
} from "@/components/toast/undo_send_result";
import { show_toast } from "@/components/toast/simple_toast";
import { ignore_error } from "@/lib/ignore_error";

interface PendingSendStatusProps {
  message_id: string;
}

const STATUS_ENTER = { duration: 0.18, ease: [0.2, 0, 0, 1] as const };

function find_undoable_send(
  sends: PendingSend[],
  message_id: string,
  now: number,
): PendingSend | null {
  return (
    sends.find(
      (pending) =>
        pending.optimistic_id === message_id &&
        !pending.is_in_flight &&
        pending.scheduled_time > now,
    ) ?? null
  );
}

export function use_undoable_send(message_id: string): PendingSend | null {
  const [sends, set_sends] = useState<PendingSend[]>(() =>
    undo_send_manager.get_all(),
  );
  const [now, set_now] = useState(() => Date.now());

  useEffect(() => undo_send_manager.subscribe(set_sends), []);

  const undoable = find_undoable_send(sends, message_id, now);

  useEffect(() => {
    if (!undoable) return;

    const timer = window.setTimeout(
      () => set_now(Date.now()),
      Math.max(0, undoable.scheduled_time - Date.now()) + 50,
    );

    return () => window.clearTimeout(timer);
  }, [undoable]);

  return undoable && undoable.scheduled_time > Date.now() ? undoable : null;
}

async function undo_pending_send(
  send_id: string,
  translate: (key: TranslationKey) => string,
): Promise<void> {
  if (await undo_action_toast_by_key(undo_send_toast_key(send_id))) return;

  const outcome = await cancel_undo_send(send_id);
  const plan = plan_undo_send_result(outcome, !!undo_send_manager.get(send_id));

  if (plan) show_toast(translate(plan.message_key), "error");
}

export function PendingSendStatus({ message_id }: PendingSendStatusProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const status = use_pending_reply_status(message_id);
  const undoable = use_undoable_send(message_id);
  const [is_undoing, set_is_undoing] = useState(false);
  const undo_in_flight_ref = useRef(false);
  const undoable_id = undoable?.id ?? null;

  const handle_undo = useCallback(() => {
    if (!undoable_id || undo_in_flight_ref.current) return;
    undo_in_flight_ref.current = true;
    set_is_undoing(true);
    undo_pending_send(undoable_id, t)
      .catch((caught) =>
        ignore_error("components/email/pending_send_status:undo", caught),
      )
      .finally(() => {
        undo_in_flight_ref.current = false;
        set_is_undoing(false);
      });
  }, [undoable_id, t]);

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
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center"
          data-testid="pending-send-icon"
          transition={
            pulse
              ? { duration: 1.4, ease: "easeInOut", repeat: Infinity }
              : { duration: 0.2 }
          }
        >
          <Icon className="block h-3.5 w-3.5 -translate-y-px" />
        </motion.span>
        <motion.span
          key={status.phase}
          animate={{ opacity: 1 }}
          className="block min-w-0 truncate leading-4"
          initial={{ opacity: reduce_motion ? 1 : 0.35 }}
          title={is_failed && status.error ? status.error : undefined}
          transition={reduce_motion ? { duration: 0 } : STATUS_ENTER}
        >
          {label}
        </motion.span>
        {is_sending && undoable && (
          <button
            className="flex flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-[var(--accent-color)] outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent-color)_60%,transparent)] disabled:opacity-50"
            data-testid="pending-send-undo"
            disabled={is_undoing}
            type="button"
            onClick={handle_undo}
          >
            {t("common.undo")}
          </button>
        )}
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
