import { useEffect, useMemo } from "react";
import { AnimatePresence } from "framer-motion";

import { UndoSendToast } from '@/components/toast/undo_send_toast';

import { use_undo_send } from "@/hooks/use_undo_send";

function get_is_mac(): boolean {
  if (typeof navigator === "undefined") return false;

  return navigator.platform.toUpperCase().indexOf("MAC") >= 0;
}

type ContainerPosition = "bottom-left" | "bottom-right" | "bottom-center";

interface UndoSendContainerProps {
  position?: ContainerPosition;
  max_visible?: number;
}

function get_position_classes(position: ContainerPosition): string {
  switch (position) {
    case "bottom-left":
      return "left-6 bottom-6";
    case "bottom-right":
      return "right-6 bottom-6";
    case "bottom-center":
      return "left-1/2 -translate-x-1/2 bottom-6";
  }
}

export function UndoSendContainer({
  position = "bottom-left",
  max_visible = 3,
}: UndoSendContainerProps) {
  const {
    pending_sends,
    cancel_send,
    send_immediately,
    get_time_remaining,
    remove_pending,
  } = use_undo_send();

  const is_mac = useMemo(() => get_is_mac(), []);

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
      aria-label="Pending email notifications"
      aria-live="polite"
      className={`fixed z-[100] flex flex-col-reverse gap-2 ${position_classes}`}
      role="region"
    >
      <AnimatePresence mode="popLayout">
        {visible_sends.map((pending) => {
          const time_remaining = get_time_remaining(pending.id);
          const recipient =
            pending.to.length > 0
              ? pending.to[0]
              : pending.cc?.[0] || pending.bcc?.[0] || "Unknown";

          return (
            <UndoSendToast
              key={pending.id}
              is_mac={is_mac}
              on_dismiss={() => remove_pending(pending.id)}
              on_send_now={() => send_immediately(pending.id)}
              on_undo={() => cancel_send(pending.id)}
              queue_id={pending.id}
              recipient={recipient}
              seconds_remaining={time_remaining}
              subject={pending.subject}
              total_seconds={pending.total_seconds}
            />
          );
        })}
      </AnimatePresence>
      {overflow_count > 0 && (
        <div
          className="text-xs px-3 py-1.5 rounded-full self-start"
          style={{
            backgroundColor: "var(--bg-secondary)",
            color: "var(--text-secondary)",
          }}
        >
          +{overflow_count} more pending
        </div>
      )}
    </div>
  );
}
