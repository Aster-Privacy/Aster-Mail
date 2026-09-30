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
import type { ElementType, ReactNode, RefObject } from "react";

import { Fragment, memo } from "react";
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
  UsersIcon,
  EnvelopeOpenIcon,
} from "@heroicons/react/24/outline";
import {
  SidebarNavRow,
  SidebarSectionHeader,
  SidebarSectionToggle,
} from "@aster/ui";

import { AllMailIcon } from "@/components/common/icons";
import { CountBadge } from "@/components/common/count_badge";
import { RailUnreadDot } from "@/components/common/rail_unread_dot";
import { use_i18n } from "@/lib/i18n/context";

interface SidebarNavSectionProps {
  is_collapsed: boolean;
  effective_selected: string | null;
  stats: {
    inbox: number;
    unread: number;
    drafts: number;
    scheduled: number;
    snoozed: number;
    total_items: number;
    archived: number;
    spam: number;
    trash: number;
    contacts: number;
  };
  stats_loading?: boolean;
  section_collapsed: boolean;
  on_toggle_section: () => void;
  handle_nav_click: (callback: () => void) => void;
  set_selected_item: (item: string) => void;
  navigate: (path: string) => void;
  inbox_ref: RefObject<HTMLButtonElement>;
  sent_ref: RefObject<HTMLButtonElement>;
  scheduled_ref: RefObject<HTMLButtonElement>;
  snoozed_ref: RefObject<HTMLButtonElement>;
  drafts_ref: RefObject<HTMLButtonElement>;
  starred_ref: RefObject<HTMLButtonElement>;
  all_mail_ref: RefObject<HTMLButtonElement>;
  archive_ref: RefObject<HTMLButtonElement>;
  spam_ref: RefObject<HTMLButtonElement>;
  trash_ref: RefObject<HTMLButtonElement>;
  contacts_ref: RefObject<HTMLButtonElement>;
  subscriptions_ref: RefObject<HTMLButtonElement>;
  inbox_children_slot?: ReactNode;
}

interface NavItem {
  id: string;
  label: string;
  icon: ElementType;
  path: string;
  button_ref: RefObject<HTMLButtonElement>;
  count?: number;
  on_after_navigate?: () => void;
  after?: ReactNode;
}

export const SidebarNavSection = memo(function SidebarNavSection({
  is_collapsed,
  effective_selected,
  stats,
  stats_loading = false,
  section_collapsed,
  on_toggle_section,
  handle_nav_click,
  set_selected_item,
  navigate,
  inbox_ref,
  sent_ref,
  scheduled_ref,
  snoozed_ref,
  drafts_ref,
  starred_ref,
  all_mail_ref,
  archive_ref,
  spam_ref,
  trash_ref,
  contacts_ref,
  subscriptions_ref,
  inbox_children_slot,
}: SidebarNavSectionProps) {
  const { t } = use_i18n();

  const primary_items: NavItem[] = [
    {
      id: "inbox",
      label: t("mail.inbox"),
      icon: InboxIcon,
      path: "/",
      button_ref: inbox_ref,
      count: stats.unread,
      on_after_navigate: () =>
        window.dispatchEvent(new CustomEvent("astermail:inbox-home")),
      after: inbox_children_slot,
    },
    {
      id: "sent",
      label: t("mail.sent"),
      icon: PaperAirplaneIcon,
      path: "/sent",
      button_ref: sent_ref,
    },
    {
      id: "scheduled",
      label: t("mail.scheduled"),
      icon: ClockIcon,
      path: "/scheduled",
      button_ref: scheduled_ref,
      count: stats.scheduled,
    },
    {
      id: "snoozed",
      label: t("mail.snoozed"),
      icon: BellSnoozeIcon,
      path: "/snoozed",
      button_ref: snoozed_ref,
      count: stats.snoozed,
    },
    {
      id: "drafts",
      label: t("mail.drafts"),
      icon: DocumentTextIcon,
      path: "/drafts",
      button_ref: drafts_ref,
      count: stats.drafts,
    },
    {
      id: "contacts",
      label: t("common.contacts"),
      icon: UsersIcon,
      path: "/contacts",
      button_ref: contacts_ref,
    },
  ];

  const more_items: NavItem[] = [
    {
      id: "starred",
      label: t("mail.starred"),
      icon: StarIcon,
      path: "/starred",
      button_ref: starred_ref,
    },
    {
      id: "all",
      label: t("mail.all_mail"),
      icon: AllMailIcon,
      path: "/all",
      button_ref: all_mail_ref,
    },
    {
      id: "archive",
      label: t("mail.archive"),
      icon: ArchiveBoxIcon,
      path: "/archive",
      button_ref: archive_ref,
    },
    {
      id: "spam",
      label: t("mail.spam"),
      icon: ExclamationTriangleIcon,
      path: "/spam",
      button_ref: spam_ref,
      count: stats.spam,
    },
    {
      id: "trash",
      label: t("mail.trash"),
      icon: TrashIcon,
      path: "/trash",
      button_ref: trash_ref,
      count: stats.trash,
    },
    {
      id: "subscriptions",
      label: t("common.subscriptions"),
      icon: EnvelopeOpenIcon,
      path: "/subscriptions",
      button_ref: subscriptions_ref,
    },
  ];

  const render_item = (item: NavItem) => {
    const selected = effective_selected === item.id;

    return (
      <Fragment key={item.id}>
        <SidebarNavRow
          ref={item.button_ref}
          rail_tip
          collapsed_slot={
            item.id === "inbox" ? (
              <RailUnreadDot count={stats.unread} label={item.label} />
            ) : undefined
          }
          icon={item.icon}
          is_collapsed={is_collapsed}
          label={item.label}
          on_click={() =>
            handle_nav_click(() => {
              set_selected_item(item.id);
              navigate(item.path);
              item.on_after_navigate?.();
            })
          }
          selected={selected}
          trailing={
            item.count !== undefined ? (
              <CountBadge
                count={item.count}
                is_active={selected}
                is_loading={stats_loading}
              />
            ) : undefined
          }
        />
        {item.after}
      </Fragment>
    );
  };

  return (
    <>
      <SidebarSectionHeader
        is_collapsed={is_collapsed}
        label={t("common.mail")}
      />

      {primary_items.map(render_item)}

      <SidebarSectionToggle
        is_collapsed={is_collapsed}
        label={t("common.more")}
        on_toggle={on_toggle_section}
        section_collapsed={section_collapsed}
      />

      {is_collapsed && <div className="mt-3" />}

      {(!section_collapsed || is_collapsed) && <>{more_items.map(render_item)}</>}
    </>
  );
});
