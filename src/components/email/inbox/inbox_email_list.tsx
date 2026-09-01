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
import type { InboxEmail, EmailCategory } from "@/types/email";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  FolderIcon,
  LockClosedIcon,
  InboxIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  StarIcon,
  ArchiveBoxArrowDownIcon,
  ShieldExclamationIcon,
  TrashIcon as TrashIconOutline,
  ClockIcon,
  TagIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Skeleton } from "@/components/ui/skeleton";
import { InboxEmailListItem } from "@/components/email/inbox_email_list_item";
import { EmailContextMenuContent } from "@/components/email/email_context_menu";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context_menu";
import { FolderPasswordModal } from "@/components/folders/folder_password_modal";
import { use_i18n } from "@/lib/i18n/context";
import {
  preload_email_detail,
  is_preload_busy,
} from "@/components/email/hooks/use_email_detail";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_attachment_previews } from "@/hooks/use_attachment_previews";
import { ignore_error } from "@/lib/ignore_error";
import {
  is_compact_density,
  list_row_intrinsic_height,
  resolve_list_density,
} from "@/lib/list_density";
import {
  build_selection_snapshot,
  empty_selection_snapshot,
  type SelectionSnapshot,
} from "@/components/email/inbox/selection_snapshot";

export const HOVER_PRELOAD_DELAY_MS = 220;
export const HOVER_PRELOAD_MAX_ATTEMPTS = 10;
const HOVER_PRELOAD_IDLE_TIMEOUT_MS = 1200;

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function request_idle(task: () => void): () => void {
  const idle_window = window as IdleWindow;

  if (typeof idle_window.requestIdleCallback === "function") {
    const handle = idle_window.requestIdleCallback(task, {
      timeout: HOVER_PRELOAD_IDLE_TIMEOUT_MS,
    });

    return () => idle_window.cancelIdleCallback?.(handle);
  }

  const timer = window.setTimeout(task, 0);

  return () => window.clearTimeout(timer);
}

export interface SelectionMenuScope {
  count: number;
  is_all_mode: boolean;
  has_unread: boolean;
  has_read: boolean;
  get_folder_status: (folder_id: string) => "all" | "some" | "none";
  get_tag_status: (tag_token: string) => "all" | "some" | "none";
  on_archive: () => void;
  on_delete: () => void;
  on_spam: () => void;
  on_mark_read: () => void;
  on_mark_unread: () => void;
  on_restore: () => void;
  on_mark_not_spam: () => void;
  on_move_to_inbox: () => void;
  on_snooze: (snooze_until: Date) => Promise<boolean | void>;
  on_custom_snooze: () => void;
  on_folder_toggle: (folder_id: string) => void;
  on_tag_toggle: (tag_token: string) => void;
  on_category_change?: (category: EmailCategory) => void;
}

export interface EmailListProps {
  pinned_emails: InboxEmail[];
  primary_emails: InboxEmail[];
  density: string;
  show_profile_pictures: boolean;
  show_email_preview: boolean;
  show_message_size?: boolean;
  show_thread_count?: boolean;
  on_toggle_select: (id: string) => void;
  on_select_only?: (id: string) => void;
  on_email_click: (id: string) => void;
  current_view: string;
  folders: { id: string; name: string; color: string }[];
  tags: { tag_token: string; name: string; color: string }[];
  on_reply: (email: InboxEmail) => void;
  on_reply_all?: (email: InboxEmail) => void;
  on_forward: (email: InboxEmail) => void;
  on_find_from_sender?: (email: InboxEmail) => void;
  on_open_in_new_window?: (email: InboxEmail) => void;
  on_toggle_read: (email: InboxEmail) => void;
  on_toggle_star: (email: InboxEmail) => void;
  on_toggle_pin: (email: InboxEmail) => void;
  on_snooze: (email: InboxEmail, snooze_until: Date) => Promise<boolean | void>;
  on_custom_snooze: (email: InboxEmail) => void;
  on_unsnooze: (email: InboxEmail) => Promise<void>;
  on_archive: (email: InboxEmail) => void;
  on_spam: (email: InboxEmail) => void;
  on_delete: (email: InboxEmail) => void;
  on_folder_toggle: (email: InboxEmail, folder_id: string) => void;
  on_tag_toggle: (email: InboxEmail, tag_token: string) => void;
  on_restore: (email: InboxEmail) => void;
  on_mark_not_spam: (email: InboxEmail) => void;
  on_move_to_inbox: (email: InboxEmail) => void;
  on_category_change?: (email: InboxEmail, category: EmailCategory) => void;
  categories_enabled?: boolean;
  selection_menu?: SelectionMenuScope | null;
  selected_email_id?: string | null;
  focused_email_id?: string | null;
}

