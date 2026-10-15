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
  DropdownMenuContent as BaseDropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuSubContent as BaseDropdownMenuSubContent,
} from "@aster/ui";

import { cn } from "@/lib/utils";

const MENU_MAX_HEIGHT =
  "max-h-[var(--radix-dropdown-menu-content-available-height,calc(100dvh_-_16px))]";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
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
        "overflow-y-auto overflow-x-hidden",
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
>(({ className, ...props }, ref) => (
  <BaseDropdownMenuContent
    ref={ref}
    className={cn(MENU_MAX_HEIGHT, className)}
    {...props}
  />
));

DropdownMenuContent.displayName = "DropdownMenuContent";
