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
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  RadixContextMenu,
  RadixContextMenuContent,
  RadixContextMenuSubContent,
} from "@aster/ui";

import { cn } from "@/lib/utils";

const MENU_MAX_HEIGHT =
  "max-h-[var(--radix-context-menu-content-available-height,calc(100dvh_-_16px))]";

const ContextMenuOpenContext = createContext<boolean | null>(null);

export function ContextMenu({
  onOpenChange,
  ...props
}: React.ComponentProps<typeof RadixContextMenu>): React.ReactElement {
  const [open, set_open] = useState(false);

  const handle_open_change = useCallback(
    (next: boolean) => {
      set_open(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  return (
    <ContextMenuOpenContext.Provider value={open}>
      <RadixContextMenu {...props} onOpenChange={handle_open_change} />
    </ContextMenuOpenContext.Provider>
  );
}

export const ContextMenuContent = forwardRef<
  React.ElementRef<typeof RadixContextMenuContent>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenuContent>
>(({ className, ...props }, ref) => {
  const open = useContext(ContextMenuOpenContext);
  const [settled, set_settled] = useState(false);

  useEffect(() => {
    set_settled(open === true);
  }, [open]);

  if (open === true && !settled) return null;

  return (
    <RadixContextMenuContent
      ref={ref}
      className={cn(MENU_MAX_HEIGHT, className)}
      {...props}
    />
  );
});

ContextMenuContent.displayName = "ContextMenuContent";

export const ContextMenuSubContent = forwardRef<
  React.ElementRef<typeof RadixContextMenuSubContent>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenuSubContent>
>(({ className, ...props }, ref) => (
  <RadixContextMenuSubContent
    ref={ref}
    className={cn(MENU_MAX_HEIGHT, className)}
    {...props}
  />
));

ContextMenuSubContent.displayName = "ContextMenuSubContent";

export {
  RadixContextMenuTrigger as ContextMenuTrigger,
  RadixContextMenuItem as ContextMenuItem,
  RadixContextMenuCheckboxItem as ContextMenuCheckboxItem,
  RadixContextMenuRadioItem as ContextMenuRadioItem,
  RadixContextMenuLabel as ContextMenuLabel,
  RadixContextMenuSeparator as ContextMenuSeparator,
  RadixContextMenuGroup as ContextMenuGroup,
  RadixContextMenuPortal as ContextMenuPortal,
  RadixContextMenuSub as ContextMenuSub,
  RadixContextMenuSubTrigger as ContextMenuSubTrigger,
  RadixContextMenuRadioGroup as ContextMenuRadioGroup,
} from "@aster/ui";
