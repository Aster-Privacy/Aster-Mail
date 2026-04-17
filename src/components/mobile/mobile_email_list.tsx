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

import { memo, useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronUpIcon,
  InboxIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  StarIcon,
  ArchiveBoxArrowDownIcon,
  ShieldExclamationIcon,
  TrashIcon,
  ClockIcon,
  FolderIcon,
  TagIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";

import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { MobileEmailRow } from "@/components/mobile/mobile_email_row";
import { use_i18n } from "@/lib/i18n/context";
import { haptic_impact } from "@/native/haptic_feedback";
import { use_platform } from "@/hooks/use_platform";

interface MobileEmailListProps {
  emails: InboxEmail[];
  pinned_emails?: InboxEmail[];
  is_loading: boolean;
  is_loading_more?: boolean;
  has_more?: boolean;
  current_view: string;
  on_email_press: (id: string) => void;
  on_long_press: (id: string) => void;
  on_load_more: () => void;
  on_toggle_star?: (email: InboxEmail) => void;
  on_archive?: (email: InboxEmail) => void;
  on_delete?: (email: InboxEmail) => void;
  on_snooze?: (email: InboxEmail) => void;
  on_toggle_read?: (email: InboxEmail) => void;
  on_mark_spam?: (email: InboxEmail) => void;
  swipe_left_action?: string;
  swipe_right_action?: string;
  selection_mode?: boolean;
  selected_ids?: Set<string>;
  on_drag_select?: (id: string) => void;
  on_refresh?: () => void;
  is_refreshing?: boolean;
}

type HeroIcon = React.ForwardRefExoticComponent<
  React.PropsWithoutRef<React.SVGProps<SVGSVGElement>> & {
    title?: string;
    titleId?: string;
  } & React.RefAttributes<SVGSVGElement>
>;

const EMPTY_ICONS: Record<string, { icon: HeroIcon; color: string }> = {
  inbox: { icon: InboxIcon, color: "text-txt-muted" },
  all: { icon: EnvelopeIcon, color: "text-txt-muted" },
  starred: { icon: StarIcon, color: "text-amber-400" },
  sent: { icon: PaperAirplaneIcon, color: "text-txt-muted" },
  drafts: { icon: PencilSquareIcon, color: "text-txt-muted" },
  scheduled: { icon: ClockIcon, color: "text-txt-muted" },
  snoozed: { icon: ClockIcon, color: "text-txt-muted" },
  archive: { icon: ArchiveBoxArrowDownIcon, color: "text-txt-muted" },
  trash: { icon: TrashIcon, color: "text-txt-muted" },
  spam: { icon: ShieldExclamationIcon, color: "text-txt-muted" },
};

function get_empty_icon(view: string): { icon: HeroIcon; color: string } {
  if (view.startsWith("folder-") || view.startsWith("folder:"))
    return { icon: FolderIcon, color: "text-txt-muted" };
  if (view.startsWith("tag-") || view.startsWith("tag:"))
    return { icon: TagIcon, color: "text-txt-muted" };

  return EMPTY_ICONS[view] ?? { icon: EnvelopeIcon, color: "text-txt-muted" };
}

function get_empty_text(
  view: string,
  t: (key: string) => string,
): { title: string; subtitle: string } {
  if (view.startsWith("folder-") || view.startsWith("folder:"))
    return {
      title: t("mail.empty_folder_title"),
      subtitle: t("mail.empty_folder_subtitle"),
    };
  if (view.startsWith("tag-") || view.startsWith("tag:"))
    return {
      title: t("mail.empty_tag_title"),
      subtitle: t("mail.empty_tag_subtitle"),
    };

  const VIEW_EMPTY: Record<string, { title: string; subtitle: string }> = {
    inbox: {
      title: t("mail.empty_inbox_title"),
      subtitle: t("mail.empty_inbox_subtitle"),
    },
    sent: {
      title: t("mail.empty_sent_title"),
      subtitle: t("mail.empty_sent_subtitle"),
    },
    drafts: {
      title: t("mail.empty_drafts_title"),
      subtitle: t("mail.empty_drafts_subtitle"),
    },
    starred: {
      title: t("mail.empty_starred_title"),
      subtitle: t("mail.empty_starred_subtitle"),
    },
    scheduled: {
      title: t("mail.empty_sent_title"),
      subtitle: t("mail.empty_default_subtitle"),
    },
    snoozed: {
      title: t("mail.empty_sent_title"),
      subtitle: t("mail.empty_default_subtitle"),
    },
    archive: {
      title: t("mail.empty_archive_title"),
      subtitle: t("mail.empty_default_subtitle"),
    },
    spam: {
      title: t("mail.empty_spam_title"),
      subtitle: t("mail.empty_spam_subtitle"),
    },
    trash: {
      title: t("mail.empty_trash_title"),
      subtitle: t("mail.empty_default_subtitle"),
    },
    all: {
      title: t("mail.no_messages"),
      subtitle: t("mail.empty_default_subtitle"),
    },
  };

  return (
    VIEW_EMPTY[view] ?? {
      title: t("mail.no_messages"),
      subtitle: t("mail.empty_default_subtitle"),
    }
  );
}

export const MobileEmailList = memo(function MobileEmailList({
  emails,
  pinned_emails,
  is_loading,
  is_loading_more,
  has_more,
  current_view,
  on_email_press,
  on_long_press,
  on_load_more,
  on_toggle_star,
  on_archive,
  on_delete,
  on_snooze,
  on_toggle_read,
  on_mark_spam,
  swipe_left_action,
  swipe_right_action,
  selection_mode = false,
  selected_ids,
  on_drag_select,
  on_refresh,
  is_refreshing = false,
}: MobileEmailListProps) {
  const { t } = use_i18n();
  const { safe_area_insets } = use_platform();
  const scroll_ref = useRef<HTMLDivElement>(null);
  const [show_jump_to_top, set_show_jump_to_top] = useState(false);

  const handle_jump_to_top = useCallback(() => {
    haptic_impact("light");
    scroll_ref.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = scroll_ref.current;

    if (!el) return;

    const handle_scroll = () => {
      if (has_more && !is_loading_more) {
        const { scrollTop, scrollHeight, clientHeight } = el;

        if (scrollTop > 0) {
          const scrolled_ratio = (scrollTop + clientHeight) / scrollHeight;

          if (scrolled_ratio > 0.8) {
            on_load_more();
          }
        }
      }
      set_show_jump_to_top(el.scrollTop > 800);
    };

    el.addEventListener("scroll", handle_scroll, { passive: true });

    return () => el.removeEventListener("scroll", handle_scroll);
  }, [has_more, is_loading_more, on_load_more]);

  const on_drag_select_ref = useRef(on_drag_select);

  on_drag_select_ref.current = on_drag_select;
  const selected_ids_ref = useRef(selected_ids);

  selected_ids_ref.current = selected_ids;
  const last_drag_id = useRef<string | null>(null);

  useEffect(() => {
    const el = scroll_ref.current;

    if (!el || !selection_mode) return;

    const on_drag_move = (e: TouchEvent) => {
      if (!on_drag_select_ref.current) return;
      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);

      if (!target) return;
      const row = (target as HTMLElement).closest(
        "[data-email-id]",
      ) as HTMLElement | null;

      if (!row) return;
      const id = row.dataset.emailId;

      if (!id || id === last_drag_id.current) return;
      last_drag_id.current = id;
      if (!selected_ids_ref.current?.has(id)) {
        haptic_impact("light");
        on_drag_select_ref.current(id);
      }
    };

    const on_drag_end = () => {
      last_drag_id.current = null;
    };

    el.addEventListener("touchmove", on_drag_move, { passive: true });
    el.addEventListener("touchend", on_drag_end, { passive: true });

    return () => {
      el.removeEventListener("touchmove", on_drag_move);
      el.removeEventListener("touchend", on_drag_end);
    };
  }, [selection_mode, is_loading]);

  const PULL_THRESHOLD = 60;
  const pull_progress_ref = useRef(0);
  const [pull_progress, set_pull_progress] = useState(0);
  const on_refresh_ref = useRef(on_refresh);

  on_refresh_ref.current = on_refresh;
  const is_refreshing_ref = useRef(is_refreshing);

  is_refreshing_ref.current = is_refreshing;

  useEffect(() => {
    const el = scroll_ref.current;

    if (!el || selection_mode) return;

    let start_y = 0;
    let pulling = false;

    const on_touch_start = (e: TouchEvent) => {
      if (
        el.scrollTop <= 0 &&
        !is_refreshing_ref.current &&
        on_refresh_ref.current
      ) {
        start_y = e.touches[0].clientY;
        pulling = true;
      }
    };

    const on_touch_move = (e: TouchEvent) => {
      if (!pulling) return;
      if (el.scrollTop > 0) {
        pulling = false;
        pull_progress_ref.current = 0;
        set_pull_progress(0);

        return;
      }
      const delta = e.touches[0].clientY - start_y;

      if (delta <= 0) {
        pull_progress_ref.current = 0;
        set_pull_progress(0);

        return;
      }
      e.preventDefault();
      const progress = Math.min(delta / PULL_THRESHOLD, 1);

      pull_progress_ref.current = progress;
      set_pull_progress(progress);
    };

    const on_touch_end = () => {
      if (pulling && pull_progress_ref.current >= 1) {
        on_refresh_ref.current?.();
      }
      pulling = false;
      pull_progress_ref.current = 0;
      set_pull_progress(0);
    };

    el.addEventListener("touchstart", on_touch_start, { passive: true });
    el.addEventListener("touchmove", on_touch_move, { passive: false });
    el.addEventListener("touchend", on_touch_end, { passive: true });

    return () => {
      el.removeEventListener("touchstart", on_touch_start);
      el.removeEventListener("touchmove", on_touch_move);
      el.removeEventListener("touchend", on_touch_end);
    };
  }, [selection_mode]);

  if (is_loading) {
    return (
      <div className="flex-1 space-y-1 px-0 pt-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3.5 w-1/2 rounded" />
              <Skeleton className="h-3 w-2/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const all_emails_empty =
    emails.length === 0 && (!pinned_emails || pinned_emails.length === 0);

  if (all_emails_empty) {
    const { icon: EmptyIcon, color: icon_color } = get_empty_icon(current_view);
    const empty_text = get_empty_text(
      current_view,
      t as (key: string) => string,
    );

    return (
      <div className="relative flex flex-1 flex-col items-center justify-center gap-3 px-8">
        <EmptyIcon className={`h-12 w-12 ${icon_color}`} strokeWidth={1} />
        <div className="text-center">
          <p className="text-[15px] font-medium text-[var(--text-primary)]">
            {empty_text.title}
          </p>
          {empty_text.subtitle && (
            <p className="mt-1 text-[13px] text-[var(--text-muted)] max-w-[240px]">
              {empty_text.subtitle}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      {(pull_progress > 0 || is_refreshing) && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-secondary)]"
            style={{
              opacity: is_refreshing ? 1 : pull_progress,
              boxShadow: "0 1px 6px rgba(0,0,0,0.15)",
            }}
          >
            <Spinner className="text-[var(--text-muted)]" size="sm" />
          </div>
        </div>
      )}
      <div
        ref={scroll_ref}
        className={`h-full overflow-y-auto overscroll-none${selection_mode ? " select-none" : ""}`}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {pinned_emails && pinned_emails.length > 0 && (
          <>
            <div className="sticky top-0 z-10 bg-[var(--bg-primary)] px-4 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {t("mail.pin_to_top")}
              </span>
            </div>
            {pinned_emails.map((email) => (
              <MobileEmailRow
                key={email.id}
                email={email}
                is_selected={selected_ids?.has(email.id)}
                on_archive={on_archive}
                on_delete={on_delete}
                on_long_press={on_long_press}
                on_mark_spam={on_mark_spam}
                on_press={on_email_press}
                on_snooze={on_snooze}
                on_toggle_read={on_toggle_read}
                on_toggle_star={on_toggle_star}
                selection_mode={selection_mode}
                swipe_left_action={swipe_left_action}
                swipe_right_action={swipe_right_action}
              />
            ))}
          </>
        )}

        {emails.map((email) => (
          <MobileEmailRow
            key={email.id}
            email={email}
            is_selected={selected_ids?.has(email.id)}
            on_archive={on_archive}
            on_delete={on_delete}
            on_long_press={on_long_press}
            on_mark_spam={on_mark_spam}
            on_press={on_email_press}
            on_snooze={on_snooze}
            on_toggle_read={on_toggle_read}
            on_toggle_star={on_toggle_star}
            selection_mode={selection_mode}
            swipe_left_action={swipe_left_action}
            swipe_right_action={swipe_right_action}
          />
        ))}

        {has_more && (
          <div className="flex items-center justify-center py-4">
            {is_loading_more && <Spinner size="sm" />}
          </div>
        )}

        <AnimatePresence>
          {show_jump_to_top && (
            <motion.button
              animate={{ opacity: 1 }}
              className="fixed right-4 z-30 flex h-16 w-16 items-center justify-center rounded-full active:opacity-70"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              style={{
                bottom: 16 + Math.max(safe_area_insets.bottom, 8) + 72,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-primary)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              }}
              transition={{ duration: 0.2 }}
              type="button"
              onClick={handle_jump_to_top}
            >
              <ChevronUpIcon className="h-6 w-6 text-[var(--text-secondary)]" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});
