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
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

export interface SettingsTabBarItem<T extends string> {
  key: T;
  label: string;
  icon?: ReactNode;
}

interface SettingsTabBarProps<T extends string> {
  tabs: SettingsTabBarItem<T>[];
  active: T;
  on_change: (key: T) => void;
  layout_id: string;
}

export function SettingsTabBar<T extends string>({
  tabs,
  active,
  on_change,
  layout_id,
}: SettingsTabBarProps<T>) {
  const scroll_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroll_ref.current;

    if (!el) return;

    const handle_wheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      if (el.scrollWidth <= el.clientWidth) return;

      e.preventDefault();
      el.scrollLeft += e.deltaY + e.deltaX;
    };

    el.addEventListener("wheel", handle_wheel, { passive: false });

    return () => el.removeEventListener("wheel", handle_wheel);
  }, []);

  return (
    <div
      ref={scroll_ref}
      className="border-b border-edge-secondary overflow-x-auto overflow-y-hidden"
      onAuxClick={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
    >
      <div className="flex gap-1 min-w-max">
        {tabs.map(({ key, label, icon }) => (
          <button
            key={key}
            aria-selected={active === key}
            className="relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap outline-none transition-colors"
            style={{
              color: active === key ? "var(--text-primary)" : "var(--text-muted)",
            }}
            type="button"
            onClick={() => on_change(key)}
          >
            {icon}
            {label}
            {active === key && (
              <motion.span
                className="absolute left-0 right-0 -bottom-px h-0.5 bg-blue-500"
                layoutId={`${layout_id}-tab-indicator`}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
