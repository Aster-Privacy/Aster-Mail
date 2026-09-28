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
import type { MutableRefObject } from "react";
import type { DecryptedFolder, FolderTreeNode } from "@/hooks/use_folders";

import {
  memo,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useSyncExternalStore,
} from "react";
import { BarsArrowDownIcon, PlusIcon } from "@heroicons/react/24/outline";
import {
  SidebarEmptyText,
  SidebarFolderRowView,
  SidebarMoreToggle,
  SidebarRailSectionButton,
  SidebarSectionAddButton,
  SidebarSectionToggle,
} from "@aster/ui";

import {
  build_folder_tree,
  build_tree_guides,
  flatten_folder_tree,
  flatten_visible_tree,
  get_sibling_folders,
  is_folder_tree_sorted_a_z,
} from "@/hooks/use_folders";
import { EMAIL_DRAG_MIME } from "@/components/email/inbox/category_drag";
import { NavSectionSkeleton } from "@/components/common/nav_section_skeleton";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { FolderContextMenu } from "@/components/folders/folder_context_menu";
import { is_folder_unlocked } from "@/hooks/use_protected_folder";
import { use_delayed_flag } from "@/hooks/use_delayed_flag";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import {
  get_expanded_folders,
  set_expanded_folders,
  subscribe_expanded_folders,
} from "@/services/expanded_folders_store";
import { app_locale } from "@/utils/date_format";

export interface FolderModalData {
  folder_id: string;
  folder_name: string;
  folder_token: string;
  folder_color: string;
  is_locked?: boolean;
  hasChildren?: boolean;
}

interface SidebarFoldersProps {
  account_id?: string;
  is_collapsed: boolean;
  effective_selected: string | null;
  folders: DecryptedFolder[];
  folder_unread_counts?: Record<string, number>;
  folders_expanded: boolean;
  set_folders_expanded: (expanded: boolean) => void;
  is_loading: boolean;
  handle_nav_click: (callback: () => void) => void;
  set_selected_item: (item: string) => void;
  navigate: (path: string) => void;
  set_is_create_folder_open: (open: boolean) => void;
  set_create_folder_parent_token?: (token: string | undefined) => void;
  handle_folder_modal: (
    folder: FolderModalData,
    action: "rename" | "recolor" | "delete" | "move",
  ) => void;
  handle_folder_lock: (folder: FolderModalData, password_set: boolean) => void;
  set_password_modal_folder: (
    data: {
      folder_id: string;
      folder_name: string;
      folder_token: string;
      mode: "setup" | "unlock" | "settings";
    } | null,
  ) => void;
  folder_refs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  on_drop_emails?: (
    email_ids: string[],
    folder_token: string,
    folder_name: string,
  ) => void;
  section_collapsed?: boolean;
  on_toggle_section?: () => void;
  variant?: "section" | "pinned";
  reorder_folders?: (
    entries: { id: string; sort_order: number }[],
  ) => Promise<boolean>;
  sort_folders_a_z?: () => Promise<boolean>;
  load_failed?: boolean;
  on_retry?: () => void;
}

