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
import type { InboxEmail } from "@/types/email";

import { memo, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  PaperClipIcon,
  StarIcon as StarOutlineIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";

import {
  SwipeActions,
  type SwipeAction,
} from "@/components/mobile/swipe_actions";
import { get_swipe_action } from "@/components/mobile/swipe_action_registry";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { SnoozeBadge } from "@/components/ui/snooze_badge";
import { use_i18n } from "@/lib/i18n/context";
import { use_date_format } from "@/hooks/use_date_format";
import { haptic_long_press, haptic_impact } from "@/native/haptic_feedback";

interface MobileEmailRowProps {
  email: InboxEmail;
  on_press: (id: string) => void;
  on_long_press: (id: string) => void;
  on_toggle_star?: (email: InboxEmail) => void;
  on_archive?: (email: InboxEmail) => void;
  on_delete?: (email: InboxEmail) => void;
  on_snooze?: (email: InboxEmail) => void;
  on_toggle_read?: (email: InboxEmail) => void;
  on_mark_spam?: (email: InboxEmail) => void;
  swipe_left_action?: string;
  swipe_right_action?: string;
  selection_mode?: boolean;
  is_selected?: boolean;
}

export const MobileEmailRow = memo(function MobileEmailRow(
  props: MobileEmailRowProps,
) {
  const {
    email,
    on_press,
    on_long_press,
    on_toggle_star,
    on_archive,
    on_delete,
    on_snooze,
    on_toggle_read,
    on_mark_spam,
    swipe_left_action = "archive",
    swipe_right_action = "toggle_read",
    selection_mode = false,
    is_selected = false,
  } = props;
  const { t } = use_i18n();
  const { format_email_list } = use_date_format();
  const long_press_timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const long_press_fired = useRef(false);

  const touch_start_pos = useRef<{ x: number; y: number } | null>(null);

  const handle_touch_start = useCallback(
    (e: React.TouchEvent) => {
      if (selection_mode) return;
      const target = e.target as HTMLElement;

      if (target.closest("[data-star-btn]")) return;
      long_press_fired.current = false;
      touch_start_pos.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      long_press_timer.current = setTimeout(() => {
        long_press_fired.current = true;
        haptic_long_press();
        on_long_press(email.id);
      }, 500);
    },
    [email.id, on_long_press, selection_mode],
  );

  const handle_touch_move = useCallback((e: React.TouchEvent) => {
    if (!long_press_timer.current || !touch_start_pos.current) return;
    const dx = e.touches[0].clientX - touch_start_pos.current.x;
    const dy = e.touches[0].clientY - touch_start_pos.current.y;

    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      clearTimeout(long_press_timer.current);
      long_press_timer.current = null;
      touch_start_pos.current = null;
    }
  }, []);

  const handle_touch_end = useCallback(() => {
    touch_start_pos.current = null;
    if (long_press_timer.current) {
      clearTimeout(long_press_timer.current);
      long_press_timer.current = null;
    }
  }, []);

  const handle_click = useCallback(
    (e: React.MouseEvent) => {
      if (selection_mode) {
        haptic_impact("light");
        on_press(email.id);

        return;
      }
      const target = e.target as HTMLElement;

      if (target.closest("[data-star-btn]")) return;
      if (long_press_fired.current) return;
      on_press(email.id);
    },
    [email.id, on_press, selection_mode],
  );

  const star_ref = useRef<HTMLDivElement>(null);

  const handle_star_click = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      haptic_impact("light");
      on_toggle_star?.(email);
      const el = star_ref.current;

      if (el) {
        el.style.transform = "scale(1.4)";
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.transform = "scale(1)";
          });
        });
      }
    },
    [email, on_toggle_star],
  );

  const handle_star_touch = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
  }, []);

  const timestamp = email.raw_timestamp ?? email.timestamp;
  const thread_count = email.thread_message_count ?? 0;

  const handler_map: Record<string, (() => void) | undefined> = useMemo(
    () => ({
      archive: on_archive ? () => on_archive(email) : undefined,
      delete: on_delete ? () => on_delete(email) : undefined,
      toggle_read: on_toggle_read ? () => on_toggle_read(email) : undefined,
      snooze: on_snooze ? () => on_snooze(email) : undefined,
      star: on_toggle_star ? () => on_toggle_star(email) : undefined,
      spam: on_mark_spam ? () => on_mark_spam(email) : undefined,
    }),
    [
      email,
      on_archive,
      on_delete,
      on_toggle_read,
      on_snooze,
      on_toggle_star,
      on_mark_spam,
    ],
  );

  const build_swipe_action = useCallback(
    (action_id: string): SwipeAction | undefined => {
      const definition = get_swipe_action(action_id);

      if (!definition) return undefined;
      const handler = handler_map[definition.id];

      if (!handler) return undefined;
      const Icon = definition.icon;

      return {
        icon: <Icon className="h-6 w-6 text-white" />,
        color: definition.color,
        on_trigger: handler,
      };
    },
    [handler_map],
  );

  const left_action = build_swipe_action(swipe_left_action);
  const right_action = build_swipe_action(swipe_right_action);

  const row_content = (
    <div
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--bg-tertiary)] ${
        is_selected ? "bg-[var(--accent-color,#3b82f6)]/8" : ""
      }`}
      data-email-id={email.id}
      role="button"
      tabIndex={0}
      onClick={handle_click}
      onTouchEnd={handle_touch_end}
      onTouchMove={handle_touch_move}
      onTouchStart={handle_touch_start}
    >
      <div className="relative mt-0.5 shrink-0">
        <ProfileAvatar
          use_domain_logo
          email={email.sender_email}
          name={email.sender_name}
          size="md"
        />
        {selection_mode && is_selected && (
          <motion.div
            animate={{ scale: 1, opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-[var(--accent-color,#3b82f6)]"
            initial={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
          >
            <CheckIcon className="h-5 w-5 text-white" strokeWidth={2.5} />
          </motion.div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`min-w-0 flex-1 truncate text-[15px] leading-tight ${
              !email.is_read
                ? "font-semibold text-[var(--text-primary)]"
                : "text-[var(--text-secondary)]"
            }`}
          >
            {email.sender_name}
          </span>

          {thread_count > 1 && (
            <span className="shrink-0 rounded border border-[var(--border-primary)] px-1 text-[11px] tabular-nums text-[var(--text-muted)]">
              {thread_count}
            </span>
          )}

          <span className="shrink-0 text-[12px] tabular-nums text-[var(--text-muted)]">
            {format_email_list(new Date(timestamp))}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5">
          <span
            className={`min-w-0 flex-1 truncate text-[14px] leading-tight ${
              !email.is_read
                ? "font-medium text-[var(--text-primary)]"
                : "text-[var(--text-secondary)]"
            }`}
          >
            {email.subject || t("mail.no_subject")}
          </span>

          <div className="flex shrink-0 items-center gap-1">
            {email.phishing_level === "suspicious" && (
              <span className="bg-[#d97706] text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                {t("common.suspicious")}
              </span>
            )}

            {email.phishing_level === "dangerous" && (
              <span className="bg-[#dc2626] text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                {t("common.dangerous")}
              </span>
            )}

            {email.snoozed_until && (
              <SnoozeBadge size="xs" snoozed_until={email.snoozed_until} />
            )}

            {email.has_attachment && (
              <PaperClipIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            )}

            {email.is_pinned && (
              <span className="h-2 w-2 rounded-full bg-[var(--accent-color,#3b82f6)]" />
            )}
          </div>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] leading-tight text-[var(--text-muted)]">
            {email.preview}
          </span>

          <div
            ref={star_ref}
            data-star-btn
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full active:bg-[var(--bg-tertiary)] transition-transform duration-200"
            role="button"
            tabIndex={-1}
            onClick={handle_star_click}
            onTouchStart={handle_star_touch}
          >
            {email.is_starred ? (
              <StarSolidIcon className="h-4.5 w-4.5 text-amber-400" />
            ) : (
              <StarOutlineIcon className="h-4.5 w-4.5 text-[var(--text-muted)]" />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (selection_mode) {
    return row_content;
  }

  return (
    <SwipeActions left_action={left_action} right_action={right_action}>
      {row_content}
    </SwipeActions>
  );
});
