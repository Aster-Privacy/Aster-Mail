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
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

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

interface Rect {
  left: number;
  width: number;
}

const EMPTY_RECT: Rect = { left: 0, width: 0 };

export function SettingsTabBar<T extends string>({
  tabs,
  active,
  on_change,
}: SettingsTabBarProps<T>) {
  const scroller_ref = useRef<HTMLDivElement | null>(null);
  const row_ref = useRef<HTMLDivElement | null>(null);
  const button_refs = useRef<(HTMLButtonElement | null)[]>([]);
  const has_rendered_ref = useRef(false);
  const [active_rect, set_active_rect] = useState<Rect>(EMPTY_RECT);
  const [hover_rect, set_hover_rect] = useState<Rect>(EMPTY_RECT);
  const [hover_visible, set_hover_visible] = useState(false);

  const active_index = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === active),
  );

  const rect_of = (index: number): Rect => {
    const node = button_refs.current[index];

    if (!node) return EMPTY_RECT;

    return { left: node.offsetLeft, width: node.offsetWidth };
  };

  const measure_active = useCallback(() => {
    const node = button_refs.current[active_index];

    if (!node) return;

    set_active_rect((current) =>
      current.left === node.offsetLeft && current.width === node.offsetWidth
        ? current
        : { left: node.offsetLeft, width: node.offsetWidth },
    );
  }, [active_index]);

  useLayoutEffect(() => {
    measure_active();
  }, [measure_active, tabs]);

  useEffect(() => {
    const row = row_ref.current;

    if (!row || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => measure_active());

    observer.observe(row);

    return () => observer.disconnect();
  }, [measure_active]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      has_rendered_ref.current = true;
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  const point_at = (index: number) => {
    set_hover_rect(rect_of(index));
    set_hover_visible(true);
  };

  const reveal = useCallback((index: number) => {
    const scroller = scroller_ref.current;
    const node = button_refs.current[index];

    if (!scroller || !node) return;

    const left = node.offsetLeft;
    const right = left + node.offsetWidth;
    const view_start = scroller.scrollLeft;
    const view_end = view_start + scroller.clientWidth;

    if (left < view_start + 16) {
      scroller.scrollTo({ left: Math.max(0, left - 16), behavior: "smooth" });

      return;
    }

    if (right > view_end - 16) {
      scroller.scrollTo({
        left: right - scroller.clientWidth + 16,
        behavior: "smooth",
      });
    }
  }, []);

  useEffect(() => {
    reveal(active_index);
  }, [active_index, reveal]);

  const select = (index: number) => {
    const tab = tabs[index];

    if (!tab) return;

    on_change(tab.key);
    button_refs.current[index]?.focus();
  };

  const handle_key = (event: ReactKeyboardEvent, index: number) => {
    if (tabs.length === 0) return;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      select((index + 1) % tabs.length);

      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      select((index - 1 + tabs.length) % tabs.length);

      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      select(0);

      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      select(tabs.length - 1);
    }
  };

  const motion = has_rendered_ref.current
    ? "transform 180ms cubic-bezier(0.32, 0.72, 0, 1), width 180ms cubic-bezier(0.32, 0.72, 0, 1), opacity 140ms ease"
    : "opacity 140ms ease";

  return (
    <div className="mb-7 border-b border-edge-secondary">
      <div
        ref={scroller_ref}
        className="-ms-4 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div
          ref={row_ref}
          className="relative inline-flex items-center"
          role="tablist"
          onPointerCancel={() => set_hover_visible(false)}
          onPointerLeave={() => set_hover_visible(false)}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1 bottom-1 start-0 rounded-md bg-black/[0.05] dark:bg-white/[0.07]"
            style={{
              width: hover_rect.width,
              transform: `translateX(${hover_rect.left}px)`,
              opacity: hover_visible ? 1 : 0,
              transition: motion,
            }}
          />
          {tabs.map(({ key, label, icon }, index) => {
            const selected = active === key;

            return (
              <button
                key={key}
                ref={(node) => {
                  button_refs.current[index] = node;
                }}
                aria-selected={selected}
                className={`relative z-[1] flex h-10 md:h-8 items-center gap-2 rounded-md px-4 my-1 text-[14px] font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
                  selected ? "text-txt-primary" : "text-txt-muted"
                }`}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
                onClick={() => on_change(key)}
                onFocus={() => point_at(index)}
                onKeyDown={(event) => handle_key(event, index)}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "mouse") return;
                  point_at(index);
                }}
              >
                {icon}
                {label}
              </button>
            );
          })}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 start-0 h-0.5 rounded-full bg-txt-primary"
            style={{
              width: active_rect.width * 0.8,
              transform: `translateX(${active_rect.left + active_rect.width * 0.1}px)`,
              opacity: active_rect.width > 0 ? 1 : 0,
              transition: motion,
            }}
          />
        </div>
      </div>
    </div>
  );
}
