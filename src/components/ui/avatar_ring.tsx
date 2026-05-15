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
import { memo, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { get_badge_visual } from "./badge_registry";

interface AvatarRingProps {
  badge_slug: string | null | undefined;
  enabled: boolean;
  size?: number;
  thickness?: number;
  children: ReactNode;
  className?: string;
}

export const AvatarRing = memo(function AvatarRing({
  badge_slug,
  enabled,
  size,
  thickness = 2,
  children,
  className,
}: AvatarRingProps) {
  if (!enabled || !badge_slug) {
    return <>{children}</>;
  }

  const visual = get_badge_visual(badge_slug);
  const style: React.CSSProperties = {
    background: `conic-gradient(from 0deg, ${visual.gradient_from}, ${visual.gradient_to}, ${visual.gradient_from})`,
    padding: `${thickness}px`,
    borderRadius: "9999px",
    boxSizing: "border-box",
  };
  if (size) {
    style.width = size;
    style.height = size;
    style.minWidth = size;
    style.minHeight = size;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center flex-shrink-0",
        className,
      )}
      style={style}
    >
      <span className="inline-flex items-center justify-center bg-bg-elevated rounded-full w-full h-full">
        {children}
      </span>
    </span>
  );
});
