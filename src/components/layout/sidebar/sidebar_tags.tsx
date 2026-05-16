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
import type { TagCounts } from "@/hooks/use_tags";

import { memo, useState, useEffect } from "react";
import {
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronRightIcon,
  TagIcon,
} from "@heroicons/react/24/outline";

import { TagContextMenu } from "@/components/tags/tag_context_menu";
import { tag_icon_map } from "@/components/ui/email_tag";
import { CountBadge } from "@/components/common/count_badge";
import { use_i18n } from "@/lib/i18n/context";

export interface TagModalData {
  tag_id: string;
  tag_name: string;
  tag_token: string;
  tag_color: string;
  tag_icon?: string;
}

interface SidebarTagsProps {
  is_collapsed: boolean;
  effective_selected: string | null;
  tags: DecryptedTag[];
  tag_counts: TagCounts;
  labels_expanded: boolean;
  set_labels_expanded: (expanded: boolean) => void;
  is_loading: boolean;
  handle_nav_click: (callback: () => void) => void;
  set_selected_item: (item: string) => void;
  navigate: (path: string) => void;
  set_is_create_tag_open: (open: boolean) => void;
  handle_tag_modal: (
    tag: TagModalData,
    action: "rename" | "recolor" | "reicon" | "delete",
  ) => void;
  tag_refs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  on_drop_emails?: (
    email_ids: string[],
    tag_token: string,
    tag_name: string,
  ) => void;
  section_collapsed?: boolean;
  on_toggle_section?: () => void;
}

export const SidebarTags = memo(function SidebarTags({
  is_collapsed,
  effective_selected,
  tags,
  tag_counts,
  labels_expanded,
  set_labels_expanded,
  is_loading,
  handle_nav_click,
  set_selected_item,
  navigate,
  set_is_create_tag_open,
  handle_tag_modal,
  tag_refs,
  on_drop_emails,
  section_collapsed = false,
  on_toggle_section,
}: SidebarTagsProps) {
  const { t } = use_i18n();

  const [drag_over_token, set_drag_over_token] = useState<string | null>(null);

  useEffect(() => {
    const handle_drag_end = () => set_drag_over_token(null);

    window.addEventListener("dragend", handle_drag_end);

    return () => window.removeEventListener("dragend", handle_drag_end);
  }, []);

  const all_tags = tags;
  const max_visible = is_collapsed ? 3 : 5;
  const has_more = all_tags.length > max_visible;
  const visible_tags = labels_expanded
    ? all_tags
    : all_tags.slice(0, max_visible);
  const hidden_count = all_tags.length - max_visible;

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
                <ChevronRightIcon className="w-3 h-3" />
              ) : (
                <ChevronDownIcon className="w-3 h-3" />
              )}
              <span className="text-[10px] font-semibold uppercase tracking-[0.05em]">
                {t("common.labels")}
              </span>
            </button>
            <button
              className="p-1 rounded-[14px]  hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-txt-muted"
              onClick={() => set_is_create_tag_open(true)}
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
            title={t("common.create_label")}
            onClick={() => set_is_create_tag_open(true)}
          >
            <TagIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      <div>
        {!section_collapsed &&
          visible_tags.map((tag) => {
            const tag_item_id = `tag-${tag.tag_token}`;
            const tag_color = tag.color || "#3b82f6";
            const tag_data: TagModalData = {
              tag_id: tag.id,
              tag_name: tag.name,
              tag_token: tag.tag_token,
              tag_color,
              tag_icon: tag.icon,
            };

            return (
              <TagContextMenu
                key={tag.id}
                on_delete={() => handle_tag_modal(tag_data, "delete")}
                on_recolor={() => handle_tag_modal(tag_data, "recolor")}
                on_reicon={() => handle_tag_modal(tag_data, "reicon")}
                on_rename={() => handle_tag_modal(tag_data, "rename")}
                tag_color={tag_color}
              >
                <button
                  ref={(el) => {
                    tag_refs.current[tag.tag_token] = el;
                  }}
                  className={`sidebar-nav-btn group relative w-full flex items-center ${is_collapsed ? "justify-center" : "gap-2.5"} rounded-[12px] ${is_collapsed ? "px-0" : "px-2.5"} h-8 text-[14px]  ${effective_selected === tag_item_id ? "sidebar-active" : ""} ${is_collapsed && effective_selected === tag_item_id ? "sidebar-selected" : ""} ${drag_over_token === tag.tag_token ? "ring-2 ring-blue-500/60 bg-blue-500/10" : ""}`}
                  style={{
                    zIndex: 1,
                    color:
                      effective_selected === tag_item_id
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                    backgroundColor:
                      drag_over_token === tag.tag_token
                        ? undefined
                        : is_collapsed && effective_selected === tag_item_id
                          ? "var(--indicator-bg)"
                          : undefined,
                  }}
                  title={is_collapsed ? tag.name : undefined}
                  onClick={() =>
                    handle_nav_click(() => {
                      set_selected_item(tag_item_id);
                      navigate(`/tag/${encodeURIComponent(tag.tag_token)}`);
                    })
                  }
                  onDragEnter={() => set_drag_over_token(tag.tag_token)}
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
                >
                  {(() => {
                    const TagItemIcon = tag.icon
                      ? tag_icon_map[tag.icon]
                      : null;

                    if (TagItemIcon) {
                      return (
                        <TagItemIcon
                          className={`${is_collapsed ? "w-5 h-5" : "w-4 h-4"} flex-shrink-0 `}
                          style={{ color: tag_color }}
                        />
                      );
                    }

                    return (
                      <div
                        className={`${is_collapsed ? "w-3 h-3" : "w-2.5 h-2.5"} rounded-full flex-shrink-0`}
                        style={{ backgroundColor: tag_color }}
                      />
                    );
                  })()}
                  {!is_collapsed && (
                    <>
                      <span className="flex-1 text-left truncate leading-4">
                        {tag.name}
                      </span>
                      <CountBadge
                        count={tag_counts[tag.tag_token] ?? 0}
                        is_active={effective_selected === tag_item_id}
                      />
                    </>
                  )}
                </button>
              </TagContextMenu>
            );
          })}
        {has_more && !is_collapsed && !section_collapsed && (
          <button
            className="w-full flex items-center gap-2 px-2.5 h-7 text-[12px]  rounded-[12px] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] text-txt-muted"
            onClick={() => set_labels_expanded(!labels_expanded)}
          >
            {labels_expanded ? (
              <ChevronUpIcon className="w-3.5 h-3.5" />
            ) : (
              <ChevronDownIcon className="w-3.5 h-3.5" />
            )}
            <span>
              {labels_expanded
                ? t("common.show_less")
                : t("common.more_labels", { count: hidden_count })}
            </span>
          </button>
        )}
        {all_tags.length === 0 &&
          !is_loading &&
          !is_collapsed &&
          !section_collapsed && (
            <p className="text-[11px] px-2.5 py-2 text-txt-muted">
              {t("common.no_labels_yet")}
            </p>
          )}
      </div>
    </>
  );
});
