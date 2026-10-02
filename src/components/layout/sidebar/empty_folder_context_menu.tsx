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
import { TrashIcon } from "@heroicons/react/24/outline";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context_menu";

interface EmptyFolderContextMenuProps {
  children: React.ReactNode;
  label: string;
  is_empty: boolean;
  on_empty: () => void;
}

export function EmptyFolderContextMenu({
  children,
  label,
  is_empty,
  on_empty,
}: EmptyFolderContextMenuProps): React.ReactElement {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem
          className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
          data-testid="sidebar-empty-folder"
          disabled={is_empty}
          onSelect={on_empty}
        >
          <TrashIcon className="me-2 h-4 w-4" />
          {label}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
