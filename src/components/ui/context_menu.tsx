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
import { forwardRef } from "react";
import { RadixContextMenuContent } from "@aster/ui";

import { cn } from "@/lib/utils";

export const ContextMenuContent = forwardRef<
  React.ElementRef<typeof RadixContextMenuContent>,
  React.ComponentPropsWithoutRef<typeof RadixContextMenuContent>
>(({ className, ...props }, ref) => (
  <RadixContextMenuContent
    ref={ref}
    className={cn(
      "max-h-[var(--radix-context-menu-content-available-height,calc(100dvh_-_16px))]",
      className,
    )}
    {...props}
  />
));

ContextMenuContent.displayName = "ContextMenuContent";

export {
  RadixContextMenu as ContextMenu,
  RadixContextMenuTrigger as ContextMenuTrigger,
  RadixContextMenuItem as ContextMenuItem,
  RadixContextMenuCheckboxItem as ContextMenuCheckboxItem,
  RadixContextMenuRadioItem as ContextMenuRadioItem,
  RadixContextMenuLabel as ContextMenuLabel,
  RadixContextMenuSeparator as ContextMenuSeparator,
  RadixContextMenuGroup as ContextMenuGroup,
  RadixContextMenuPortal as ContextMenuPortal,
  RadixContextMenuSub as ContextMenuSub,
  RadixContextMenuSubContent as ContextMenuSubContent,
  RadixContextMenuSubTrigger as ContextMenuSubTrigger,
  RadixContextMenuRadioGroup as ContextMenuRadioGroup,
} from "@aster/ui";
