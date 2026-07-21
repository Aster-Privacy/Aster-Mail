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
import { ViewMockupSplit } from "@/components/settings/appearance/view_mode_mockups";

export function ThemeMockupLight() {
  return <ViewMockupSplit theme="light" />;
}

export function ThemeMockupDark() {
  return <ViewMockupSplit theme="dark" />;
}

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

export function ThemeMockupColor(_props: { name: ColorThemeName }) {
  return <ViewMockupSplit theme="themed" />;
}

export function ThemeMockupSystem() {
  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden">
      <div className="absolute inset-0 rounded-lg overflow-hidden [&>div]:rounded-none">
        <ViewMockupSplit theme="light" />
      </div>
      <div
        className="absolute inset-0 rounded-lg overflow-hidden [&>div]:rounded-none"
        style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
      >
        <ViewMockupSplit theme="dark" />
      </div>
    </div>
  );
}
