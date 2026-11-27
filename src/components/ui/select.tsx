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
import type { ComponentProps } from "react";

import { Select as BaseSelect } from "@aster/ui";

import { use_nested_overlay_open } from "@/lib/nested_overlay";

export function Select({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: ComponentProps<typeof BaseSelect>) {
  const state = use_nested_overlay_open(open, defaultOpen, onOpenChange);

  return (
    <BaseSelect
      {...props}
      open={state.open}
      onOpenChange={state.on_open_change}
    />
  );
}

export {
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from "@aster/ui";
