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
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import {
  DATED_ICON_FONT_STACK,
  DATED_ICON_FONT_WEIGHT,
  DATED_ICON_PANEL_FILL,
  DATED_ICON_TEXT_FILL,
  dated_icon_box,
  use_dated_calendar_layout,
  type DatedCalendarIcon,
} from "@/lib/dated_calendar_icon";

interface DatedCalendarImageProps {
  kind: DatedCalendarIcon;
  className?: string;
  alt?: string;
  align?: "center" | "start";
  fallback?: ReactNode;
}

export function DatedCalendarImage({
  kind,
  className,
  alt = "",
  align = "center",
  fallback,
}: DatedCalendarImageProps) {
  const layout = use_dated_calendar_layout(kind);
  const box = dated_icon_box(kind);
  const [failed_src, set_failed_src] = useState<string | null>(null);
  const image_ref = useRef<SVGImageElement>(null);
  const show_fallback = failed_src === box.src && fallback !== undefined;

  useLayoutEffect(() => {
    const node = image_ref.current;

    if (!node) return;
    const src = box.src;
    const handle_error = () => set_failed_src(src);

    node.addEventListener("error", handle_error);

    return () => node.removeEventListener("error", handle_error);
  }, [box.src, show_fallback]);

  if (show_fallback) return <>{fallback}</>;

  const labelled = alt.length > 0;

  return (
    <svg
      aria-hidden={labelled ? undefined : "true"}
      aria-label={labelled ? alt : undefined}
      className={className}
      data-dated-calendar-icon={kind}
      focusable="false"
      height={box.height}
      preserveAspectRatio={
        align === "start" ? "xMinYMid meet" : "xMidYMid meet"
      }
      role={labelled ? "img" : undefined}
      style={{ userSelect: "none" }}
      viewBox={`0 0 ${box.width} ${box.height}`}
      width={box.width}
      xmlns="http://www.w3.org/2000/svg"
    >
      <image
        ref={image_ref}
        height={box.height}
        href={box.src}
        preserveAspectRatio="none"
        width={box.width}
      />
      {layout && (
        <>
          {layout.erase && (
            <rect
              fill={DATED_ICON_PANEL_FILL}
              height={layout.erase[3]}
              width={layout.erase[2]}
              x={layout.erase[0]}
              y={layout.erase[1]}
            />
          )}
          <text
            fill={DATED_ICON_TEXT_FILL}
            fontFamily={DATED_ICON_FONT_STACK}
            fontSize={layout.font_px}
            fontWeight={DATED_ICON_FONT_WEIGHT}
            style={{ fontKerning: "none" }}
            textAnchor="middle"
            x={layout.x}
            y={layout.y}
          >
            {layout.label}
          </text>
        </>
      )}
    </svg>
  );
}
