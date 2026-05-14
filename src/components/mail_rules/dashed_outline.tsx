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

interface DashedOutlineProps {
  radius?: number;
  dash?: number;
  gap?: number;
}

export function DashedOutline({
  radius = 12,
  dash = 3,
  gap = 3,
}: DashedOutlineProps) {
  const container_ref = React.useRef<HTMLSpanElement>(null);
  const [size, set_size] = React.useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });

  React.useLayoutEffect(() => {
    const el = container_ref.current?.parentElement;

    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();

      set_size({ w: r.width, h: r.height });
    };

    measure();
    const ro = new ResizeObserver(measure);

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = Math.max(1, size.w);
  const h = Math.max(1, size.h);
  const r = Math.min(radius, h / 2, w / 2);
  const straight_x = Math.max(0, w - 2 * r);
  const straight_y = Math.max(0, h - 2 * r);
  const arc_length = (Math.PI * r) / 2;
  const perimeter = 2 * (straight_x + straight_y) + 4 * arc_length;
  const segment = dash + gap;
  const segments = Math.max(8, Math.round(perimeter / segment));
  const adjusted = perimeter / segments;
  const adjusted_dash = adjusted * (dash / segment);
  const adjusted_gap = adjusted - adjusted_dash;

  return (
    <span
      ref={container_ref}
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
    >
      <svg
        width={w}
        height={h}
        className="text-neutral-300 dark:text-neutral-700"
      >
        <rect
          x="0.5"
          y="0.5"
          width={Math.max(0, w - 1)}
          height={Math.max(0, h - 1)}
          rx={Math.max(0, r - 0.5)}
          ry={Math.max(0, r - 0.5)}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray={`${adjusted_dash} ${adjusted_gap}`}
        />
      </svg>
    </span>
  );
}
