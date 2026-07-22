//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { useState, useRef, useCallback } from "react";

import { cn } from "@/lib/utils";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  ariaLabel?: string;
  format_tooltip?: (value: number) => string;
  className?: string;
  onChange: (value: number) => void;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  ariaLabel,
  format_tooltip,
  className,
  onChange,
}: SliderProps) {
  const track_ref = useRef<HTMLDivElement>(null);
  const [is_dragging, set_is_dragging] = useState(false);
  const [drag_percent, set_drag_percent] = useState<number | null>(null);

  const value_to_percent = (v: number) => ((v - min) / (max - min)) * 100;

  const percent_from_client_x = useCallback(
    (client_x: number) => {
      const track = track_ref.current;

      if (!track) return value_to_percent(value);

      const rect = track.getBoundingClientRect();
      const raw = ((client_x - rect.left) / rect.width) * 100;

      return Math.min(100, Math.max(0, raw));
    },
    [value, min, max],
  );

  const percent_to_stepped_value = useCallback(
    (percent: number) => {
      const raw_value = min + (percent / 100) * (max - min);
      const stepped = Math.round(raw_value / step) * step;

      return Math.min(max, Math.max(min, stepped));
    },
    [min, max, step],
  );

  const handle_pointer_down = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    set_is_dragging(true);
    set_drag_percent(percent_from_client_x(e.clientX));
  };

  const handle_pointer_move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!is_dragging) return;
    set_drag_percent(percent_from_client_x(e.clientX));
  };

  const handle_pointer_up = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!is_dragging) return;

    const percent = percent_from_client_x(e.clientX);

    onChange(percent_to_stepped_value(percent));
    set_is_dragging(false);
    set_drag_percent(null);
  };

  const handle_key_down = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(max, value + step));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.max(min, value - step));
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(min);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(max);
    }
  };

  const display_percent =
    is_dragging && drag_percent !== null ? drag_percent : value_to_percent(value);
  const display_value =
    is_dragging && drag_percent !== null
      ? percent_to_stepped_value(drag_percent)
      : value;

  const fill_transition = is_dragging
    ? ""
    : "transition-[width] duration-150 ease-out";
  const thumb_transition = is_dragging
    ? "transition-[transform,box-shadow] duration-100"
    : "transition-[left,transform,box-shadow] duration-150 ease-out";

  return (
    <div
      ref={track_ref}
      className={cn(
        "relative py-2 group/slider cursor-pointer touch-none select-none",
        className,
      )}
      onPointerCancel={handle_pointer_up}
      onPointerDown={handle_pointer_down}
      onPointerMove={handle_pointer_move}
      onPointerUp={handle_pointer_up}
    >
      <div
        aria-hidden="true"
        className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full pointer-events-none"
        style={{
          background: "color-mix(in srgb, var(--text-primary) 18%, transparent)",
        }}
      />
      <div
        aria-hidden="true"
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full pointer-events-none",
          fill_transition,
        )}
        style={{
          width: `${display_percent}%`,
          background:
            "linear-gradient(90deg, var(--accent-alpha-75, rgba(59, 130, 246, 0.75)), var(--accent-blue))",
        }}
      />
      {is_dragging && format_tooltip && (
        <div
          className="absolute -top-8 -translate-x-1/2 px-2 py-1 rounded-md text-xs font-medium text-white bg-[var(--accent-blue)] shadow-lg pointer-events-none whitespace-nowrap"
          style={{ left: `${display_percent}%` }}
        >
          {format_tooltip(display_value)}
        </div>
      )}
      <div
        aria-label={ariaLabel}
        aria-valuemax={max}
        aria-valuemin={min}
        aria-valuenow={display_value}
        className={cn(
          "absolute top-1/2 w-5 h-5 rounded-full border-0 bg-[var(--accent-blue)] shadow-[0_1px_3px_rgba(0,0,0,0.4)] -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing hover:scale-125 hover:shadow-[0_2px_8px_rgba(0,0,0,0.45)] active:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-blue)]/30",
          thumb_transition,
        )}
        role="slider"
        style={{ left: `${display_percent}%` }}
        tabIndex={0}
        onKeyDown={handle_key_down}
      />
    </div>
  );
}
