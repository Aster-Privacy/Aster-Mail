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
import { PreviewOption } from "@/components/settings/appearance/app_preview";
import {
  ThemeMockup,
  ThemeMockupSystem,
  get_theme_preview_scope,
  type ThemePreviewMode,
} from "@/components/settings/appearance/theme_mockups";

interface ThemeCardProps {
  mode: ThemePreviewMode;
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
  return (
    <PreviewOption
      is_selected={is_selected}
      label={label}
      scope_class={get_theme_preview_scope(mode)}
      on_select={on_select}
    >
      {mode === "system" ? <ThemeMockupSystem /> : <ThemeMockup />}
    </PreviewOption>
  );
}
