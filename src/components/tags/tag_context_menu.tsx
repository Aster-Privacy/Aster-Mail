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
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BarsArrowDownIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  TagIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context_menu";
import { use_translation } from "@/lib/i18n";

interface TagContextMenuProps {
  children: React.ReactNode;
  tag_color: string;
  on_rename?: () => void;
  on_recolor: () => void;
  on_reicon: () => void;
  on_delete: () => void;
  on_add_sublabel?: () => void;
  on_move?: () => void;
  on_move_up?: () => void;
  on_move_down?: () => void;
  can_move_up?: boolean;
  can_move_down?: boolean;
  on_sort_a_to_z?: () => void;
  can_sort_a_to_z?: boolean;
}

export function TagContextMenu({
  children,
  tag_color,
  on_rename,
  on_recolor,
  on_reicon,
  on_delete,
  on_add_sublabel,
  on_move,
  on_move_up,
  on_move_down,
  can_move_up,
  can_move_down,
  on_sort_a_to_z,
  can_sort_a_to_z,
}: TagContextMenuProps): React.ReactElement {
  const { t } = use_translation();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {on_add_sublabel && (
          <ContextMenuItem onClick={on_add_sublabel}>
            <PlusIcon className="me-2 h-4 w-4" />
            {t("common.create_sublabel")}
          </ContextMenuItem>
        )}

        {on_rename && (
          <ContextMenuItem onClick={on_rename}>
            <PencilIcon className="me-2 h-4 w-4" />
            {t("common.rename")}
          </ContextMenuItem>
        )}

        <ContextMenuItem onClick={on_recolor}>
          <TagIcon className="me-2 h-4 w-4" style={{ color: tag_color }} />
          {t("common.change_color")}
        </ContextMenuItem>

        <ContextMenuItem onClick={on_reicon}>
          <SparklesIcon className="me-2 h-4 w-4" />
          {t("common.change_icon")}
        </ContextMenuItem>

        {on_move && (
          <ContextMenuItem onClick={on_move}>
            <ArrowRightIcon className="me-2 h-4 w-4 rtl:-scale-x-100" />
            {t("common.move_label")}
          </ContextMenuItem>
        )}

        {on_move_up && (
          <ContextMenuItem disabled={!can_move_up} onClick={on_move_up}>
            <ArrowUpIcon className="me-2 h-4 w-4" />
            {t("common.move_up")}
          </ContextMenuItem>
        )}

        {on_move_down && (
          <ContextMenuItem disabled={!can_move_down} onClick={on_move_down}>
            <ArrowDownIcon className="me-2 h-4 w-4" />
            {t("common.move_down")}
          </ContextMenuItem>
        )}

        {on_sort_a_to_z && (
          <ContextMenuItem
            data-testid="tag-menu-sort-a-to-z"
            disabled={!can_sort_a_to_z}
            onClick={on_sort_a_to_z}
          >
            <BarsArrowDownIcon className="me-2 h-4 w-4" />
            {t("common.sort_a_to_z")}
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        <ContextMenuItem
          className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
          onClick={on_delete}
        >
          <TrashIcon className="me-2 h-4 w-4" />
          {t("common.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
