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
export const DARK_ONLY_COLOR_THEMES = [
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
] as const;

const dark_only_set = new Set<string>(DARK_ONLY_COLOR_THEMES);

let theme_is_dark = true;
let palette_forces_dark = false;

export function is_dark_only_color_theme(color_theme: unknown): boolean {
  return typeof color_theme === "string" && dark_only_set.has(color_theme);
}

function apply_dark_class(): void {
  if (typeof document === "undefined") return;

  document.documentElement.classList.toggle(
    "dark",
    theme_is_dark || palette_forces_dark,
  );
}

export function set_theme_is_dark(value: boolean): void {
  theme_is_dark = value;
  apply_dark_class();
}

export function set_palette_forces_dark(value: boolean): void {
  palette_forces_dark = value;
  apply_dark_class();
}

export function is_dark_appearance_active(): boolean {
  return theme_is_dark || palette_forces_dark;
}