export function EmailList({
  pinned_emails,
  primary_emails,
  density,
  show_profile_pictures,
  show_email_preview,
  show_message_size,
  show_thread_count,
  on_toggle_select,
  on_select_only,
  on_email_click,
  current_view,
  folders,
  tags,
  focused_email_id,
  on_reply,
  on_reply_all,
  on_forward,
  on_find_from_sender,
  on_open_in_new_window,
  on_toggle_read,
  on_toggle_star,
  on_toggle_pin,
  on_snooze,
  on_custom_snooze,
  on_unsnooze,
  on_archive,
  on_spam,
  on_delete,
  on_folder_toggle,
  on_tag_toggle,
  on_restore,
  on_mark_not_spam,
  on_move_to_inbox,
  on_category_change,
  categories_enabled,
  selection_menu,
  selected_email_id,
}: EmailListProps): React.ReactElement {
  const { user } = use_auth();
  const { preferences } = use_preferences();
  const hover_timer_ref = useRef<number | null>(null);
  const last_preloaded_ref = useRef<string | null>(null);
  const cancel_idle_ref = useRef<(() => void) | null>(null);
  const [menu_email, set_menu_email] = useState<InboxEmail | null>(null);
  const close_time_ref = useRef(0);
  const hover_preload_ref = useRef<((email_id: string) => void) | null>(null);
  const cancel_hover_preload_ref = useRef<(() => void) | null>(null);
  const row_context_menu_ref = useRef<((email: InboxEmail) => void) | null>(
    null,
  );
  const closed_email_id_ref = useRef<string | null>(null);
  const menu_email_ref = useRef<InboxEmail | null>(null);
  const on_tag_toggle_ref = useRef(on_tag_toggle);

  on_tag_toggle_ref.current = on_tag_toggle;
  const on_folder_toggle_ref = useRef(on_folder_toggle);

  on_folder_toggle_ref.current = on_folder_toggle;
  const selection_menu_ref = useRef(selection_menu);

  selection_menu_ref.current = selection_menu;

  const all_emails = useMemo(
    () => [...pinned_emails, ...primary_emails],
    [pinned_emails, primary_emails],
  );

  const live_menu_email = useMemo(
    () =>
      menu_email
        ? (all_emails.find((e) => e.id === menu_email.id) ?? menu_email)
        : null,
    [all_emails, menu_email],
  );

  menu_email_ref.current = live_menu_email;

  const menu_uses_selection =
    !!selection_menu && !!live_menu_email?.is_selected;

  const stable_on_tag_toggle = useCallback((tag_token: string) => {
    const scope = selection_menu_ref.current;

    if (scope && menu_email_ref.current?.is_selected) {
      scope.on_tag_toggle(tag_token);

      return;
    }

    if (menu_email_ref.current) {
      on_tag_toggle_ref.current(menu_email_ref.current, tag_token);
    }
  }, []);

  const stable_on_folder_toggle = useCallback((folder_id: string) => {
    const scope = selection_menu_ref.current;

    if (scope && menu_email_ref.current?.is_selected) {
      scope.on_folder_toggle(folder_id);

      return;
    }

    if (menu_email_ref.current) {
      on_folder_toggle_ref.current(menu_email_ref.current, folder_id);
    }
  }, []);

  const menu_tags = useMemo(() => {
    if (!live_menu_email) return [];

    if (menu_uses_selection && selection_menu) {
      return tags.map((t) => ({
        ...t,
        is_assigned: selection_menu.get_tag_status(t.tag_token) === "all",
      }));
    }

    return tags.map((t) => ({
      ...t,
      is_assigned:
        live_menu_email.tags?.some((et) => et.id === t.tag_token) || false,
    }));
  }, [tags, live_menu_email, menu_uses_selection, selection_menu]);

  const menu_folders = useMemo(() => {
    if (!menu_uses_selection || !selection_menu) return folders;

    return folders.map((f) => ({
      ...f,
      is_assigned: selection_menu.get_folder_status(f.id) === "all",
    }));
  }, [folders, menu_uses_selection, selection_menu]);

  const auto_selected_id_ref = useRef<string | null>(null);
  const menu_action_taken_ref = useRef(false);
  const on_toggle_select_ref = useRef(on_toggle_select);

  on_toggle_select_ref.current = on_toggle_select;

  const handle_menu_open_change = useCallback((open: boolean) => {
    if (!open) {
      close_time_ref.current = Date.now();
      closed_email_id_ref.current = menu_email_ref.current?.id ?? null;

      const auto_id = auto_selected_id_ref.current;

      if (menu_action_taken_ref.current && auto_id) {
        on_toggle_select_ref.current(auto_id);
      }

      auto_selected_id_ref.current = null;
      menu_action_taken_ref.current = false;
    }
  }, []);

  const run_menu_action = useCallback(
    <T extends unknown[], R>(action: (...action_args: T) => R) =>
      (...action_args: T): R => {
        menu_action_taken_ref.current = true;

        return action(...action_args);
      },
    [],
  );

  const handle_row_click_capture = useCallback((e: React.MouseEvent) => {
    if (Date.now() - close_time_ref.current >= 300) {
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target?.closest("[data-select-toggle]")) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handle_trigger_context_menu = useCallback((e: React.MouseEvent) => {
    if (
      Date.now() - close_time_ref.current < 300 &&
      menu_email_ref.current?.id === closed_email_id_ref.current
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);
  const attachment_previews = use_attachment_previews(
    all_emails,
    !preferences.low_network_mode,
  );

  const is_special_view =
    current_view === "drafts" || current_view === "scheduled";

  const handle_hover_preload = useCallback(
    (email_id: string) => {
      if (preferences.low_network_mode) return;
      if (is_special_view) return;
      if (last_preloaded_ref.current === email_id) return;

      if (hover_timer_ref.current !== null) {
        window.clearTimeout(hover_timer_ref.current);
      }

      let attempts = 0;

      const start = () => {
        attempts += 1;
        hover_timer_ref.current = window.setTimeout(() => {
          hover_timer_ref.current = null;

          if (is_preload_busy() && attempts < HOVER_PRELOAD_MAX_ATTEMPTS) {
            start();

            return;
          }

          cancel_idle_ref.current = request_idle(() => {
            cancel_idle_ref.current = null;
            last_preloaded_ref.current = email_id;
            preload_email_detail(
              email_id,
              user?.email,
              false,
              preferences.conversation_grouping !== false,
            ).catch((caught) =>
              ignore_error(
                "components/email/inbox/inbox_email_list:start",
                caught,
              ),
            );
          });
        }, HOVER_PRELOAD_DELAY_MS);
      };

      start();
    },
    [
      user?.email,
      is_special_view,
      preferences.conversation_grouping,
      preferences.low_network_mode,
    ],
  );

  const cancel_hover_preload = useCallback(() => {
    if (hover_timer_ref.current !== null) {
      window.clearTimeout(hover_timer_ref.current);
      hover_timer_ref.current = null;
    }

    if (cancel_idle_ref.current !== null) {
      cancel_idle_ref.current();
      cancel_idle_ref.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cancel_hover_preload();
    };
  }, [cancel_hover_preload]);
  hover_preload_ref.current = handle_hover_preload;
  cancel_hover_preload_ref.current = cancel_hover_preload;

  const show_hover_actions = !is_special_view;

  const selection_ref = useRef<SelectionSnapshot>(empty_selection_snapshot);

  selection_ref.current = useMemo(
    () => build_selection_snapshot(all_emails),
    [all_emails],
  );

  const handle_row_context_menu = (email: InboxEmail) => {
    set_menu_email(email);
    menu_email_ref.current = email;
    menu_action_taken_ref.current = false;

    if (email.is_selected || selection_menu) {
      auto_selected_id_ref.current = null;

      return;
    }

    auto_selected_id_ref.current = email.id;

    if (on_select_only) {
      on_select_only(email.id);
    } else {
      on_toggle_select(email.id);
    }
  };

  row_context_menu_ref.current = handle_row_context_menu;

  const hover_archive = show_hover_actions ? on_archive : undefined;
  const hover_delete = show_hover_actions ? on_delete : undefined;
  const hover_mark_not_spam = show_hover_actions ? on_mark_not_spam : undefined;
  const hover_move_to_inbox = show_hover_actions ? on_move_to_inbox : undefined;
  const hover_restore = show_hover_actions ? on_restore : undefined;
  const hover_spam = show_hover_actions ? on_spam : undefined;
  const hover_toggle_read = show_hover_actions ? on_toggle_read : undefined;
  const hover_toggle_star = show_hover_actions ? on_toggle_star : undefined;

  const email_by_id = useMemo(() => {
    const map = new Map<string, InboxEmail>();

    for (const email of all_emails) map.set(email.id, email);

    return map;
  }, [all_emails]);

  const email_by_id_ref = useRef(email_by_id);

  email_by_id_ref.current = email_by_id;

  const hovered_row_ref = useRef<string | null>(null);

  const row_id_from_event = (e: React.MouseEvent): string | null => {
    const target = e.target as HTMLElement | null;
    const row = target?.closest?.("[data-row-email-id]") as HTMLElement | null;

    return row?.dataset["rowEmailId"] ?? null;
  };

  const handle_list_mouse_over = useCallback((e: React.MouseEvent) => {
    const id = row_id_from_event(e);

    if (id === hovered_row_ref.current) return;

    hovered_row_ref.current = id;

    if (id === null) {
      cancel_hover_preload_ref.current?.();

      return;
    }

    hover_preload_ref.current?.(id);
  }, []);

  const handle_list_mouse_out = useCallback((e: React.MouseEvent) => {
    const next = e.relatedTarget as Node | null;

    if (next instanceof HTMLElement && next.closest("[data-row-email-id]")) {
      return;
    }

    if (hovered_row_ref.current === null) return;

    hovered_row_ref.current = null;
    cancel_hover_preload_ref.current?.();
  }, []);

  const handle_list_context_menu = useCallback((e: React.MouseEvent) => {
    const id = row_id_from_event(e);

    if (id === null) return;

    const email = email_by_id_ref.current.get(id);

    if (email) row_context_menu_ref.current?.(email);
  }, []);

  const render_email_item = (email: InboxEmail) => (
    <InboxEmailListItem
      attachment_previews={attachment_previews.get(email.id)}
      current_view={current_view}
      density={density}
      email={email}
      is_active={email.id === selected_email_id}
      is_focused={email.id === focused_email_id}
      on_archive={hover_archive}
      on_delete={hover_delete}
      on_email_click={on_email_click}
      on_mark_not_spam={hover_mark_not_spam}
      on_move_to_inbox={hover_move_to_inbox}
      on_restore={hover_restore}
      on_spam={hover_spam}
      on_toggle_read={hover_toggle_read}
      on_toggle_select={on_toggle_select}
      on_toggle_star={hover_toggle_star}
      selection={selection_ref}
      show_email_preview={show_email_preview}
      show_message_size={show_message_size}
      show_profile_pictures={show_profile_pictures}
      show_thread_count={show_thread_count}
    />
  );

  return (
    <ContextMenu modal={false} onOpenChange={handle_menu_open_change}>
      <ContextMenuTrigger asChild onContextMenu={handle_trigger_context_menu}>
        <div
          style={{ display: "contents" }}
          onClickCapture={handle_row_click_capture}
          onContextMenu={handle_list_context_menu}
          onMouseOver={handle_list_mouse_over}
          onMouseOut={handle_list_mouse_out}
        >
          {pinned_emails.length > 0 && (
            <>
              {pinned_emails.map((email) => (
                <div
                  key={email.id}
                  data-row-email-id={email.id}
                  style={{
                    contentVisibility: "auto",
                    containIntrinsicSize: `auto ${list_row_intrinsic_height(density, preferences.compact_mode ?? false, email.has_attachment)}px`,
                  }}
                >
                  {render_email_item(email)}
                </div>
              ))}
            </>
          )}

          {primary_emails.length > 0 && (
            <>
              {primary_emails.map((email) => (
                <div
                  key={email.id}
                  data-row-email-id={email.id}
                  style={{
                    contentVisibility: "auto",
                    containIntrinsicSize: `auto ${list_row_intrinsic_height(density, preferences.compact_mode ?? false, email.has_attachment)}px`,
                  }}
                >
                  {render_email_item(email)}
                </div>
              ))}
            </>
          )}
        </div>
      </ContextMenuTrigger>

      {live_menu_email && (
        <EmailContextMenuContent
          key={live_menu_email.id}
          categories_enabled={categories_enabled}
          current_view={current_view}
          email={live_menu_email}
          folders={menu_folders}
          on_archive={run_menu_action(() =>
            menu_uses_selection && selection_menu
              ? selection_menu.on_archive()
              : on_archive(live_menu_email),
          )}
          on_category_change={
            menu_uses_selection && selection_menu
              ? selection_menu.on_category_change
                ? run_menu_action((category: EmailCategory) =>
                    selection_menu.on_category_change?.(category),
                  )
                : undefined
              : on_category_change
                ? run_menu_action((category: EmailCategory) =>
                    on_category_change(live_menu_email, category),
                  )
                : undefined
          }
          on_custom_snooze={run_menu_action(() =>
            menu_uses_selection && selection_menu
              ? selection_menu.on_custom_snooze()
              : on_custom_snooze(live_menu_email),
          )}
          on_delete={run_menu_action(() =>
            menu_uses_selection && selection_menu
              ? selection_menu.on_delete()
              : on_delete(live_menu_email),
          )}
          on_find_from_sender={
            on_find_from_sender
              ? run_menu_action(() => on_find_from_sender(live_menu_email))
              : undefined
          }
          on_folder_toggle={run_menu_action(stable_on_folder_toggle)}
          on_forward={run_menu_action(() => on_forward(live_menu_email))}
          on_mark_not_spam={run_menu_action(() =>
            menu_uses_selection && selection_menu
              ? selection_menu.on_mark_not_spam()
              : on_mark_not_spam(live_menu_email),
          )}
          on_mark_read={
            menu_uses_selection && selection_menu
              ? run_menu_action(() => selection_menu.on_mark_read())
              : undefined
          }
          on_mark_unread={
            menu_uses_selection && selection_menu
              ? run_menu_action(() => selection_menu.on_mark_unread())
              : undefined
          }
          on_move_to_inbox={run_menu_action(() =>
            menu_uses_selection && selection_menu
              ? selection_menu.on_move_to_inbox()
              : on_move_to_inbox(live_menu_email),
          )}
          on_open_in_new_window={
            on_open_in_new_window
              ? run_menu_action(() => on_open_in_new_window(live_menu_email))
              : undefined
          }
          on_reply={run_menu_action(() => on_reply(live_menu_email))}
          on_reply_all={
            on_reply_all
              ? run_menu_action(() => on_reply_all(live_menu_email))
              : undefined
          }
          on_restore={run_menu_action(() =>
            menu_uses_selection && selection_menu
              ? selection_menu.on_restore()
              : on_restore(live_menu_email),
          )}
          on_snooze={run_menu_action((snooze_until: Date) =>
            menu_uses_selection && selection_menu
              ? selection_menu.on_snooze(snooze_until)
              : on_snooze(live_menu_email, snooze_until),
          )}
          on_spam={run_menu_action(() =>
            menu_uses_selection && selection_menu
              ? selection_menu.on_spam()
              : on_spam(live_menu_email),
          )}
          on_tag_toggle={run_menu_action(stable_on_tag_toggle)}
          on_toggle_pin={run_menu_action(() => on_toggle_pin(live_menu_email))}
          on_toggle_read={run_menu_action(() =>
            on_toggle_read(live_menu_email),
          )}
          on_unsnooze={run_menu_action(() => on_unsnooze(live_menu_email))}
          selection={
            menu_uses_selection && selection_menu
              ? {
                  count: selection_menu.count,
                  is_all_mode: selection_menu.is_all_mode,
                  has_unread: selection_menu.has_unread,
                  has_read: selection_menu.has_read,
                }
              : undefined
          }
          tags={menu_tags}
        />
      )}
    </ContextMenu>
  );
}

export function LoadingState(): React.ReactElement {
  const { preferences } = use_preferences();
  const is_compact = is_compact_density(
    resolve_list_density(preferences.mail_list_density),
    preferences.compact_mode ?? false,
  );
  const row_height = is_compact ? 41 : 49;
  const container_ref = useRef<HTMLDivElement>(null);
  const [row_count, set_row_count] = useState(() => {
    const header_height = 41;

    return Math.max(
      Math.ceil((window.innerHeight - header_height) / row_height) + 1,
      1,
    );
  });

  useEffect(() => {
    const calculate_rows = () => {
      if (container_ref.current) {
        const parent = container_ref.current.parentElement;
        const container_height = parent
          ? parent.clientHeight
          : container_ref.current.clientHeight;
        const header_height = 41;

        set_row_count(
          Math.max(
            Math.ceil((container_height - header_height) / row_height) + 1,
            1,
          ),
        );
      }
    };

    calculate_rows();
    window.addEventListener("resize", calculate_rows);

    return () => window.removeEventListener("resize", calculate_rows);
  }, [row_height]);

  return (
    <div ref={container_ref} className="overflow-hidden">
      {Array.from({ length: row_count }).map((_, i) => (
        <SkeletonEmailRow
          key={i}
          is_compact={is_compact}
          show_avatar={preferences.show_profile_pictures !== false}
        />
      ))}
    </div>
  );
}

function SkeletonEmailRow({
  is_compact,
  show_avatar,
}: {
  is_compact: boolean;
  show_avatar: boolean;
}): React.ReactElement {
  return (
    <div
      className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 ${is_compact ? "py-1.5" : "py-2"} border-b overflow-hidden border-edge-secondary`}
    >
      <Skeleton className="w-[18px] h-[18px] flex-shrink-0" />
      {show_avatar && (
        <Skeleton
          className={`${is_compact ? "w-7 h-7" : "w-8 h-8"} rounded-full flex-shrink-0 hidden sm:block`}
        />
      )}
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <Skeleton className="h-4 w-full max-w-[100px]" />
          <Skeleton className="w-10 h-3 sm:hidden ms-auto flex-shrink-0" />
        </div>
        <div className="flex items-center gap-2 sm:contents min-w-0 overflow-hidden">
          <Skeleton className="h-4 flex-1 min-w-0 max-w-[140px]" />
          <Skeleton className="h-3 flex-1 max-w-[100px] hidden xl:block" />
        </div>
      </div>
      <Skeleton className="w-10 h-3 hidden sm:block flex-shrink-0" />
    </div>
  );
}

interface EmptyStateProps {
  current_view: string;
  user_email: string | undefined;
  has_load_error?: boolean;
  on_retry?: () => void;
}

export function EmptyState({
  current_view,
  user_email,
  has_load_error,
  on_retry,
}: EmptyStateProps): React.ReactElement {
  const { t } = use_i18n();
  const is_inbox = current_view === "inbox" || current_view === "";

  if (has_load_error) {
    return (
      <div className="relative flex flex-col items-center justify-center h-full px-4">
        <ShieldExclamationIcon
          className="w-12 h-12 sm:w-14 sm:h-14 mb-4 text-txt-muted"
          strokeWidth={1}
        />
        <div className="text-center">
          <p className="text-sm sm:text-base font-medium text-txt-primary mb-1">
            {t("errors.connection_failed")}
          </p>
          {on_retry && (
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={on_retry}
            >
              {t("common.retry")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const get_empty_config = () => {
    if (current_view === "inbox" || current_view === "") {
      return {
        icon: InboxIcon,
        icon_color: "text-txt-muted",
        title: t("mail.empty_inbox_title"),
        subtitle: t("mail.empty_inbox_subtitle"),
      };
    }
    if (current_view === "sent") {
      return {
        icon: PaperAirplaneIcon,
        icon_color: "text-txt-muted",
        title: t("mail.empty_sent_title"),
        subtitle: t("mail.empty_sent_subtitle"),
      };
    }
    if (current_view === "drafts") {
      return {
        icon: PencilSquareIcon,
        icon_color: "text-txt-muted",
        title: t("mail.empty_drafts_title"),
        subtitle: t("mail.empty_drafts_subtitle"),
      };
    }
    if (current_view === "starred") {
      return {
        icon: StarIcon,
        icon_color: "text-amber-400",
        title: t("mail.empty_starred_title"),
        subtitle: t("mail.empty_starred_subtitle"),
      };
    }
    if (current_view === "archive") {
      return {
        icon: ArchiveBoxArrowDownIcon,
        icon_color: "text-txt-muted",
        title: t("mail.empty_archive_title"),
        subtitle: t("mail.archive_subtitle"),
      };
    }
    if (current_view === "spam") {
      return {
        icon: ShieldExclamationIcon,
        icon_color: "text-txt-muted",
        title: t("mail.empty_spam_title"),
        subtitle: t("mail.empty_spam_subtitle"),
      };
    }
    if (current_view === "trash") {
      return {
        icon: TrashIconOutline,
        icon_color: "text-txt-muted",
        title: t("mail.empty_trash_title"),
        subtitle: t("mail.trash_subtitle"),
      };
    }
    if (current_view === "snoozed") {
      return {
        icon: ClockIcon,
        icon_color: "text-txt-muted",
        title: t("mail.empty_snoozed_title"),
        subtitle: t("mail.empty_snoozed_subtitle"),
      };
    }
    if (current_view.startsWith("folder-")) {
      return {
        icon: FolderIcon,
        icon_color: "text-txt-muted",
        title: t("mail.empty_folder_title"),
        subtitle: t("mail.empty_folder_subtitle"),
      };
    }
    if (current_view.startsWith("tag-")) {
      return {
        icon: TagIcon,
        icon_color: "text-txt-muted",
        title: t("mail.empty_tag_title"),
        subtitle: t("mail.empty_tag_subtitle"),
      };
    }

    return {
      icon: EnvelopeIcon,
      icon_color: "text-txt-muted",
      title: t("mail.no_messages"),
      subtitle: t("mail.empty_default_subtitle"),
    };
  };

  const config = get_empty_config();
  const IconComponent = config.icon;

  return (
    <div className="relative flex flex-col items-center justify-center h-full px-4">
      <IconComponent
        className={`w-12 h-12 sm:w-14 sm:h-14 mb-4 ${config.icon_color}`}
        strokeWidth={1}
      />
      <div className="text-center">
        <p className="text-sm sm:text-base font-medium text-txt-primary mb-1">
          {config.title}
        </p>
        <p className="text-xs sm:text-sm text-txt-muted max-w-[260px]">
          {config.subtitle}
        </p>
        {is_inbox && user_email && (
          <p className="text-[10px] sm:text-xs mt-3 text-txt-muted opacity-60 truncate max-w-full">
            {user_email}
          </p>
        )}
      </div>
    </div>
  );
}

interface LockedFolderStateProps {
  folder_id: string;
  folder_name: string;
}

export function FolderNotFoundState(): React.ReactElement {
  const { t } = use_i18n();

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <FolderIcon
        className="w-12 h-12 sm:w-14 sm:h-14 mb-4 text-txt-muted"
        strokeWidth={1}
      />
      <div className="text-center">
        <p className="text-sm sm:text-base font-medium text-txt-primary mb-1">
          {t("mail.folder_not_found_title")}
        </p>
        <p className="text-xs sm:text-sm text-txt-muted">
          {t("mail.folder_not_found_subtitle")}
        </p>
      </div>
    </div>
  );
}

export function TagNotFoundState(): React.ReactElement {
  const { t } = use_i18n();

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <TagIcon
        className="w-12 h-12 sm:w-14 sm:h-14 mb-4 text-txt-muted"
        strokeWidth={1}
      />
      <div className="text-center">
        <p className="text-sm sm:text-base font-medium text-txt-primary mb-1">
          {t("mail.tag_not_found_title")}
        </p>
        <p className="text-xs sm:text-sm text-txt-muted">
          {t("mail.tag_not_found_subtitle")}
        </p>
      </div>
    </div>
  );
}

export function LockedFolderState({
  folder_id,
  folder_name,
}: LockedFolderStateProps): React.ReactElement {
  const { t } = use_i18n();
  const [show_unlock_modal, set_show_unlock_modal] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <LockClosedIcon
        className="w-12 h-12 sm:w-14 sm:h-14 mb-4 text-txt-muted"
        strokeWidth={1}
      />
      <div className="text-center">
        <p className="text-sm sm:text-base font-medium text-txt-primary mb-1">
          {t("mail.folder_locked_title")}
        </p>
        <p className="text-xs sm:text-sm text-txt-muted mb-4">
          {t("mail.enter_password_to_access", { folder: folder_name })}
        </p>
        <Button variant="depth" onClick={() => set_show_unlock_modal(true)}>
          <LockClosedIcon className="w-4 h-4 me-2" />
          {t("settings.unlock_folder")}
        </Button>
      </div>

      <FolderPasswordModal
        folder_id={folder_id}
        folder_name={folder_name}
        is_open={show_unlock_modal}
        mode="unlock"
        on_close={() => set_show_unlock_modal(false)}
      />
    </div>
  );
}
