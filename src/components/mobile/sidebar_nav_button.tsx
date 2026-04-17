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
import { useCallback, useRef, type ReactNode } from "react";

export interface SidebarNavButtonProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  count?: number;
  trailing?: ReactNode;
  on_click: () => void;
  on_long_press?: () => void;
}

export function SidebarNavButton({
  icon,
  label,
  active,
  count,
  trailing,
  on_click,
  on_long_press,
}: SidebarNavButtonProps) {
  const timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const did_long_press_ref = useRef(false);
  const touch_start_pos = useRef<{ x: number; y: number } | null>(null);

  const handle_touch_start = useCallback(
    (e: React.TouchEvent) => {
      if (!on_long_press) return;
      did_long_press_ref.current = false;
      touch_start_pos.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      timer_ref.current = setTimeout(() => {
        did_long_press_ref.current = true;
        on_long_press();
      }, 500);
    },
    [on_long_press],
  );

  const handle_touch_move = useCallback((e: React.TouchEvent) => {
    if (!timer_ref.current || !touch_start_pos.current) return;
    const dx = Math.abs(e.touches[0].clientX - touch_start_pos.current.x);
    const dy = Math.abs(e.touches[0].clientY - touch_start_pos.current.y);

    if (dx > 8 || dy > 8) {
      clearTimeout(timer_ref.current);
      timer_ref.current = null;
      touch_start_pos.current = null;
    }
  }, []);

  const handle_touch_end = useCallback(() => {
    if (timer_ref.current) {
      clearTimeout(timer_ref.current);
      timer_ref.current = null;
    }
    touch_start_pos.current = null;
  }, []);

  const handle_click = useCallback(() => {
    if (did_long_press_ref.current) {
      did_long_press_ref.current = false;

      return;
    }
    on_click();
  }, [on_click]);

  return (
    <button
      className="sidebar-nav-btn relative flex h-11 w-full items-center gap-3 rounded-lg px-3 text-[15px]"
      data-nav-active={active}
      style={{
        zIndex: 1,
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        WebkitTapHighlightColor: "transparent",
      }}
      type="button"
      onClick={handle_click}
      onContextMenu={
        on_long_press
          ? (e) => {
              e.preventDefault();
              on_long_press();
            }
          : undefined
      }
      onTouchCancel={handle_touch_end}
      onTouchEnd={handle_touch_end}
      onTouchMove={handle_touch_move}
      onTouchStart={handle_touch_start}
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center"
        style={{ color: active ? "var(--text-primary)" : "var(--text-muted)" }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {trailing}
      {count != null && count > 0 && (
        <span
          className="shrink-0 text-[13px] font-medium tabular-nums"
          style={{
            color: active ? "var(--text-secondary)" : "var(--text-muted)",
          }}
        >
          {count > 999 ? "999+" : count.toLocaleString()}
        </span>
      )}
    </button>
  );
}
