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
  RadixContextMenuCheckboxItem,
  RadixContextMenuContent,
  RadixContextMenuItem,
  RadixContextMenuRadioItem,
  RadixContextMenuSubContent,
  RadixContextMenuSubTrigger,
} from "@aster/ui";

import { with_menu_item_labels } from "@/components/ui/menu_item_label";
import { cn } from "@/lib/utils";

const MENU_MAX_HEIGHT =
  "max-h-[var(--radix-context-menu-content-available-height,calc(100dvh_-_16px))]";

const MENU_MAX_WIDTH =
  "max-w-[min(var(--radix-context-menu-content-available-width,100vw),calc(100vw_-_1rem))]";

const ContextMenuOpenContext = createContext<boolean | null>(null);

export function ContextMenu({
  open: open_prop,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof RadixContextMenu>): React.ReactElement {
  const [uncontrolled_open, set_uncontrolled_open] = useState(false);
  const is_controlled = open_prop !== undefined;
  const open = is_controlled ? open_prop : uncontrolled_open;

  const handle_open_change = useCallback(
    (next: boolean) => {
      if (!is_controlled) set_uncontrolled_open(next);
      onOpenChange?.(next);
    },
    [is_controlled, onOpenChange],
  );

  return (
    <ContextMenuOpenContext.Provider value={open}>
      <RadixContextMenu
        {...props}
        open={open}
        onOpenChange={handle_open_change}
      />
    </ContextMenuOpenContext.Provider>
  );
}

export const ContextMenuContent = forwardRef<
  React.ElementRef<typeof RadixContextMenuContent>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenuContent>
>(({ className, ...props }, ref) => {
  const open = useContext(ContextMenuOpenContext);
  const [settled, set_settled] = useState(false);
  const [placed, set_placed] = useState(false);

  useEffect(() => {
    set_settled(open === true);
    if (open !== true) set_placed(false);
  }, [open]);

  const handle_placed = useCallback(() => set_placed(true), []);

  if (open === true && !settled) return null;

  const placement_gate = { onPlaced: handle_placed } as Record<string, unknown>;

  return (
    <RadixContextMenuContent
      ref={ref}
      className={cn(
        MENU_MAX_HEIGHT,
        MENU_MAX_WIDTH,
        "select-none",
        !placed && "invisible [animation:none]",
        className,
      )}
      {...placement_gate}
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
    className={cn(MENU_MAX_HEIGHT, MENU_MAX_WIDTH, "select-none", className)}
    {...props}
  />
));

ContextMenuSubContent.displayName = "ContextMenuSubContent";

export const ContextMenuItem = forwardRef<
  React.ElementRef<typeof RadixContextMenuItem>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenuItem>
>(({ asChild, children, ...props }, ref) => (
  <RadixContextMenuItem ref={ref} asChild={asChild} {...props}>
    {asChild ? children : with_menu_item_labels(children)}
  </RadixContextMenuItem>
));

ContextMenuItem.displayName = "ContextMenuItem";

export const ContextMenuCheckboxItem = forwardRef<
  React.ElementRef<typeof RadixContextMenuCheckboxItem>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenuCheckboxItem>
>(({ children, ...props }, ref) => (
  <RadixContextMenuCheckboxItem ref={ref} {...props}>
    {with_menu_item_labels(children)}
  </RadixContextMenuCheckboxItem>
));

ContextMenuCheckboxItem.displayName = "ContextMenuCheckboxItem";

export const ContextMenuRadioItem = forwardRef<
  React.ElementRef<typeof RadixContextMenuRadioItem>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenuRadioItem>
>(({ children, ...props }, ref) => (
  <RadixContextMenuRadioItem ref={ref} {...props}>
    {with_menu_item_labels(children)}
  </RadixContextMenuRadioItem>
));

ContextMenuRadioItem.displayName = "ContextMenuRadioItem";

export const ContextMenuSubTrigger = forwardRef<
  React.ElementRef<typeof RadixContextMenuSubTrigger>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenuSubTrigger>
>(({ children, ...props }, ref) => (
  <RadixContextMenuSubTrigger ref={ref} {...props}>
    {with_menu_item_labels(children)}
  </RadixContextMenuSubTrigger>
));

ContextMenuSubTrigger.displayName = "ContextMenuSubTrigger";

export {
  RadixContextMenuTrigger as ContextMenuTrigger,
  RadixContextMenuLabel as ContextMenuLabel,
  RadixContextMenuSeparator as ContextMenuSeparator,
  RadixContextMenuGroup as ContextMenuGroup,
  RadixContextMenuPortal as ContextMenuPortal,
  RadixContextMenuSub as ContextMenuSub,
  RadixContextMenuRadioGroup as ContextMenuRadioGroup,
} from "@aster/ui";
