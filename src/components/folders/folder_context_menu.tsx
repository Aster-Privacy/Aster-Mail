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
  FolderIcon,
  FolderPlusIcon,
  LockClosedIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context_menu";
import { use_i18n } from "@/lib/i18n/context";

interface FolderContextMenuProps {
  children: React.ReactNode;
  folder_color: string;
  password_set: boolean;
  can_have_children?: boolean;
  on_lock: () => void;
  on_rename: () => void;
  on_recolor: () => void;
  on_delete: () => void;
  on_create_subfolder?: () => void;
}

export function FolderContextMenu({
  children,
  folder_color,
  password_set,
  can_have_children,
  on_lock,
  on_rename,
  on_recolor,
  on_delete,
  on_create_subfolder,
}: FolderContextMenuProps): React.ReactElement {
  const { t } = use_i18n();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {on_create_subfolder && can_have_children && (
          <ContextMenuItem onClick={on_create_subfolder}>
            <FolderPlusIcon className="mr-2 h-4 w-4" />
            {t("common.create_subfolder")}
          </ContextMenuItem>
        )}

        <ContextMenuItem onClick={on_lock}>
          <LockClosedIcon
            className="mr-2 h-4 w-4"
            style={{ color: password_set ? "var(--color-success)" : undefined }}
          />
          {password_set ? t("common.remove_lock") : t("common.lock")}
        </ContextMenuItem>

        <ContextMenuItem onClick={on_rename}>
          <PencilIcon className="mr-2 h-4 w-4" />
          {t("common.rename")}
        </ContextMenuItem>

        <ContextMenuItem onClick={on_recolor}>
          <FolderIcon
            className="mr-2 h-4 w-4"
            style={{ color: folder_color }}
          />
          {t("common.change_color")}
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
