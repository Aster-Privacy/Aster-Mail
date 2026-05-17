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
  PencilIcon,
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
  on_rename: () => void;
  on_recolor: () => void;
  on_reicon: () => void;
  on_delete: () => void;
}

export function TagContextMenu({
  children,
  tag_color,
  on_rename,
  on_recolor,
  on_reicon,
  on_delete,
}: TagContextMenuProps): React.ReactElement {
  const { t } = use_translation();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={on_rename}>
          <PencilIcon className="mr-2 h-4 w-4" />
          {t("common.rename")}
        </ContextMenuItem>

        <ContextMenuItem onClick={on_recolor}>
          <TagIcon className="mr-2 h-4 w-4" style={{ color: tag_color }} />
          {t("common.change_color")}
        </ContextMenuItem>

        <ContextMenuItem onClick={on_reicon}>
          <SparklesIcon className="mr-2 h-4 w-4" />
          {t("common.change_icon")}
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
          onClick={on_delete}
        >
          <TrashIcon className="mr-2 h-4 w-4" />
          {t("common.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
