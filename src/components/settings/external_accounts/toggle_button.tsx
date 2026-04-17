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
export function render_toggle_button(
  is_active: boolean,
  label: string,
  on_click: () => void,
  key?: string,
) {
  return (
    <button
      key={key}
      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 outline-none ${is_active ? "bg-surf-primary text-txt-primary" : "bg-transparent text-txt-muted"}`}
      style={{
        boxShadow: is_active
          ? "rgba(0, 0, 0, 0.1) 0px 1px 3px, rgba(0, 0, 0, 0.06) 0px 1px 2px"
          : "none",
      }}
      type="button"
      onClick={on_click}
    >
      {label}
    </button>
  );
}
