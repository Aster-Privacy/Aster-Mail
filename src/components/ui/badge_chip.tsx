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
import { memo } from "react";

import { cn } from "@/lib/utils";
import type { Badge } from "@/services/api/user";

import {
  format_find_order,
  get_badge_visual,
} from "./badge_registry";

interface BadgeChipProps {
  badge: Badge;
  size?: "xs" | "sm" | "md";
  show_find_order?: boolean;
  show_label?: boolean;
  className?: string;
  title?: string;
}

const size_classes = {
  xs: "text-[9px] px-1 py-[1px] gap-0.5 rounded",
  sm: "text-[10px] px-1.5 py-0.5 gap-1 rounded",
  md: "text-[11px] px-2 py-0.5 gap-1 rounded-md",
};

const icon_size_classes = {
  xs: "w-2.5 h-2.5",
  sm: "w-3 h-3",
  md: "w-3.5 h-3.5",
};

export const BadgeChip = memo(function BadgeChip({
  badge,
  size = "sm",
  show_find_order = true,
  show_label = true,
  className,
  title,
}: BadgeChipProps) {
  const visual = get_badge_visual(badge.slug);
  const Icon = visual.icon;
  const find_label = show_find_order
    ? format_find_order(badge.find_order)
    : null;

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium border select-none",
        size_classes[size],
        visual.bg_class,
        visual.text_class,
        visual.border_class,
        className,
      )}
      title={title ?? badge.display_name}
    >
      <Icon className={cn(icon_size_classes[size], "flex-shrink-0")} />
      {show_label && <span className="truncate">{badge.display_name}</span>}
      {find_label && (
        <span className="tabular-nums opacity-70">{find_label}</span>
      )}
    </span>
  );
});
