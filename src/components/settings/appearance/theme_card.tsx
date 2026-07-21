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
import {
  ThemeMockupLight,
  ThemeMockupDark,
} from "@/components/settings/appearance/theme_mockups";
import { SelectedBadge } from "@/components/settings/appearance/selected_badge";

interface ThemeCardProps {
  mode: "light" | "dark";
  label: string;
  is_selected: boolean;
  on_select: () => void;
}

export function ThemeCard({
  mode,
  label,
  is_selected,
  on_select,
}: ThemeCardProps) {
  const get_mockup = () => {
    if (mode === "light") return <ThemeMockupLight />;

    return <ThemeMockupDark />;
  };

  const get_border_color = () => {
    if (mode === "light") return "1px solid #e5e5e5";

    return "1px solid #1a1a1a";
  };

  return (
    <button
      className="flex-1 p-3 rounded-[14px] transition-all cursor-pointer"
      type="button"
      onClick={on_select}
    >
      <div
        className={`relative w-full aspect-[4/3] rounded-lg mb-3 transition-all ${
          is_selected
            ? "ring-2 ring-brand ring-offset-2 ring-offset-surf-primary"
            : ""
        }`}
      >
        <div
          className="w-full h-full rounded-lg overflow-hidden"
          style={{ border: get_border_color() }}
        >
          {get_mockup()}
        </div>
        {is_selected && <SelectedBadge />}
      </div>
      <div className="flex items-center justify-center">
        <span className="text-sm font-medium text-txt-primary">{label}</span>
      </div>
    </button>
  );
}
