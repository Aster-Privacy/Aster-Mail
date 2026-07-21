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
  ThemeMockupSystem,
  ThemeMockupColor,
  type ColorThemeName,
} from "@/components/settings/appearance/theme_mockups";
import { SelectedBadge } from "@/components/settings/appearance/selected_badge";

interface ThemeCardProps {
  mode: "light" | "dark" | "system" | ColorThemeName;
  label: string;
  is_selected: boolean;
  on_select: () => void;
  full_width?: boolean;
  size?: "default" | "lg";
}

export function ThemeCard({
  mode,
  label,
  is_selected,
  on_select,
  full_width = false,
  size = "default",
}: ThemeCardProps) {
  const get_mockup = () => {
    if (mode === "light") return <ThemeMockupLight />;
    if (mode === "dark") return <ThemeMockupDark />;
    if (mode === "system") return <ThemeMockupSystem />;

    return <ThemeMockupColor name={mode} />;
  };

  const get_border_color = () => {
    if (mode === "light") return "1px solid #e5e5e5";
    if (mode === "system") return "1px solid var(--border-secondary)";
    if (mode === "purple") return "1px solid #3a2d4d";
    if (mode === "green") return "1px solid #2b4a3b";
    if (mode === "rose") return "1px solid #4d2a35";
    if (mode === "orange") return "1px solid #4d3820";
    if (mode === "teal") return "1px solid #2b4949";

    return "1px solid #1a1a1a";
  };

  const get_bg_color = () => {
    if (mode === "light") return "#ffffff";
    if (mode === "system") return "var(--bg-primary)";

    return "#121212";
  };

  const color_names: ColorThemeName[] = [
    "purple",
    "green",
    "rose",
    "orange",
    "teal",
    "indigo",
    "amber",
    "cyan",
    "slate",
    "aster-blue",
    "lime",
    "fuchsia",
    "emerald",
    "pink",
    "black",
  ];
  const scope_class = color_names.includes(mode as ColorThemeName)
    ? `dark theme-${mode}`
    : "";

  return (
    <button
      className={`group p-3 rounded-[14px] transition-all cursor-pointer outline-none focus:outline-none ${full_width ? "w-full" : size === "lg" ? "w-56 flex-none" : "w-40 flex-none"}`}
      type="button"
      onClick={on_select}
    >
      <div
        className={`${scope_class} relative w-full aspect-[4/3] rounded-lg mb-3 transition-all ${
          is_selected
            ? "ring-2 ring-brand ring-offset-2 ring-offset-surf-primary"
            : "group-focus-visible:ring-2 group-focus-visible:ring-brand group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-surf-primary"
        }`}
      >
        <div
          className="w-full h-full rounded-lg overflow-hidden"
          style={{ border: get_border_color(), backgroundColor: get_bg_color() }}
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
