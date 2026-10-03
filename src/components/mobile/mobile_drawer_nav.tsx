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

import { memo } from "react";
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
  BarsArrowDownIcon,
  PlusIcon,
  UsersIcon,
  NewspaperIcon,
} from "@heroicons/react/24/outline";
import {
  MobileDrawerBackButton,
  MobileDrawerFolderRow,
  MobileDrawerNavIndicator,
  MobileDrawerSectionHeader,
  MobileDrawerSectionPlaceholder,
  MobileDrawerTagIcon,
} from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  build_folder_tree,
  build_tree_guides,
  flatten_folder_tree,
  is_folder_tree_sorted_a_z,
} from "@/hooks/use_folders";
import { is_folder_unlocked } from "@/hooks/use_protected_folder";
import { AliasNavIcon } from "@/components/common/alias_nav_icon";
import { SidebarNavButton } from "@/components/mobile/sidebar_nav_button";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { app_locale } from "@/utils/date_format";

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
  alias_address_hash?: string;
  profile_picture?: string;
}

interface DrawerNavContentProps {
  active_path: string;
  handle_nav: (path: string) => void;
  folders: DecryptedFolder[];
  folders_loading: boolean;
  folders_load_failed?: boolean;
  on_retry_folders?: () => void;
  folder_unread_counts: Record<string, number>;
  tags: DecryptedTag[];
  tags_loading: boolean;
  tags_load_failed?: boolean;
  on_retry_tags?: () => void;
  tag_counts: Record<string, number>;
  aliases: SidebarAlias[];
  aliases_loading: boolean;
  aliases_load_failed?: boolean;
  on_retry_aliases?: () => void;
  alias_unread_counts?: Record<string, number>;
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
  on_sort_folders?: () => void;
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
  folders_loading,
  folders_load_failed = false,
  on_retry_folders,
  folder_unread_counts,
  tags,
  tags_loading,
  tags_load_failed = false,
  on_retry_tags,
  tag_counts,
  aliases,
  aliases_loading,
  aliases_load_failed = false,
  on_retry_aliases,
  alias_unread_counts = {},
  stats,
  on_open_create_folder,
  on_sort_folders,
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

  const { preferences } = use_preferences();
  const muted_folder_tokens = new Set(preferences.muted_folder_tokens ?? []);

  const folder_tree = build_folder_tree(folders);
  const folder_nodes = flatten_folder_tree(folder_tree);
  const can_sort_folders =
    folders.length > 1 && !is_folder_tree_sorted_a_z(folders);
  const folder_guides = build_tree_guides(folder_tree);

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

  const locale = app_locale();

