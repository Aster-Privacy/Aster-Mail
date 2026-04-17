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
import { useEffect, useMemo } from "react";
import { AnimatePresence } from "framer-motion";

import { UndoSendToast } from "@/components/toast/undo_send_toast";
import { use_undo_send } from "@/hooks/use_undo_send";
import { undo_send_manager as server_undo_manager } from "@/services/undo_send_manager";
import { is_mac_platform } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";

type ContainerPosition =
  | "bottom-left"
  | "bottom-right"
  | "bottom-center"
  | "top-left"
  | "top-right"
  | "top-center";

interface UndoSendContainerProps {
  position?: ContainerPosition;
  max_visible?: number;
  is_mobile?: boolean;
}

function get_position_classes(position: ContainerPosition): string {
  switch (position) {
    case "bottom-left":
      return "left-6 bottom-6";
    case "bottom-right":
      return "right-6 bottom-6";
    case "bottom-center":
      return "left-1/2 -translate-x-1/2 bottom-6";
    case "top-left":
      return "left-6";
    case "top-right":
      return "right-6";
    case "top-center":
      return "left-1/2 -translate-x-1/2";
  }
}

function is_top_position(position: ContainerPosition): boolean {
  return position.startsWith("top");
}

export function UndoSendContainer({
  position = "bottom-left",
  max_visible = 3,
  is_mobile = false,
}: UndoSendContainerProps) {
  const { t } = use_i18n();
  const { is_authenticated } = use_auth();
  const {
    pending_sends,
    cancel_send,
    send_immediately,
    get_time_remaining,
    remove_pending,
  } = use_undo_send();

  const is_mac = useMemo(() => is_mac_platform(), []);
  const is_top = is_top_position(position);

  useEffect(() => {
    if (is_authenticated) {
      server_undo_manager.sync_with_server().catch(() => {});
    }
  }, [is_authenticated]);

  useEffect(() => {
    const handle_keydown = (event: KeyboardEvent) => {
      const modifier_pressed = is_mac ? event.metaKey : event.ctrlKey;

      if (
        modifier_pressed &&
        event.key.toLowerCase() === "z" &&
        !event.shiftKey
      ) {
        if (pending_sends.length > 0) {
          event.preventDefault();
          const most_recent = pending_sends[pending_sends.length - 1];

          cancel_send(most_recent.id);
        }
      }
    };

    window.addEventListener("keydown", handle_keydown);

    return () => window.removeEventListener("keydown", handle_keydown);
  }, [pending_sends, cancel_send, is_mac]);

  const visible_sends = pending_sends.slice(0, max_visible);
  const overflow_count = Math.max(0, pending_sends.length - max_visible);
  const position_classes = get_position_classes(position);

  if (pending_sends.length === 0) {
    return null;
  }

  return (
    <div
      aria-label={t("common.pending_email_notifications")}
      aria-live="polite"
      className={`fixed z-[100] flex gap-2 ${is_top ? "flex-col" : "flex-col-reverse"} ${position_classes}`}
      role="region"
      style={
        is_top
          ? { top: `calc(env(safe-area-inset-top, 0px) + 12px)` }
          : undefined
      }
    >
      <AnimatePresence>
        {visible_sends.map((pending) => {
          const time_remaining = get_time_remaining(pending.id);
          const recipient =
            pending.to.length > 0
              ? pending.to[0]
              : pending.cc?.[0] ||
                pending.bcc?.[0] ||
                t("mail.unknown" as never);

          return (
            <UndoSendToast
              key={pending.id}
              bcc_list={pending.bcc}
              body={pending.body}
              cc_list={pending.cc}
              is_mac={is_mac}
              is_mobile={is_mobile}
              is_top={is_top}
              on_dismiss={() => remove_pending(pending.id)}
              on_send_now={() => send_immediately(pending.id)}
              on_undo={() => cancel_send(pending.id)}
              queue_id={pending.id}
              recipient={recipient}
              seconds_remaining={time_remaining}
              subject={pending.subject}
              to_list={pending.to}
              total_seconds={pending.total_seconds}
            />
          );
        })}
      </AnimatePresence>
      {overflow_count > 0 && (
        <div className="text-xs px-3 py-1.5 rounded-full self-start bg-surf-secondary text-txt-secondary">
          +{overflow_count} more pending
        </div>
      )}
    </div>
  );
}
