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
import type { DecryptedFolder } from "@/hooks/use_folders";
import type { DecryptedTag } from "@/hooks/use_tags";

import { memo, useMemo } from "react";
import {
  InboxIcon,
  StarIcon,
  PaperAirplaneIcon,
  DocumentTextIcon,
  ClockIcon,
  BellSnoozeIcon,
  ArchiveBoxIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  EnvelopeIcon,
  PlusIcon,
  LockClosedIcon,
  LockOpenIcon,
  UsersIcon,
  FolderIcon,
  NewspaperIcon,
  AtSymbolIcon,
  BoltIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { tag_icon_map } from "@/components/ui/email_tag";
import { is_folder_unlocked } from "@/hooks/use_protected_folder";
import { PROFILE_COLORS, get_gradient_background } from "@/constants/profile";
import { SidebarNavButton } from "@/components/mobile/sidebar_nav_button";

function get_alias_color(address: string): string {
  let hash = 0;

  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) | 0;
  }

  return PROFILE_COLORS[Math.abs(hash) % PROFILE_COLORS.length];
}

function MobileAliasIcon({
  address,
  is_random,
}: {
  address: string;
  is_random: boolean;
}) {
  const gradient = useMemo(
    () => get_gradient_background(get_alias_color(address)),
    [address],
  );

  return (
    <div
      className="rounded-full flex items-center justify-center"
      style={{
        width: 20,
        height: 20,
        background: gradient,
        boxShadow:
          "inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.15)",
      }}
    >
      {is_random ? (
        <BoltIcon className="w-3 h-3 text-white" />
      ) : (
        <AtSymbolIcon className="w-3 h-3 text-white" />
      )}
    </div>
  );
}

interface NavItem {
  id: string;
  label: string;
  icon: typeof InboxIcon;
  path: string;
  count?: number;
}

interface SidebarAlias {
  id: string;
  full_address: string;
  is_random: boolean;
}

interface DrawerNavContentProps {
  active_path: string;
  handle_nav: (path: string) => void;
  folders: DecryptedFolder[];
  folder_counts: Record<string, number>;
  tags: DecryptedTag[];
  tag_counts: Record<string, number>;
  aliases: SidebarAlias[];
  stats: {
    inbox: number;
    scheduled: number;
    snoozed: number;
    total_items: number;
    archived: number;
    spam: number;
    contacts: number;
    unread: number;
    drafts: number;
    trash: number;
  };
  on_open_create_folder: () => void;
  on_open_create_label: () => void;
  on_open_create_alias: () => void;
  on_open_edit_folder: (folder: DecryptedFolder) => void;
  on_open_edit_tag: (tag: DecryptedTag) => void;
  on_toggle_lock: (folder_id: string, is_currently_locked: boolean) => void;
  on_password_modal: (info: {
    folder_id: string;
    folder_name: string;
    folder_token: string;
    mode: "setup" | "unlock";
  }) => void;
  nav_container_ref: React.Ref<HTMLDivElement>;
  indicator_style: { y: number; height: number; opacity: number };
}

