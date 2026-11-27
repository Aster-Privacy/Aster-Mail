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
import * as React from "react";
import {
  DropdownMenu as BaseDropdownMenu,
  DropdownMenuCheckboxItem as BaseDropdownMenuCheckboxItem,
  DropdownMenuContent as BaseDropdownMenuContent,
  DropdownMenuItem as BaseDropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioItem as BaseDropdownMenuRadioItem,
  DropdownMenuSubContent as BaseDropdownMenuSubContent,
  DropdownMenuSubTrigger as BaseDropdownMenuSubTrigger,
} from "@aster/ui";

import { with_menu_item_labels } from "@/components/ui/menu_item_label";
import { cn } from "@/lib/utils";
import {
  use_host_present,
  use_nested_overlay_open,
} from "@/lib/nested_overlay";

const MENU_MAX_HEIGHT =
  "max-h-[var(--radix-dropdown-menu-content-available-height,calc(100dvh_-_16px))]";

const MENU_MAX_WIDTH =
  "max-w-[min(var(--radix-dropdown-menu-content-available-width,100vw),calc(100vw_-_1rem))]";

export function DropdownMenu({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof BaseDropdownMenu>) {
  const state = use_nested_overlay_open(open, defaultOpen, onOpenChange);

  return (
    <BaseDropdownMenu
      {...props}
      open={state.open}
      onOpenChange={state.on_open_change}
    />
  );
}

export {
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuRadioGroup,
} from "@aster/ui";

export const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof BaseDropdownMenuSubContent>,
  React.ComponentPropsWithoutRef<typeof BaseDropdownMenuSubContent>
>(({ className, collisionPadding = 8, ...props }, ref) => (
  <DropdownMenuPortal>
    <BaseDropdownMenuSubContent
      ref={ref}
      className={cn(
        MENU_MAX_HEIGHT,
        MENU_MAX_WIDTH,
        "overflow-y-auto overflow-x-hidden select-none",
        className,
      )}
      collisionPadding={collisionPadding}
      {...props}
    />
  </DropdownMenuPortal>
));

DropdownMenuSubContent.displayName = "DropdownMenuSubContent";

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof BaseDropdownMenuContent>,
  React.ComponentPropsWithoutRef<typeof BaseDropdownMenuContent>
>(({ className, ...props }, ref) => {
  const host_present = use_host_present();

  if (!host_present) return null;

  return (
    <BaseDropdownMenuContent
      ref={ref}
      className={cn(MENU_MAX_HEIGHT, MENU_MAX_WIDTH, "select-none", className)}
      {...props}
    />
  );
});

DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof BaseDropdownMenuItem>,
  React.ComponentPropsWithoutRef<typeof BaseDropdownMenuItem>
>(({ asChild, children, ...props }, ref) => (
  <BaseDropdownMenuItem ref={ref} asChild={asChild} {...props}>
    {asChild ? children : with_menu_item_labels(children)}
  </BaseDropdownMenuItem>
));

DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof BaseDropdownMenuCheckboxItem>,
  React.ComponentPropsWithoutRef<typeof BaseDropdownMenuCheckboxItem>
>(({ children, ...props }, ref) => (
  <BaseDropdownMenuCheckboxItem ref={ref} {...props}>
    {with_menu_item_labels(children)}
  </BaseDropdownMenuCheckboxItem>
));

DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

export const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof BaseDropdownMenuRadioItem>,
  React.ComponentPropsWithoutRef<typeof BaseDropdownMenuRadioItem>
>(({ children, ...props }, ref) => (
  <BaseDropdownMenuRadioItem ref={ref} {...props}>
    {with_menu_item_labels(children)}
  </BaseDropdownMenuRadioItem>
));

DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

export const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof BaseDropdownMenuSubTrigger>,
  React.ComponentPropsWithoutRef<typeof BaseDropdownMenuSubTrigger>
>(({ children, ...props }, ref) => (
  <BaseDropdownMenuSubTrigger ref={ref} {...props}>
    {with_menu_item_labels(children)}
  </BaseDropdownMenuSubTrigger>
));

DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";
