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
import type { DecryptedTag } from "@/hooks/use_tags";

import {
  memo,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useSyncExternalStore,
} from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import {
  SidebarEmptyText,
  SidebarMoreToggle,
  SidebarRailSectionButton,
  SidebarSectionAddButton,
  SidebarSectionToggle,
  SidebarTagRow,
} from "@aster/ui";

import { EMAIL_DRAG_MIME } from "@/components/email/inbox/category_drag";
import { NavSectionSkeleton } from "@/components/common/nav_section_skeleton";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { TagContextMenu } from "@/components/tags/tag_context_menu";
import { tag_icon_map } from "@/components/ui/email_tag";
import { use_i18n } from "@/lib/i18n/context";
import { use_delayed_flag } from "@/hooks/use_delayed_flag";
import { build_tag_tree, flatten_visible_tag_tree } from "@/hooks/tag_tree";
import { indent_depth } from "@/hooks/tree_indent";
import {
  get_expanded_tags,
  set_expanded_tags,
  subscribe_expanded_tags,
} from "@/services/expanded_tags_store";

export type TagModalAction =
  "rename" | "recolor" | "reicon" | "move" | "delete";

export interface TagModalData {
  tag_id: string;
  tag_name: string;
  tag_token: string;
  tag_color: string;
  tag_icon?: string;
  tag_parent_token?: string;
}

interface SidebarTagsProps {
  account_id?: string;
  is_collapsed: boolean;
  effective_selected: string | null;
  tags: DecryptedTag[];
  labels_expanded: boolean;
  set_labels_expanded: (expanded: boolean) => void;
  is_loading: boolean;
  handle_nav_click: (callback: () => void) => void;
  set_selected_item: (item: string) => void;
  navigate: (path: string) => void;
  set_is_create_tag_open: (open: boolean) => void;
  handle_tag_modal: (tag: TagModalData, action: TagModalAction) => void;
  on_create_sublabel?: (parent_token: string) => void;
  tag_refs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  on_drop_emails?: (
    email_ids: string[],
    tag_token: string,
    tag_name: string,
  ) => void;
  section_collapsed?: boolean;
  on_toggle_section?: () => void;
  load_failed?: boolean;
  on_retry?: () => void;
}

