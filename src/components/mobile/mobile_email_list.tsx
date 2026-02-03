import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { StarIcon, CheckIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";

import { SwipeActions, type SwipeAction } from "./swipe_actions";

import { cn } from "@/lib/utils";
import {
  haptic_long_press,
  haptic_selection_feedback,
} from "@/native/haptic_feedback";

export interface MobileEmailItem {
  id: string;
  from_name: string;
  from_email: string;
  subject: string;
  snippet: string;
  timestamp: string | Date;
  is_read: boolean;
  is_starred: boolean;
  has_attachments?: boolean;
  labels?: Array<{ id: string; name: string; color: string }>;
}

interface MobileEmailListProps {
  emails: MobileEmailItem[];
  is_loading?: boolean;
  on_refresh?: () => Promise<void>;
  on_star?: (email_id: string, starred: boolean) => void;
  on_archive?: (email_id: string) => void;
  on_delete?: (email_id: string) => void;
  on_mark_read?: (email_id: string, read: boolean) => void;
  on_snooze?: (email_id: string) => void;
  selected_ids?: string[];
  on_selection_change?: (ids: string[]) => void;
  empty_message?: string;
  current_view?: string;
}

const LONG_PRESS_DURATION = 500;

export function MobileEmailList({
  emails,
  is_loading = false,
  on_refresh,
  on_star,
  on_archive,
  on_delete,
  on_mark_read,
  on_snooze,
  selected_ids = [],
  on_selection_change,
  empty_message = "No emails",
  current_view = "inbox",
}: MobileEmailListProps) {
  const navigate = useNavigate();
  const [refreshing, set_refreshing] = useState(false);
  const [pull_distance, set_pull_distance] = useState(0);
  const container_ref = useRef<HTMLDivElement>(null);
  const long_press_timer = useRef<NodeJS.Timeout | null>(null);
  const is_selection_mode = selected_ids.length > 0;

  const handle_pull_start = useCallback(() => {
    if (container_ref.current?.scrollTop === 0) {
      set_pull_distance(0);
    }
  }, []);

  const handle_pull_move = useCallback(
    (e: React.TouchEvent) => {
      if (
        !on_refresh ||
        refreshing ||
        (container_ref.current?.scrollTop ?? 0) > 0
      ) {
        return;
      }

      const touch = e.touches[0];
      const start_y = touch.clientY;
      const current_y = touch.clientY;
      const distance = Math.max(0, Math.min(100, current_y - start_y));

      set_pull_distance(distance);
    },
    [on_refresh, refreshing],
  );

  const handle_pull_end = useCallback(async () => {
    if (pull_distance > 60 && on_refresh && !refreshing) {
      set_refreshing(true);
      try {
        await on_refresh();
      } finally {
        set_refreshing(false);
      }
    }
    set_pull_distance(0);
  }, [pull_distance, on_refresh, refreshing]);

  const handle_email_click = useCallback(
    (email: MobileEmailItem) => {
      if (is_selection_mode) {
        handle_toggle_selection(email.id);
      } else {
        const email_ids = emails.map((e) => e.id);

        sessionStorage.setItem(
          "astermail_email_nav",
          JSON.stringify({ view: current_view, email_ids }),
        );
        navigate(`/email/${email.id}`, { state: { from_view: current_view } });
      }
    },
    [is_selection_mode, navigate, emails, current_view],
  );

  const handle_toggle_selection = useCallback(
    (email_id: string) => {
      if (!on_selection_change) return;

      haptic_selection_feedback();

      const new_selection = selected_ids.includes(email_id)
        ? selected_ids.filter((id) => id !== email_id)
        : [...selected_ids, email_id];

      on_selection_change(new_selection);
    },
    [selected_ids, on_selection_change],
  );

  const handle_long_press_start = useCallback(
    (email_id: string) => {
      if (!on_selection_change || is_selection_mode) return;

      long_press_timer.current = setTimeout(() => {
        haptic_long_press();
        on_selection_change([email_id]);
      }, LONG_PRESS_DURATION);
    },
    [on_selection_change, is_selection_mode],
  );

  const handle_long_press_end = useCallback(() => {
    if (long_press_timer.current) {
      clearTimeout(long_press_timer.current);
      long_press_timer.current = null;
    }
  }, []);

  const get_swipe_actions = useCallback(
    (email: MobileEmailItem): { left: SwipeAction[]; right: SwipeAction[] } => {
      return {
        left: [
          {
            id: "archive",
            label: "Archive",
            color: "#22c55e",
            icon: "archive",
            on_action: () => on_archive?.(email.id),
          },
          {
            id: "delete",
            label: "Delete",
            color: "#ef4444",
            icon: "trash",
            on_action: () => on_delete?.(email.id),
          },
        ],
        right: [
          {
            id: "read",
            label: email.is_read ? "Unread" : "Read",
            color: "#3b82f6",
            icon: email.is_read ? "envelope" : "envelope-open",
            on_action: () => on_mark_read?.(email.id, !email.is_read),
          },
          {
            id: "snooze",
            label: "Snooze",
            color: "#f59e0b",
            icon: "clock",
            on_action: () => on_snooze?.(email.id),
          },
        ],
      };
    },
    [on_archive, on_delete, on_mark_read, on_snooze],
  );

  const format_timestamp = (timestamp: string | Date): string => {
    const date =
      typeof timestamp === "string" ? new Date(timestamp) : timestamp;
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    } else {
      return date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "2-digit",
      });
    }
  };

  const get_avatar_initials = (name: string, email: string): string => {
    if (name) {
      const parts = name.trim().split(/\s+/);

      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }

      return name.substring(0, 2).toUpperCase();
    }

    return email.substring(0, 2).toUpperCase();
  };

  const get_avatar_color = (email: string): string => {
    const colors = [
      "#ef4444",
      "#f97316",
      "#f59e0b",
      "#84cc16",
      "#22c55e",
      "#14b8a6",
      "#06b6d4",
      "#0ea5e9",
      "#3b82f6",
      "#6366f1",
      "#8b5cf6",
      "#a855f7",
      "#d946ef",
      "#ec4899",
      "#f43f5e",
    ];
    let hash = 0;

    for (let i = 0; i < email.length; i++) {
      hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
  };

  if (emails.length === 0 && !is_loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <p className="text-muted-foreground">{empty_message}</p>
      </div>
    );
  }

  return (
    <div
      ref={container_ref}
      className="flex-1 overflow-y-auto"
      onTouchEnd={handle_pull_end}
      onTouchMove={handle_pull_move}
      onTouchStart={handle_pull_start}
    >
      <AnimatePresence>
        {(refreshing || pull_distance > 0) && (
          <motion.div
            animate={{ height: refreshing ? 48 : pull_distance * 0.5 }}
            className="flex items-center justify-center overflow-hidden"
            exit={{ height: 0 }}
            initial={{ height: 0 }}
          >
            <motion.div
              animate={{ rotate: refreshing ? 360 : 0 }}
              className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent"
              transition={{
                repeat: refreshing ? Infinity : 0,
                duration: 1,
                ease: "linear",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="divide-y divide-border">
        {emails.map((email) => {
          const swipe_actions = get_swipe_actions(email);
          const is_selected = selected_ids.includes(email.id);

          return (
            <SwipeActions
              key={email.id}
              disabled={is_selection_mode}
              left_actions={swipe_actions.left}
              right_actions={swipe_actions.right}
            >
              <motion.button
                layout
                className={cn(
                  "flex w-full items-start gap-3 p-3 text-left",
                  "transition-colors",
                  is_selected && "bg-primary/10",
                  !email.is_read && "bg-primary/5",
                )}
                onClick={() => handle_email_click(email)}
                onTouchCancel={handle_long_press_end}
                onTouchEnd={handle_long_press_end}
                onTouchStart={() => handle_long_press_start(email.id)}
              >
                <div className="relative flex-shrink-0">
                  {is_selection_mode ? (
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full",
                        "border-2 transition-colors",
                        is_selected
                          ? "border-primary bg-primary"
                          : "border-muted-foreground",
                      )}
                    >
                      {is_selected && (
                        <CheckIcon className="h-5 w-5 text-primary-foreground" />
                      )}
                    </div>
                  ) : (
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium text-white"
                      style={{
                        backgroundColor: get_avatar_color(email.from_email),
                      }}
                    >
                      {get_avatar_initials(email.from_name, email.from_email)}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        "truncate text-sm",
                        !email.is_read && "font-semibold",
                      )}
                    >
                      {email.from_name || email.from_email}
                    </p>
                    <span className="flex-shrink-0 text-xs text-muted-foreground">
                      {format_timestamp(email.timestamp)}
                    </span>
                  </div>

                  <p
                    className={cn(
                      "truncate text-sm",
                      !email.is_read
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {email.subject || "(No subject)"}
                  </p>

                  <div className="flex items-center gap-2">
                    <p className="flex-1 truncate text-sm text-muted-foreground">
                      {email.snippet}
                    </p>

                    {on_star && (
                      <button
                        aria-label={
                          email.is_starred ? "Unstar email" : "Star email"
                        }
                        className="flex-shrink-0 p-2.5 -mr-2 touch-manipulation"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          on_star(email.id, !email.is_starred);
                        }}
                      >
                        {email.is_starred ? (
                          <StarIconSolid className="h-5 w-5 text-yellow-500" />
                        ) : (
                          <StarIcon className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                    )}
                  </div>

                  {email.labels && email.labels.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {email.labels.slice(0, 3).map((label) => (
                        <span
                          key={label.id}
                          className="rounded-full px-2 py-0.5 text-xs"
                          style={{
                            backgroundColor: label.color + "20",
                            color: label.color,
                          }}
                        >
                          {label.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.button>
            </SwipeActions>
          );
        })}
      </div>

      {is_loading && (
        <div className="flex items-center justify-center p-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
}
