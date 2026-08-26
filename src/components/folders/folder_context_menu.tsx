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
  BellIcon,
  BellSlashIcon,
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
import { use_preferences } from "@/contexts/preferences_context";

interface FolderContextMenuProps {
  children: React.ReactNode;
  folder_token?: string;
  folder_color: string;
  password_set: boolean;
  can_have_children?: boolean;
  on_lock: () => void;
  on_rename: () => void;
  on_recolor: () => void;
  on_move?: () => void;
  on_delete: () => void;
  on_create_subfolder?: () => void;
  on_move_up?: () => void;
  on_move_down?: () => void;
  can_move_up?: boolean;
  can_move_down?: boolean;
}

export function FolderContextMenu({
  children,
  folder_token,
  folder_color,
  password_set,
  can_have_children,
  on_lock,
  on_rename,
  on_recolor,
  on_move,
  on_delete,
  on_create_subfolder,
  on_move_up,
  on_move_down,
  can_move_up,
  can_move_down,
}: FolderContextMenuProps): React.ReactElement {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();

  const muted_tokens = preferences.muted_folder_tokens ?? [];
  const is_muted = folder_token ? muted_tokens.includes(folder_token) : false;

  const toggle_notifications = () => {
    if (!folder_token) return;

    const next = is_muted
      ? muted_tokens.filter((token) => token !== folder_token)
      : [...muted_tokens, folder_token];

    update_preference("muted_folder_tokens", next, true);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {on_create_subfolder && can_have_children && (
          <ContextMenuItem onClick={on_create_subfolder}>
            <FolderPlusIcon className="me-2 h-4 w-4" />
            {t("common.create_subfolder")}
          </ContextMenuItem>
        )}

        <ContextMenuItem onClick={on_lock}>
          <LockClosedIcon
            className="me-2 h-4 w-4"
            style={{ color: password_set ? "var(--color-success)" : undefined }}
          />
          {password_set ? t("common.remove_lock") : t("common.lock")}
        </ContextMenuItem>

        <ContextMenuItem onClick={on_rename}>
          <PencilIcon className="me-2 h-4 w-4" />
          {t("common.rename")}
        </ContextMenuItem>

        <ContextMenuItem onClick={on_recolor}>
          <FolderIcon
            className="me-2 h-4 w-4"
            style={{ color: folder_color }}
          />
          {t("common.change_color")}
        </ContextMenuItem>

        {folder_token && (
          <ContextMenuItem
            data-testid="folder-menu-toggle-notifications"
            onClick={toggle_notifications}
          >
            {is_muted ? (
              <BellIcon className="me-2 h-4 w-4" />
            ) : (
              <BellSlashIcon className="me-2 h-4 w-4" />
            )}
            {is_muted
              ? t("common.unmute_notifications")
              : t("common.mute_notifications")}
          </ContextMenuItem>
        )}

        {on_move && (
          <ContextMenuItem onClick={on_move}>
            <ArrowRightIcon className="me-2 h-4 w-4 rtl:-scale-x-100" />
            {t("common.move_to")}
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