export const SidebarTags = memo(function SidebarTags({
  account_id = "",
  is_collapsed,
  effective_selected,
  tags,
  labels_expanded,
  set_labels_expanded,
  is_loading,
  handle_nav_click,
  set_selected_item,
  navigate,
  set_is_create_tag_open,
  handle_tag_modal,
  on_create_sublabel,
  tag_refs,
  on_drop_emails,
  section_collapsed = false,
  on_toggle_section,
  load_failed = false,
  on_retry,
}: SidebarTagsProps) {
  const { t } = use_i18n();
  const skeleton_visible = use_delayed_flag(is_loading);

  const [drag_over_token, set_drag_over_token] = useState<string | null>(null);

  useEffect(() => {
    const handle_drag_end = () => set_drag_over_token(null);

    window.addEventListener("dragend", handle_drag_end);

    return () => window.removeEventListener("dragend", handle_drag_end);
  }, []);

  const get_expanded_snapshot = useCallback(
    () => get_expanded_tags(account_id),
    [account_id],
  );
  const expanded_tags = useSyncExternalStore(
    subscribe_expanded_tags,
    get_expanded_snapshot,
  );

  const all_tags = tags;
  const tree = useMemo(() => build_tag_tree(tags), [tags]);
  const max_visible = is_collapsed ? 3 : 5;
  const root_count = tree.length;
  const has_more = root_count > max_visible;
  const hidden_count = root_count - max_visible;

  const visible_nodes = useMemo(() => {
    const root_nodes = labels_expanded ? tree : tree.slice(0, max_visible);

    if (is_collapsed) {
      return root_nodes.map((node) => ({ ...node, children: [] }));
    }

    return flatten_visible_tag_tree(root_nodes, expanded_tags);
  }, [tree, labels_expanded, max_visible, is_collapsed, expanded_tags]);

  const toggle_expanded = (tag_token: string) => {
    const next = new Set(expanded_tags);

    if (next.has(tag_token)) {
      next.delete(tag_token);
    } else {
      next.add(tag_token);
    }

    set_expanded_tags(account_id, next);
  };

  return (
    <>
      <SidebarSectionToggle
        is_collapsed={is_collapsed}
        label={t("common.labels")}
        on_toggle={on_toggle_section ?? (() => {})}
        right_slot={
          <SidebarSectionAddButton
            label={t("common.create_label")}
            on_click={() => set_is_create_tag_open(true)}
          />
        }
        section_collapsed={section_collapsed}
      />

      {is_collapsed && (
        <SidebarRailSectionButton
          icon={TagIcon}
          label={t("common.create_label")}
          on_click={() => set_is_create_tag_open(true)}
        />
      )}

      <div>
        {!section_collapsed &&
          visible_nodes.map((node) => {
            const tag = node.tag;
            const tag_item_id = `tag-${tag.tag_token}`;
            const tag_color = tag.color || "#3b82f6";
            const has_children = node.children.length > 0;
            const is_expanded = expanded_tags.has(tag.tag_token);
            const row_inset =
              !is_collapsed && node.depth > 0
                ? indent_depth(node.depth) * 16 + 4
                : 0;
            const RowIcon = tag.icon ? (tag_icon_map[tag.icon] ?? null) : null;
            const tag_data: TagModalData = {
              tag_id: tag.id,
              tag_name: tag.name,
              tag_token: tag.tag_token,
              tag_color,
              tag_icon: tag.icon,
              tag_parent_token: tag.parent_token,
            };

            return (
              <TagContextMenu
                key={tag.id}
                on_add_sublabel={
                  on_create_sublabel && !tag.is_undecryptable
                    ? () => on_create_sublabel(tag.tag_token)
                    : undefined
                }
                on_delete={() => handle_tag_modal(tag_data, "delete")}
                on_move={() => handle_tag_modal(tag_data, "move")}
                on_recolor={() => handle_tag_modal(tag_data, "recolor")}
                on_reicon={() => handle_tag_modal(tag_data, "reicon")}
                on_rename={
                  tag.is_undecryptable
                    ? undefined
                    : () => handle_tag_modal(tag_data, "rename")
                }
                tag_color={tag_color}
              >
                <div
                  className="relative"
                  style={
                    row_inset > 0
                      ? { paddingInlineStart: `${row_inset}px` }
                      : undefined
                  }
                >
                  <SidebarTagRow
                    rail_tip
                    button_ref={(el: HTMLButtonElement | null) => {
                      tag_refs.current[tag.tag_token] = el;
                    }}
                    color={tag_color}
                    drag_over={drag_over_token === tag.tag_token}
                    icon_slot={
                      !is_collapsed && has_children ? (
                        <>
                          <span
                            aria-expanded={is_expanded}
                            aria-label={
                              is_expanded
                                ? t("common.collapse")
                                : t("common.expand")
                            }
                            className="absolute start-0 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggle_expanded(tag.tag_token);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                toggle_expanded(tag.tag_token);
                              }
                            }}
                          >
                            {is_expanded ? (
                              <ChevronDownIcon className="w-3 h-3" />
                            ) : (
                              <ChevronRightIcon className="w-3 h-3 rtl:-scale-x-100" />
                            )}
                          </span>
                          {RowIcon ? (
                            <RowIcon
                              className="w-4 h-4 flex-shrink-0 ms-2"
                              style={{ color: tag_color }}
                            />
                          ) : (
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0 ms-2"
                              style={{ backgroundColor: tag_color }}
                            />
                          )}
                        </>
                      ) : undefined
                    }
                    is_collapsed={is_collapsed}
                    label={tag.name}
                    on_click={() =>
                      handle_nav_click(() => {
                        set_selected_item(tag_item_id);
                        navigate(`/tag/${encodeURIComponent(tag.tag_token)}`);
                      })
                    }
                    on_drag_enter={(e) => {
                      if (!e.dataTransfer.types.includes(EMAIL_DRAG_MIME))
                        return;
                      set_drag_over_token(tag.tag_token);
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
                          "application/x-astermail-tags",
                        );
                        const existing_tags: string[] = existing_raw
                          ? JSON.parse(existing_raw)
                          : [];

                        if (existing_tags.includes(tag.tag_token)) {
                          on_drop_emails([], tag.tag_token, tag.name);

                          return;
                        }
                        on_drop_emails(ids, tag.tag_token, tag.name);
                      } catch {
                        return;
                      }
                    }}
                    selected={effective_selected === tag_item_id}
                    tag_icon={RowIcon}
                  />
                </div>
              </TagContextMenu>
            );
          })}
        {has_more && !is_collapsed && !section_collapsed && (
          <SidebarMoreToggle
            expanded={labels_expanded}
            hidden_count={hidden_count}
            less_label={t("common.show_less")}
            more_label={t("common.more_labels", { count: hidden_count })}
            on_toggle={() => set_labels_expanded(!labels_expanded)}
          />
        )}
        {all_tags.length === 0 &&
          skeleton_visible &&
          !is_collapsed &&
          !section_collapsed && <NavSectionSkeleton rows={2} />}
        {all_tags.length === 0 &&
          !is_loading &&
          !is_collapsed &&
          !section_collapsed &&
          (load_failed && on_retry ? (
            <LoadFailedNotice on_retry={on_retry} />
          ) : (
            <SidebarEmptyText>{t("common.no_labels_yet")}</SidebarEmptyText>
          ))}
      </div>
    </>
  );
});