export const DrawerNavContent = memo(function DrawerNavContent({
  active_path,
  handle_nav,
  folders,
  folder_counts,
  tags,
  tag_counts,
  aliases,
  stats,
  on_open_create_folder,
  on_open_create_label,
  on_open_create_alias,
  on_open_edit_folder,
  on_open_edit_tag,
  on_toggle_lock,
  on_password_modal,
  nav_container_ref,
  indicator_style,
}: DrawerNavContentProps) {
  const { t } = use_i18n();

  const is_active = (path: string) => {
    if (path === "/") return active_path === "/" || active_path === "/inbox";

    return active_path.startsWith(path);
  };

  const mail_items: NavItem[] = [
    {
      id: "inbox",
      label: t("mail.inbox"),
      icon: InboxIcon,
      path: "/",
      count: stats.unread,
    },
    {
      id: "sent",
      label: t("mail.sent"),
      icon: PaperAirplaneIcon,
      path: "/sent",
    },
    {
      id: "scheduled",
      label: t("mail.scheduled"),
      icon: ClockIcon,
      path: "/scheduled",
      count: stats.scheduled,
    },
    {
      id: "snoozed",
      label: t("mail.snoozed"),
      icon: BellSnoozeIcon,
      path: "/snoozed",
      count: stats.snoozed,
    },
    {
      id: "drafts",
      label: t("mail.drafts"),
      icon: DocumentTextIcon,
      path: "/drafts",
      count: stats.drafts,
    },
  ];

  const more_items: NavItem[] = [
    {
      id: "starred",
      label: t("mail.starred"),
      icon: StarIcon,
      path: "/starred",
    },
    {
      id: "all",
      label: t("mail.all_mail"),
      icon: EnvelopeIcon,
      path: "/all",
    },
    {
      id: "archive",
      label: t("mail.archive"),
      icon: ArchiveBoxIcon,
      path: "/archive",
    },
    {
      id: "spam",
      label: t("mail.spam"),
      icon: ExclamationTriangleIcon,
      path: "/spam",
      count: stats.spam,
    },
    {
      id: "trash",
      label: t("mail.trash"),
      icon: TrashIcon,
      path: "/trash",
      count: stats.trash,
    },
  ];

  return (
    <div ref={nav_container_ref} className="relative">
      <div
        className="pointer-events-none absolute left-0 w-full rounded-lg"
        style={{
          top: 0,
          transform: `translateY(${indicator_style.y}px)`,
          height: indicator_style.height,
          opacity: indicator_style.opacity,
          backgroundColor: "var(--mobile-indicator-bg, var(--indicator-bg))",
          boxShadow: "inset 0 0 0 1px var(--border-primary)",
          zIndex: 0,
          transition: "opacity 150ms ease",
        }}
      />

      <div className="mb-1 px-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] opacity-70">
          {t("common.mail")}
        </span>
      </div>
      {mail_items.map((item) => (
        <SidebarNavButton
          key={item.id}
          active={is_active(item.path)}
          count={item.count}
          icon={<item.icon className="h-5 w-5" />}
          label={item.label}
          on_click={() => handle_nav(item.path)}
        />
      ))}

      <div className="mb-1 mt-5 px-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] opacity-70">
          {t("common.more")}
        </span>
      </div>
      {more_items.map((item) => (
        <SidebarNavButton
          key={item.id}
          active={is_active(item.path)}
          count={item.count}
          icon={<item.icon className="h-5 w-5" />}
          label={item.label}
          on_click={() => handle_nav(item.path)}
        />
      ))}
      <SidebarNavButton
        active={active_path === "/contacts"}
        count={stats.contacts}
        icon={<UsersIcon className="h-5 w-5" />}
        label={t("common.contacts")}
        on_click={() => handle_nav("/contacts")}
      />
      <SidebarNavButton
        active={active_path === "/subscriptions"}
        icon={<NewspaperIcon className="h-5 w-5" />}
        label={t("common.subscriptions")}
        on_click={() => handle_nav("/subscriptions")}
      />

      <div className="mb-1 mt-5 px-2.5">
        <div className="flex w-full items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] opacity-70">
            {t("common.folders")}
          </span>
          <button
            className="rounded p-0.5 text-[var(--text-muted)] transition-all duration-150 active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_open_create_folder}
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {folders.length === 0 && (
        <p className="px-2.5 py-2 text-[11px] text-[var(--text-muted)]">
          {t("common.no_folders_yet")}
        </p>
      )}
      {folders.map((folder) => {
        const path = `/folder/${encodeURIComponent(folder.folder_token)}`;
        const count = folder_counts[folder.folder_token];
        const folder_color = folder.color || "#3b82f6";

        return (
          <SidebarNavButton
            key={folder.folder_token}
            active={is_active(path)}
            count={count}
            icon={
              <FolderIcon className="h-5 w-5" style={{ color: folder_color }} />
            }
            label={folder.name}
            on_click={() => {
              if (folder.is_password_protected) {
                if (!folder.password_set) {
                  on_password_modal({
                    folder_id: folder.id,
                    folder_name: folder.name,
                    folder_token: folder.folder_token,
                    mode: "setup",
                  });

                  return;
                }
                if (!is_folder_unlocked(folder.id)) {
                  on_password_modal({
                    folder_id: folder.id,
                    folder_name: folder.name,
                    folder_token: folder.folder_token,
                    mode: "unlock",
                  });

                  return;
                }
              }
              handle_nav(path);
            }}
            on_long_press={() => on_open_edit_folder(folder)}
            trailing={
              folder.is_password_protected ? (
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] active:bg-[var(--bg-tertiary)]"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    on_toggle_lock(folder.id, folder.is_locked);
                  }}
                >
                  {folder.is_locked || !is_folder_unlocked(folder.id) ? (
                    <LockClosedIcon className="h-4 w-4" />
                  ) : (
                    <LockOpenIcon className="h-4 w-4" />
                  )}
                </button>
              ) : undefined
            }
          />
        );
      })}

      <div className="mb-1 mt-5 px-2.5">
        <div className="flex w-full items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] opacity-70">
            {t("common.labels")}
          </span>
          <button
            className="rounded p-0.5 text-[var(--text-muted)] transition-all duration-150 active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_open_create_label}
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {tags.length === 0 && (
        <p className="px-2.5 py-2 text-[11px] text-[var(--text-muted)]">
          {t("common.no_labels_yet")}
        </p>
      )}
      {tags.map((tag) => {
        const path = `/tag/${encodeURIComponent(tag.tag_token)}`;
        const count = tag_counts[tag.tag_token];
        const tag_color = tag.color || "#3b82f6";
        const TagIconComponent = tag.icon ? tag_icon_map[tag.icon] : null;

        return (
          <SidebarNavButton
            key={tag.tag_token}
            active={is_active(path)}
            count={count}
            icon={
              TagIconComponent ? (
                <TagIconComponent
                  className="h-4 w-4"
                  style={{ color: tag_color }}
                />
              ) : (
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: tag_color }}
                />
              )
            }
            label={tag.name}
            on_click={() => handle_nav(path)}
            on_long_press={() => on_open_edit_tag(tag)}
          />
        );
      })}

      <div className="mb-1 mt-5 px-2.5">
        <div className="flex w-full items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] opacity-70">
            {t("common.aliases")}
          </span>
          <button
            className="rounded p-0.5 text-[var(--text-muted)] transition-all duration-150 active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_open_create_alias}
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {aliases.length === 0 && (
        <p className="px-2.5 py-2 text-[11px] text-[var(--text-muted)]">
          {t("common.no_aliases_yet")}
        </p>
      )}
      {aliases.map((alias) => {
        const path = `/alias/${encodeURIComponent(alias.full_address)}`;

        return (
          <SidebarNavButton
            key={alias.id}
            active={is_active(path)}
            icon={
              <MobileAliasIcon
                address={alias.full_address}
                is_random={alias.is_random}
              />
            }
            label={alias.full_address}
            on_click={() => handle_nav(path)}
          />
        );
      })}
    </div>
  );
});
