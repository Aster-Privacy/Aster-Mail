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
import { next_radio_index } from "@/lib/radiogroup_navigation";

export function render_toggle_button(
  is_active: boolean,
  label: string,
  on_click: () => void,
  key?: string,
) {
  const handle_keydown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const group = e.currentTarget.parentElement;

    if (!group) return;

    const radios = Array.from(
      group.querySelectorAll<HTMLButtonElement>("[role='radio']"),
    );
    const current = radios.indexOf(e.currentTarget);

    if (current < 0) return;

    const is_rtl = document.documentElement.getAttribute("dir") === "rtl";
    const next = next_radio_index(e["key"], current, radios.length, is_rtl);

    if (next === null) return;

    e.preventDefault();
    radios[next].focus();
    radios[next].click();
  };

  return (
    <button
      key={key}
      aria-checked={is_active}
      className={`h-8 px-4 text-sm font-medium rounded-full transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]/50 ${is_active ? "bg-[var(--bg-primary)] text-txt-primary" : "bg-transparent text-txt-muted hover:text-txt-secondary"}`}
      role="radio"
      style={{
        boxShadow: is_active
          ? "rgba(0, 0, 0, 0.1) 0px 1px 3px, rgba(0, 0, 0, 0.06) 0px 1px 2px"
          : "none",
      }}
      tabIndex={is_active ? 0 : -1}
      type="button"
      onClick={on_click}
      onKeyDown={handle_keydown}
    >
      {label}
    </button>
  );
}
