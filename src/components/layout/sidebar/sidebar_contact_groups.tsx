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
import type { ContactGroup } from "@/types/contacts";

import { memo, useState } from "react";
import {
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronRightIcon,
  PencilIcon,
  TrashIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert_dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context_menu";
import { NavSectionSkeleton } from "@/components/common/nav_section_skeleton";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { ContactGroupModal } from "@/components/contacts/contact_group_modal";
import { use_contact_groups } from "@/hooks/use_contact_groups";
import { use_i18n } from "@/lib/i18n/context";

interface SidebarContactGroupsProps {
  is_collapsed: boolean;
  effective_selected: string | null;
  handle_nav_click: (callback: () => void) => void;
  set_selected_item: (item: string) => void;
  navigate: (path: string) => void;
  section_collapsed?: boolean;
  on_toggle_section?: () => void;
}

export const SidebarContactGroups = memo(function SidebarContactGroups({
  is_collapsed,
  effective_selected,
  handle_nav_click,
  set_selected_item,
  navigate,
  section_collapsed = false,
  on_toggle_section,
}: SidebarContactGroupsProps) {
  const { t } = use_i18n();
  const { groups, is_loading, error, fetch_groups, remove_group } =
    use_contact_groups();
  const [is_expanded, set_is_expanded] = useState(false);
  const [editing_group, set_editing_group] = useState<ContactGroup | null>(
    null,
  );
  const [is_modal_open, set_is_modal_open] = useState(false);
  const [pending_delete, set_pending_delete] = useState<ContactGroup | null>(
    null,
  );

  const max_visible = is_collapsed ? 3 : 5;
  const has_more = groups.length > max_visible;
  const visible_groups = is_expanded ? groups : groups.slice(0, max_visible);
  const hidden_count = groups.length - max_visible;

  const open_create = () => {
    set_editing_group(null);
    set_is_modal_open(true);
  };

  const open_rename = (group: ContactGroup) => {
    set_editing_group(group);
    set_is_modal_open(true);
  };

  return (
    <>
      {!is_collapsed && (
        <div className="mt-5 mb-1 px-2.5">
          <div className="w-full flex items-center justify-between">
            <button
              className="flex-1 flex items-center gap-1 py-1 text-txt-muted opacity-70 hover:opacity-100"
              onClick={on_toggle_section}
            >
              {section_collapsed ? (
                <ChevronRightIcon className="w-3 h-3 rtl:-scale-x-100" />
              ) : (
                <ChevronDownIcon className="w-3 h-3" />
              )}
              <span className="text-[10px] font-semibold uppercase tracking-[0.05em]">
                {t("common.contact_groups")}
              </span>
            </button>
            <button
              aria-label={t("common.create_contact_group")}
              className="p-1 rounded-[14px] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-icon-muted"
              onClick={open_create}
            >
              <PlusIcon aria-hidden="true" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {is_collapsed && (
        <div className="mt-3">
          <button
            className="sidebar-rail-btn"
            data-rail-tip={t("common.create_contact_group")}
            onClick={open_create}
          >
            <UserGroupIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      <div>
        {!section_collapsed &&
          visible_groups.map((group) => {
            const item_id = `contact-group-${group.id}`;
            const is_active = effective_selected === item_id;

            return (
              <ContextMenu key={group.id}>
                <ContextMenuTrigger asChild>
                  <button
                    className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-[12px] ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px] ${is_active ? "sidebar-active" : ""} ${is_collapsed && is_active ? "sidebar-selected" : ""}`}
                    data-rail-tip={is_collapsed ? group.name : undefined}
                    style={{
                      zIndex: 1,
                      color: is_active
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                      backgroundColor:
                        is_collapsed && is_active
                          ? "var(--indicator-bg)"
                          : undefined,
                    }}
                    onClick={() =>
                      handle_nav_click(() => {
                        set_selected_item(item_id);
                        navigate(
                          `/contacts?group=${encodeURIComponent(group.id)}`,
                        );
                      })
                    }
                  >
                    <div
                      className={`${is_collapsed ? "w-3 h-3" : "w-2.5 h-2.5"} rounded-full flex-shrink-0`}
                      style={{ backgroundColor: group.color }}
                    />
                    {!is_collapsed && (
                      <span className="flex-1 text-start truncate leading-5">
                        {group.name}
                      </span>
                    )}
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                  <ContextMenuItem onClick={() => open_rename(group)}>
                    <PencilIcon className="me-2 h-4 w-4" />
                    {t("common.rename")}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                    onClick={() => set_pending_delete(group)}
                  >
                    <TrashIcon className="me-2 h-4 w-4" />
                    {t("common.delete")}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}

        {has_more && !is_collapsed && !section_collapsed && (
          <button
            className="w-full flex items-center gap-2 px-2.5 h-7 text-[12px] rounded-[12px] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] text-txt-muted"
            onClick={() => set_is_expanded(!is_expanded)}
          >
            {is_expanded ? (
              <ChevronUpIcon className="w-3.5 h-3.5" />
            ) : (
              <ChevronDownIcon className="w-3.5 h-3.5" />
            )}
            <span>
              {is_expanded
                ? t("common.show_less")
                : t("common.more_contact_groups", { count: hidden_count })}
            </span>
          </button>
        )}

        {groups.length === 0 &&
          is_loading &&
          !is_collapsed &&
          !section_collapsed && <NavSectionSkeleton rows={2} />}

        {groups.length === 0 &&
          !is_loading &&
          !is_collapsed &&
          !section_collapsed &&
          (error ? (
            <LoadFailedNotice on_retry={fetch_groups} />
          ) : (
            <p className="text-[11px] px-2.5 py-2 text-txt-muted">
              {t("common.no_contact_groups_yet")}
            </p>
          ))}
      </div>

      <ContactGroupModal
        group={editing_group}
        is_open={is_modal_open}
        on_close={() => set_is_modal_open(false)}
      />

      <AlertDialog
        open={pending_delete !== null}
        onOpenChange={(open) => {
          if (!open) set_pending_delete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("common.delete_contact_group")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("common.delete_contact_group_confirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending_delete) remove_group(pending_delete.id);
                set_pending_delete(null);
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