export const SidebarFolders = memo(function SidebarFolders({
  account_id = "",
  is_collapsed,
  effective_selected,
  folders,
  folder_unread_counts,
  folders_expanded,
  set_folders_expanded,
  is_loading,
  handle_nav_click,
  set_selected_item,
  navigate,
  set_is_create_folder_open,
  set_create_folder_parent_token,
  handle_folder_modal,
  handle_folder_lock,
  set_password_modal_folder,
  folder_refs,
  on_drop_emails,
  section_collapsed = false,
  on_toggle_section,
  variant = "section",
  reorder_folders,
  sort_folders_a_z,
  load_failed = false,
  on_retry,
}: SidebarFoldersProps) {
  const { t } = use_i18n();
  const skeleton_visible = use_delayed_flag(is_loading);
  const is_pinned = variant === "pinned";

  const [drag_over_token, set_drag_over_token] = useState<string | null>(null);
  const get_expanded_snapshot = useCallback(
    () => get_expanded_folders(account_id),
    [account_id],
  );
  const expanded_folders = useSyncExternalStore(
    subscribe_expanded_folders,
    get_expanded_snapshot,
  );

  useEffect(() => {
    const handle_drag_end = () => set_drag_over_token(null);

    window.addEventListener("dragend", handle_drag_end);

    return () => window.removeEventListener("dragend", handle_drag_end);
  }, []);

  const [, set_lock_version] = useState(0);

  useEffect(() => {
    const handler = () => set_lock_version((v) => v + 1);

    window.addEventListener("astermail:folder-locked", handler);

    return () => window.removeEventListener("astermail:folder-locked", handler);
  }, []);

  const tree = useMemo(() => build_folder_tree(folders), [folders]);
  const can_sort_a_to_z = useMemo(
    () => folders.length > 1 && !is_folder_tree_sorted_a_z(folders),
    [folders],
  );
  const handle_sort_a_to_z = sort_folders_a_z
    ? async () => {
        if (await sort_folders_a_z()) {
          show_toast(t("common.folders_sorted_a_to_z"), "success");
        } else {
          show_toast(t("common.something_went_wrong_try_again"), "error");
        }
      }
    : undefined;
  const tree_guides = useMemo(() => build_tree_guides(tree), [tree]);

  const visible_nodes = useMemo(() => {
    if (is_collapsed) {
      return tree.map((node) => ({ ...node, children: [] }));
    }

    if (is_pinned) {
      return flatten_visible_tree(tree, expanded_folders);
    }

    const max_visible = 5;
    const root_nodes = folders_expanded ? tree : tree.slice(0, max_visible);

    return flatten_visible_tree(root_nodes, expanded_folders);
  }, [tree, folders_expanded, expanded_folders, is_collapsed, is_pinned]);

  const root_count = tree.length;
  const max_visible = is_collapsed ? 3 : 5;
  const has_more = root_count > max_visible;
  const hidden_count = root_count - max_visible;

  const toggle_expanded = (folder_token: string) => {
    const next = new Set(expanded_folders);

    if (next.has(folder_token)) {
      next.delete(folder_token);
    } else {
      next.add(folder_token);
    }

    set_expanded_folders(account_id, next);
  };

  const set_subtree_expanded = (node: FolderTreeNode, expanded: boolean) => {
    const next = new Set(expanded_folders);

    for (const item of flatten_folder_tree([node])) {
      if (item.children.length === 0) continue;
      if (expanded) {
        next.add(item.folder.folder_token);
      } else {
        next.delete(item.folder.folder_token);
      }
    }

    set_expanded_folders(account_id, next);
  };

  return (
    <>
      {!is_pinned && (
        <SidebarSectionToggle
          data_onboarding="folders-section"
          is_collapsed={is_collapsed}
          label={t("common.folders")}
          on_toggle={on_toggle_section ?? (() => {})}
          right_slot={
            <>
              {handle_sort_a_to_z && can_sort_a_to_z && (
                <button
                  aria-label={t("common.sort_a_to_z")}
                  className="p-1 rounded-[var(--aster-radius-item)] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-icon-muted"
                  data-rail-tip={t("common.sort_a_to_z")}
                  data-testid="folders-sort-a-to-z"
                  type="button"
                  onClick={() => void handle_sort_a_to_z()}
                >
                  <BarsArrowDownIcon aria-hidden="true" className="w-4 h-4" />
                </button>
              )}
              <SidebarSectionAddButton
                rail_tip
                label={t("common.create_folder")}
                on_click={() => set_is_create_folder_open(true)}
              />
            </>
          }
          section_collapsed={section_collapsed}
        />
      )}

      {is_collapsed && !is_pinned && (
        <SidebarRailSectionButton
          icon={PlusIcon}
          label={t("common.create_folder")}
          on_click={() => set_is_create_folder_open(true)}
        />
      )}

      <div>
        {(!section_collapsed || is_pinned) &&
          visible_nodes.map((node) => {
            const folder = node.folder;
            const folder_item_id = `folder-${folder.folder_token}`;
            const folder_color = folder.color || "#3b82f6";
            const folder_data: FolderModalData = {
              folder_id: folder.id,
              folder_name: folder.name,
              folder_token: folder.folder_token,
              folder_color,
              hasChildren: node.children.length > 0,
            };
            const hasChildren = node.children.length > 0;
            const is_expanded = expanded_folders.has(folder.folder_token);
            const siblings = reorder_folders
              ? get_sibling_folders(folders, folder.id)
              : [];
            const sibling_index = siblings.findIndex((f) => f.id === folder.id);
            const handle_sibling_reorder = async (direction: number) => {
              const target = sibling_index + direction;

              if (
                !reorder_folders ||
                sibling_index < 0 ||
                target < 0 ||
                target >= siblings.length
              ) {
                return;
              }

              const next = [...siblings];
              const [moved] = next.splice(sibling_index, 1);

              next.splice(target, 0, moved);

              const entries = next
                .map((f, i) => ({ id: f.id, sort_order: i }))
                .filter((entry, i) => next[i].sort_order !== entry.sort_order);

              if (!(await reorder_folders(entries))) {
                show_toast(t("common.something_went_wrong_try_again"), "error");
              }
            };
            const selected = effective_selected === folder_item_id;
            const unread_count =
              folder_unread_counts?.[folder.folder_token] ??
              folder.unread_count ??
              0;
            const guides = tree_guides.get(folder.folder_token);
            const is_locked_closed =
              folder.is_locked ||
              (folder.is_password_protected &&
                (!folder.password_set || !is_folder_unlocked(folder.id)));

            return (
              <FolderContextMenu
                key={folder.id}
                can_have_children={node.depth < 4}
                can_move_down={
                  sibling_index >= 0 && sibling_index < siblings.length - 1
                }
                can_move_up={sibling_index > 0}
                can_sort_a_to_z={can_sort_a_to_z}
                folder_color={folder_color}
                folder_token={folder.folder_token}
                on_collapse_all={
                  hasChildren && !is_collapsed
                    ? () => set_subtree_expanded(node, false)
                    : undefined
                }
                on_create_subfolder={
                  set_create_folder_parent_token
                    ? () => {
                        set_create_folder_parent_token(folder.folder_token);
                        set_is_create_folder_open(true);
                      }
                    : undefined
                }
                on_delete={() => handle_folder_modal(folder_data, "delete")}
                on_expand_all={
                  hasChildren && !is_collapsed
                    ? () => set_subtree_expanded(node, true)
                    : undefined
                }
                on_lock={() =>
                  handle_folder_lock(folder_data, folder.password_set)
                }
                on_move={() => handle_folder_modal(folder_data, "move")}
                on_move_down={
                  reorder_folders ? () => handle_sibling_reorder(1) : undefined
                }
                on_move_up={
                  reorder_folders ? () => handle_sibling_reorder(-1) : undefined
                }
                on_recolor={() => handle_folder_modal(folder_data, "recolor")}
                on_sort_a_to_z={
                  handle_sort_a_to_z
                    ? () => void handle_sort_a_to_z()
                    : undefined
                }
                on_rename={() => handle_folder_modal(folder_data, "rename")}
                password_set={folder.password_set}
              >
                <div className="relative">
                  <SidebarFolderRowView
                    button_ref={(el: HTMLButtonElement | null) => {
                      folder_refs.current[folder.folder_token] = el;
                    }}
                    collapse_label={t("common.collapse")}
                    color={folder_color}
                    depth={node.depth}
                    drag_over={drag_over_token === folder.folder_token}
                    expand_label={t("common.expand")}
                    guide_has_next={guides?.has_next ?? false}
                    guide_trail={guides?.trail}
                    has_children={hasChildren}
                    is_collapsed={is_collapsed}
                    is_expanded={is_expanded}
                    is_locked_closed={is_locked_closed}
                    label={folder.name}
                    locale={app_locale()}
                    on_click={() =>
                      handle_nav_click(() => {
                        if (folder.is_password_protected) {
                          if (!folder.password_set) {
                            set_password_modal_folder({
                              folder_id: folder.id,
                              folder_name: folder.name,
                              folder_token: folder.folder_token,
                              mode: "setup",
                            });

                            return;
                          }
                          if (!is_folder_unlocked(folder.id)) {
                            set_password_modal_folder({
                              folder_id: folder.id,
                              folder_name: folder.name,
                              folder_token: folder.folder_token,
                              mode: "unlock",
                            });

                            return;
                          }
                        }
                        set_selected_item(folder_item_id);
                        navigate(
                          `/folder/${encodeURIComponent(folder.folder_token)}`,
                        );
                      })
                    }
                    on_toggle_expanded={() => toggle_expanded(folder.folder_token)}
                    on_drag_enter={(e) => {
                      if (!e.dataTransfer.types.includes(EMAIL_DRAG_MIME))
                        return;
                      set_drag_over_token(folder.folder_token);
                    }}
                    on_drag_leave={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node))
                        return;
                      set_drag_over_token(null);
                    }}
                    on_drag_over={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = e.dataTransfer.types.includes(
                        EMAIL_DRAG_MIME,
                      )
                        ? "move"
                        : "none";
                    }}
                    on_drop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      set_drag_over_token(null);
                      const raw = e.dataTransfer.getData(EMAIL_DRAG_MIME);

                      if (!raw || !on_drop_emails) return;
                      try {
                        const ids = JSON.parse(raw) as string[];

                        if (!Array.isArray(ids) || ids.length === 0) return;
                        const existing_raw = e.dataTransfer.getData(
                          "application/x-astermail-folders",
                        );
                        const existing_folders: string[] = existing_raw
                          ? JSON.parse(existing_raw)
                          : [];

                        if (existing_folders.includes(folder.folder_token)) {
                          on_drop_emails([], folder.folder_token, folder.name);

                          return;
                        }
                        on_drop_emails(ids, folder.folder_token, folder.name);
                      } catch {
                        return;
                      }
                    }}
                    selected={selected}
                    unread_count={unread_count}
                  />
                </div>
              </FolderContextMenu>
            );
          })}
        {has_more && !is_collapsed && !section_collapsed && !is_pinned && (
          <SidebarMoreToggle
            expanded={folders_expanded}
            hidden_count={hidden_count}
            less_label={t("common.show_less")}
            more_label={t("common.more_folders", { count: hidden_count })}
            on_toggle={() => set_folders_expanded(!folders_expanded)}
          />
        )}
        {root_count === 0 &&
          !is_collapsed &&
          !section_collapsed &&
          !is_pinned &&
          (skeleton_visible ? (
            <NavSectionSkeleton rows={3} />
          ) : load_failed && on_retry ? (
            <LoadFailedNotice on_retry={on_retry} />
          ) : (
            <SidebarEmptyText>{t("common.no_folders_yet")}</SidebarEmptyText>
          ))}
      </div>
    </>
  );
});
