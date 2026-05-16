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
import type { DecryptedFolder } from "@/hooks/use_folders";
import type { FolderCounts } from "@/hooks/use_folders";

import { memo, useState, useEffect, useMemo } from "react";
import {
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronRightIcon,
  FolderIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";

import { build_folder_tree, flatten_visible_tree } from "@/hooks/use_folders";
import { FolderContextMenu } from "@/components/folders/folder_context_menu";
import { CountBadge } from "@/components/common/count_badge";
import { is_folder_unlocked } from "@/hooks/use_protected_folder";
import { use_i18n } from "@/lib/i18n/context";

export interface FolderModalData {
  folder_id: string;
  folder_name: string;
  folder_token: string;
  folder_color: string;
  is_locked?: boolean;
  hasChildren?: boolean;
}

interface SidebarFoldersProps {
  is_collapsed: boolean;
  effective_selected: string | null;
  folders: DecryptedFolder[];
  folder_counts: FolderCounts;
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
    action: "rename" | "recolor" | "delete",
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
}

export const SidebarFolders = memo(function SidebarFolders({
  is_collapsed,
  effective_selected,
  folders,
  folder_counts,
  folders_expanded,
  set_folders_expanded,
  is_loading: _is_loading,
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
}: SidebarFoldersProps) {
  const { t } = use_i18n();

  const [drag_over_token, set_drag_over_token] = useState<string | null>(null);
  const [expanded_folders, set_expanded_folders] = useState<Set<string>>(
    new Set(),
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

  const visible_nodes = useMemo(() => {
    if (is_collapsed) {
      return tree.map((node) => ({ ...node, children: [] }));
    }

    const max_visible = 5;
    const root_nodes = folders_expanded ? tree : tree.slice(0, max_visible);

    return flatten_visible_tree(root_nodes, expanded_folders);
  }, [tree, folders_expanded, expanded_folders, is_collapsed]);

  const root_count = tree.length;
  const max_visible = is_collapsed ? 3 : 5;
  const has_more = root_count > max_visible;
  const hidden_count = root_count - max_visible;

  const toggle_expanded = (folder_token: string) => {
    set_expanded_folders((prev) => {
      const next = new Set(prev);

      if (next.has(folder_token)) {
        next.delete(folder_token);
      } else {
        next.add(folder_token);
      }

      return next;
    });
  };

  return (
    <>
      {!is_collapsed && (
        <div className="mt-5 mb-1 px-2.5" data-onboarding="folders-section">
          <div className="w-full flex items-center justify-between">
            <button
              className="flex-1 flex items-center gap-1 py-1 text-txt-muted opacity-70 hover:opacity-100"
              onClick={on_toggle_section}
            >
              {section_collapsed ? (
                <ChevronRightIcon className="w-3 h-3" />
              ) : (
                <ChevronDownIcon className="w-3 h-3" />
              )}
              <span className="text-[10px] font-semibold uppercase tracking-[0.05em]">
                {t("common.folders")}
              </span>
            </button>
            <button
              className="p-1 rounded-[14px]  hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-txt-muted"
              onClick={() => set_is_create_folder_open(true)}
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {is_collapsed && (
        <div className="mt-3 flex justify-center">
          <button
            className="p-1.5 rounded  hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-txt-muted"
            title={t("common.create_folder")}
            onClick={() => set_is_create_folder_open(true)}
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      <div>
        {!section_collapsed &&
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
            const indent = is_collapsed ? 0 : node.depth * 16;

            return (
              <FolderContextMenu
                key={folder.id}
                can_have_children={node.depth < 4}
                folder_color={folder_color}
                on_create_subfolder={
                  set_create_folder_parent_token
                    ? () => {
                        set_create_folder_parent_token(folder.folder_token);
                        set_is_create_folder_open(true);
                      }
                    : undefined
                }
                on_delete={() => handle_folder_modal(folder_data, "delete")}
                on_lock={() =>
                  handle_folder_lock(folder_data, folder.password_set)
                }
                on_recolor={() => handle_folder_modal(folder_data, "recolor")}
                on_rename={() => handle_folder_modal(folder_data, "rename")}
                password_set={folder.password_set}
              >
                <button
                  ref={(el) => {
                    folder_refs.current[folder.folder_token] = el;
                  }}
                  className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-[12px] ${is_collapsed ? "px-0" : ""} h-8 text-[14px]  ${effective_selected === folder_item_id ? "sidebar-active" : ""} ${is_collapsed && effective_selected === folder_item_id ? "sidebar-selected" : ""} ${drag_over_token === folder.folder_token ? "ring-2 ring-blue-500/60 bg-blue-500/10" : ""}`}
                  style={{
                    zIndex: 1,
                    paddingLeft: is_collapsed
                      ? undefined
                      : `${(hasChildren ? 18 : 10) + indent}px`,
                    paddingRight: is_collapsed ? undefined : "10px",
                    color:
                      effective_selected === folder_item_id
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                    backgroundColor:
                      drag_over_token === folder.folder_token
                        ? undefined
                        : is_collapsed && effective_selected === folder_item_id
                          ? "var(--indicator-bg)"
                          : undefined,
                  }}
                  title={is_collapsed ? folder.name : undefined}
                  onClick={() =>
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
                  onDragEnter={() => set_drag_over_token(folder.folder_token)}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node))
                      return;
                    set_drag_over_token(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    set_drag_over_token(null);
                    const raw = e.dataTransfer.getData(
                      "application/x-astermail-emails",
                    );

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
                >
                  {!is_collapsed && hasChildren && (
                    <span
                      className="absolute top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
                      role="button"
                      style={{ left: `${indent}px` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle_expanded(folder.folder_token);
                      }}
                    >
                      {is_expanded ? (
                        <ChevronDownIcon className="w-3 h-3" />
                      ) : (
                        <ChevronRightIcon className="w-3 h-3" />
                      )}
                    </span>
                  )}
                  <div className="relative">
                    <FolderIcon
                      className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"}`}
                      style={{ color: folder_color }}
                    />
                    {(folder.is_locked ||
                      (folder.is_password_protected &&
                        (!folder.password_set ||
                          !is_folder_unlocked(folder.id)))) && (
                      <LockClosedIcon className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 p-0.5 rounded-full text-txt-primary bg-surf-secondary" />
                    )}
                  </div>
                  {!is_collapsed && (
                    <>
                      <span className="flex-1 text-left truncate">
                        {folder.name}
                      </span>
                      <CountBadge
                        count={folder_counts[folder.folder_token] ?? 0}
                        is_active={effective_selected === folder_item_id}
                      />
                      {(folder.is_locked ||
                        (folder.is_password_protected &&
                          (!folder.password_set ||
                            !is_folder_unlocked(folder.id)))) && (
                        <LockClosedIcon className="w-3 h-3 ml-1 text-txt-muted" />
                      )}
                    </>
                  )}
                </button>
              </FolderContextMenu>
            );
          })}
        {has_more && !is_collapsed && !section_collapsed && (
          <button
            className="w-full flex items-center gap-2 px-2.5 h-7 text-[12px]  rounded-[12px] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] text-txt-muted"
            onClick={() => set_folders_expanded(!folders_expanded)}
          >
            {folders_expanded ? (
              <ChevronUpIcon className="w-3.5 h-3.5" />
            ) : (
              <ChevronDownIcon className="w-3.5 h-3.5" />
            )}
            <span>
              {folders_expanded
                ? t("common.show_less")
                : t("common.more_folders", { count: hidden_count })}
            </span>
          </button>
        )}
        {root_count === 0 && !is_collapsed && !section_collapsed && (
          <p className="text-[11px] px-2.5 py-2 text-txt-muted">
            {t("common.no_folders_yet")}
          </p>
        )}
      </div>
    </>
  );
});