  return (
    <div ref={nav_container_ref} className="relative">
      <MobileDrawerNavIndicator indicator_style={indicator_style} />

      {(active_path.startsWith("/alias/") ||
        active_path.startsWith("/folder/") ||
        active_path.startsWith("/tag/")) && (
        <MobileDrawerBackButton
          label={t("mail.inbox")}
          on_click={() => handle_nav("/")}
        />
      )}

      <MobileDrawerSectionHeader is_first label={t("common.mail")} />
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

      <MobileDrawerSectionHeader label={t("common.more")} />
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

      {on_sort_folders && can_sort_folders ? (
        <div className="mb-1 mt-5 px-2.5">
          <div className="flex w-full items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] opacity-70">
              {t("common.folders")}
            </span>
            <div className="flex items-center gap-2">
              <button
                aria-label={t("common.sort_a_to_z")}
                className="-m-1 flex min-h-6 min-w-6 items-center justify-center rounded p-1.5 text-[var(--text-muted)] transition-all duration-150 active:bg-[var(--bg-tertiary)]"
                data-testid="mobile-folders-sort-a-to-z"
                type="button"
                onClick={on_sort_folders}
              >
                <BarsArrowDownIcon className="h-3.5 w-3.5" />
              </button>
              <button
                aria-label={t("common.create_folder")}
                className="-m-1 flex min-h-6 min-w-6 items-center justify-center rounded p-1.5 text-[var(--text-muted)] transition-all duration-150 active:bg-[var(--bg-tertiary)]"
                type="button"
                onClick={on_open_create_folder}
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <MobileDrawerSectionHeader
          add_label={t("common.create_folder")}
          label={t("common.folders")}
          on_add={on_open_create_folder}
        />
      )}
      {folders.length === 0 && (
        <MobileDrawerSectionPlaceholder
          empty_text={t("common.no_folders_yet")}
          failed_notice={
            folders_load_failed && on_retry_folders ? (
              <LoadFailedNotice on_retry={on_retry_folders} />
            ) : undefined
          }
          is_loading={folders_loading}
          skeleton_rows={3}
        />
      )}
      {folder_nodes.map((node) => {
        const folder = node.folder;
        const guides = folder_guides.get(folder.folder_token);
        const path = `/folder/${encodeURIComponent(folder.folder_token)}`;
        const is_locked_closed =
          folder.is_locked ||
          (folder.is_password_protected &&
            (!folder.password_set || !is_folder_unlocked(folder.id)));
        const count = is_locked_closed
          ? undefined
          : (folder_unread_counts[folder.folder_token] ??
            folder.unread_count ??
            0);

        return (
          <MobileDrawerFolderRow
            key={folder.folder_token}
            active={is_active(path)}
            color={folder.color || "#3b82f6"}
            count={count}
            depth={node.depth}
            guide_has_next={guides?.has_next}
            guide_trail={guides?.trail}
            label={folder.name}
            locale={locale}
            lock_closed={folder.is_locked || !is_folder_unlocked(folder.id)}
            muted_label={
              muted_folder_tokens.has(folder.folder_token)
                ? t("common.notifications_muted")
                : undefined
            }
            show_lock_toggle={!!folder.is_password_protected}
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
            on_toggle_lock={() => on_toggle_lock(folder.id, folder.is_locked)}
          />
        );
      })}

      <MobileDrawerSectionHeader
        add_label={t("common.create_label")}
        label={t("common.labels")}
        on_add={on_open_create_label}
      />
      {tags.length === 0 && (
        <MobileDrawerSectionPlaceholder
          empty_text={t("common.no_labels_yet")}
          failed_notice={
            tags_load_failed && on_retry_tags ? (
              <LoadFailedNotice on_retry={on_retry_tags} />
            ) : undefined
          }
          is_loading={tags_loading}
          skeleton_rows={2}
        />
      )}
      {tags.map((tag) => {
        const path = `/tag/${encodeURIComponent(tag.tag_token)}`;

        return (
          <SidebarNavButton
            key={tag.tag_token}
            active={is_active(path)}
            count={tag_counts[tag.tag_token]}
            icon={
              <MobileDrawerTagIcon
                color={tag.color || "#3b82f6"}
                icon={tag.icon}
              />
            }
            label={tag.name}
            on_click={() => handle_nav(path)}
            on_long_press={() => on_open_edit_tag(tag)}
          />
        );
      })}

      <MobileDrawerSectionHeader
        add_label={t("settings.create_alias")}
        label={t("common.aliases")}
        on_add={on_open_create_alias}
      />
      {aliases.length === 0 && (
        <MobileDrawerSectionPlaceholder
          empty_text={t("common.no_aliases_yet")}
          failed_notice={
            aliases_load_failed && on_retry_aliases ? (
              <LoadFailedNotice on_retry={on_retry_aliases} />
            ) : undefined
          }
          is_loading={aliases_loading}
          skeleton_rows={2}
        />
      )}
      {aliases.map((alias) => {
        const path = `/alias/${encodeURIComponent(alias.full_address)}`;
        const unread_count = alias.alias_address_hash
          ? (alias_unread_counts[alias.alias_address_hash] ?? 0)
          : 0;

        return (
          <SidebarNavButton
            key={alias.id}
            active={is_active(path)}
            count={unread_count}
            icon={
              <AliasNavIcon
                address={alias.full_address}
                icon_class_name="w-3 h-3"
                is_random={alias.is_random}
                profile_picture={alias.profile_picture}
                size={20}
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
