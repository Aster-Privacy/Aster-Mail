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
import type {
  ComponentProps,
  ComponentPropsWithoutRef,
  ElementRef,
} from "react";

import { forwardRef } from "react";
import {
  Popover as BasePopover,
  PopoverContent as BasePopoverContent,
} from "@aster/ui";

import {
  use_host_present,
  use_nested_overlay_open,
} from "@/lib/nested_overlay";

export function Popover({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: ComponentProps<typeof BasePopover>) {
  const state = use_nested_overlay_open(open, defaultOpen, onOpenChange);

  return (
    <BasePopover
      {...props}
      open={state.open}
      onOpenChange={state.on_open_change}
    />
  );
}

export const PopoverContent = forwardRef<
  ElementRef<typeof BasePopoverContent>,
  ComponentPropsWithoutRef<typeof BasePopoverContent>
>((props, ref) => {
  const host_present = use_host_present();

  if (!host_present) return null;

  return <BasePopoverContent ref={ref} {...props} />;
});

PopoverContent.displayName = "PopoverContent";

export { PopoverTrigger, PopoverAnchor } from "@aster/ui";
