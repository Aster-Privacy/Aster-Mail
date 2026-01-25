import {
  LockClosedIcon,
  PencilIcon,
  SwatchIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface FolderContextMenuProps {
  children: React.ReactNode;
  folder_color: string;
  password_set: boolean;
  on_lock: () => void;
  on_rename: () => void;
  on_recolor: () => void;
  on_delete: () => void;
}

export function FolderContextMenu({
  children,
  folder_color,
  password_set,
  on_lock,
  on_rename,
  on_recolor,
  on_delete,
}: FolderContextMenuProps): React.ReactElement {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={on_lock}>
          <LockClosedIcon
            className="mr-2 h-4 w-4"
            style={{ color: password_set ? "#22c55e" : undefined }}
          />
          {password_set ? "Remove Lock" : "Lock"}
        </ContextMenuItem>

        <ContextMenuItem onClick={on_rename}>
          <PencilIcon className="mr-2 h-4 w-4" />
          Rename
        </ContextMenuItem>

        <ContextMenuItem onClick={on_recolor}>
          <SwatchIcon
            className="mr-2 h-4 w-4"
            style={{ color: folder_color }}
          />
          Change color
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
          onClick={on_delete}
        >
          <TrashIcon className="mr-2 h-4 w-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
