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
import { EmailContextMenu } from "@/components/email/email_context_menu";
import { FolderPasswordModal } from "@/components/folders/folder_password_modal";
import { use_i18n } from "@/lib/i18n/context";
import { preload_email_detail } from "@/components/email/hooks/use_email_detail";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_attachment_previews } from "@/hooks/use_attachment_previews";

export interface EmailListProps {
  pinned_emails: InboxEmail[];
  primary_emails: InboxEmail[];
  density: string;
  show_profile_pictures: boolean;
  show_email_preview: boolean;
  show_message_size?: boolean;
  show_thread_count?: boolean;
  on_toggle_select: (id: string) => void;
  on_email_click: (id: string) => void;
  current_view: string;
  folders: { id: string; name: string; color: string }[];
  tags: { tag_token: string; name: string; color: string }[];
  on_reply: (email: InboxEmail) => void;
  on_forward: (email: InboxEmail) => void;
  on_toggle_read: (email: InboxEmail) => void;
  on_toggle_star: (email: InboxEmail) => void;
  on_toggle_pin: (email: InboxEmail) => void;
  on_snooze: (email: InboxEmail, snooze_until: Date) => Promise<void>;
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
  on_email_click,
  current_view,
  folders,
  tags,
  focused_email_id,
  on_reply,
  on_forward,
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
  selected_email_id,
}: EmailListProps): React.ReactElement {
  const { user } = use_auth();
  const { preferences } = use_preferences();
  const hover_timer_ref = useRef<number | null>(null);
  const last_preloaded_ref = useRef<string | null>(null);

  const all_emails = useMemo(
    () => [...pinned_emails, ...primary_emails],
    [pinned_emails, primary_emails],
  );
  const attachment_previews = use_attachment_previews(all_emails);

  const is_special_view =
    current_view === "drafts" || current_view === "scheduled";

  const handle_hover_preload = useCallback(
    (email_id: string) => {
      if (is_special_view) return;
      if (last_preloaded_ref.current === email_id) return;

      if (hover_timer_ref.current !== null) {
        window.clearTimeout(hover_timer_ref.current);
      }

      hover_timer_ref.current = window.setTimeout(() => {
        hover_timer_ref.current = null;
        last_preloaded_ref.current = email_id;
        preload_email_detail(
          email_id,
          user?.email,
          false,
          preferences.conversation_grouping !== false,
        ).catch(() => {});
      }, 50);
    },
    [user?.email, is_special_view, preferences.conversation_grouping],
  );

  useEffect(() => {
    return () => {
      if (hover_timer_ref.current !== null) {
        window.clearTimeout(hover_timer_ref.current);
      }
    };
  }, []);
  const show_hover_actions = !is_special_view;

  const selected_ids = useMemo(
    () => all_emails.filter((e) => e.is_selected).map((e) => e.id),
    [all_emails],
  );

  const selected_folder_tokens = useMemo(() => {
    const tokens = new Set<string>();

    for (const e of all_emails) {
      if (e.is_selected && e.folders) {
        for (const f of e.folders) tokens.add(f.folder_token);
      }
    }

    return Array.from(tokens);
  }, [all_emails]);

  const selected_tag_tokens = useMemo(() => {
    const tokens = new Set<string>();

    for (const e of all_emails) {
      if (e.is_selected && e.tags) {
        for (const t of e.tags) tokens.add(t.id);
      }
    }

    return Array.from(tokens);
  }, [all_emails]);

  const render_email_item = (email: InboxEmail) => (
    <EmailContextMenu
      current_view={current_view}
      email={email}
      folders={folders}
      on_archive={() => on_archive(email)}
      on_custom_snooze={() => on_custom_snooze(email)}
      on_delete={() => on_delete(email)}
      on_folder_toggle={(folder_id) => on_folder_toggle(email, folder_id)}
      on_forward={() => on_forward(email)}
      on_mark_not_spam={() => on_mark_not_spam(email)}
      on_move_to_inbox={() => on_move_to_inbox(email)}
      on_reply={() => on_reply(email)}
      on_restore={() => on_restore(email)}
      on_snooze={(snooze_until) => on_snooze(email, snooze_until)}
      on_spam={() => on_spam(email)}
      on_tag_toggle={(tag_token) => on_tag_toggle(email, tag_token)}
      on_toggle_pin={() => on_toggle_pin(email)}
      on_toggle_read={() => on_toggle_read(email)}
      on_unsnooze={() => on_unsnooze(email)}
      tags={tags.map((t) => ({
        ...t,
        is_assigned: email.tags?.some((et) => et.id === t.tag_token) || false,
      }))}
    >
      <InboxEmailListItem
        attachment_previews={attachment_previews.get(email.id)}
        current_view={current_view}
        density={density}
        email={email}
        is_active={email.id === selected_email_id}
        is_focused={email.id === focused_email_id}
        on_archive={show_hover_actions ? () => on_archive(email) : undefined}
        on_delete={show_hover_actions ? () => on_delete(email) : undefined}
        on_email_click={on_email_click}
        on_mark_not_spam={
          show_hover_actions ? () => on_mark_not_spam(email) : undefined
        }
        on_move_to_inbox={
          show_hover_actions ? () => on_move_to_inbox(email) : undefined
        }
        on_restore={show_hover_actions ? () => on_restore(email) : undefined}
        on_spam={show_hover_actions ? () => on_spam(email) : undefined}
        on_toggle_read={
          show_hover_actions ? () => on_toggle_read(email) : undefined
        }
        on_toggle_select={on_toggle_select}
        on_toggle_star={
          show_hover_actions ? () => on_toggle_star(email) : undefined
        }
        selected_folder_tokens={selected_folder_tokens}
        selected_ids={selected_ids}
        selected_tag_tokens={selected_tag_tokens}
        show_email_preview={show_email_preview}
        show_message_size={show_message_size}
        show_profile_pictures={show_profile_pictures}
        show_thread_count={show_thread_count}
      />
    </EmailContextMenu>
  );

  return (
    <>
      {pinned_emails.length > 0 && (
        <>
          {pinned_emails.map((email) => (
            <div
              key={email.id}
              className="border-b border-edge-secondary"
              style={{
                contentVisibility: "auto",
                containIntrinsicSize: email.has_attachment
                  ? "auto 88px"
                  : "auto 52px",
              }}
              onMouseEnter={() => handle_hover_preload(email.id)}
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
              className="border-b border-edge-secondary"
              style={{
                contentVisibility: "auto",
                containIntrinsicSize: email.has_attachment
                  ? "auto 88px"
                  : "auto 52px",
              }}
              onMouseEnter={() => handle_hover_preload(email.id)}
            >
              {render_email_item(email)}
            </div>
          ))}
        </>
      )}
    </>
  );
}

export function LoadingState(): React.ReactElement {
  const container_ref = useRef<HTMLDivElement>(null);
  const [row_count, set_row_count] = useState(() => {
    const row_height = 44;
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
        const row_height = 44;
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
  }, []);

  return (
    <div ref={container_ref} className="overflow-hidden">
      {Array.from({ length: row_count }).map((_, i) => (
        <SkeletonEmailRow key={i} />
      ))}
    </div>
  );
}

function SkeletonEmailRow(): React.ReactElement {
  return (
    <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 border-b overflow-hidden border-edge-secondary">
      <Skeleton className="w-[18px] h-[18px] flex-shrink-0" />
      <Skeleton className="w-8 h-8 rounded-full flex-shrink-0 hidden sm:block" />
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <Skeleton className="h-4 w-full max-w-[100px]" />
          <Skeleton className="w-10 h-3 sm:hidden ml-auto flex-shrink-0" />
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
}

export function EmptyState({
  current_view,
  user_email,
}: EmptyStateProps): React.ReactElement {
  const { t } = use_i18n();
  const is_inbox = current_view === "inbox" || current_view === "";

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
    if (current_view === "archived") {
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
          <LockClosedIcon className="w-4 h-4 mr-2" />
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
