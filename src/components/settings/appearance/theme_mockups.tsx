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
import { useId } from "react";

import {
  AppChrome,
  InboxList,
  PreviewSvg,
  preview_ids,
} from "@/components/settings/appearance/app_preview";

const THEME_SCENE_WIDTH = 880;
const THEME_SCENE_HEIGHT = 550;

export type ColorThemeName =
  | "purple"
  | "green"
  | "rose"
  | "orange"
  | "teal"
  | "indigo"
  | "amber"
  | "cyan"
  | "slate"
  | "aster-blue"
  | "lime"
  | "fuchsia"
  | "emerald"
  | "pink"
  | "black";

export type ThemePreviewMode = "light" | "dark" | "system" | ColorThemeName;

export const LIGHT_PREVIEW_SCOPE = "theme_preview_scope theme_preview_light";
export const DARK_PREVIEW_SCOPE = "theme_preview_scope dark";

export function get_theme_preview_scope(mode: ThemePreviewMode) {
  if (mode === "light") return LIGHT_PREVIEW_SCOPE;
  if (mode === "dark") return DARK_PREVIEW_SCOPE;
  if (mode === "system") return "";

  return `${DARK_PREVIEW_SCOPE} theme-${mode}`;
}

export function ThemeMockup() {
  const ids = preview_ids(useId());

  return (
    <PreviewSvg
      height={THEME_SCENE_HEIGHT}
      ids={ids}
      width={THEME_SCENE_WIDTH}
    >
      <AppChrome
        height={THEME_SCENE_HEIGHT}
        ids={ids}
        width={THEME_SCENE_WIDTH}
      >
        {(island) => <InboxList {...island} />}
      </AppChrome>
    </PreviewSvg>
  );
}

export function ThemeMockupSystem() {
  return (
    <span className="relative block h-full w-full">
      <span className={`absolute inset-0 ${LIGHT_PREVIEW_SCOPE}`}>
        <ThemeMockup />
      </span>
      <span
        className={`absolute inset-0 ${DARK_PREVIEW_SCOPE}`}
        style={{ clipPath: "polygon(62% 0, 100% 0, 100% 100%, 38% 100%)" }}
      >
        <ThemeMockup />
      </span>
    </span>
  );
}
