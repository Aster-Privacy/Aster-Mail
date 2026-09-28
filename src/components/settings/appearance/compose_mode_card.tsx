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
import { SelectionMark } from "@aster/ui";

import {
  ComposeMockupDefault,
  ComposeMockupFullscreen,
  ComposeMockupMinimized,
} from "@/components/settings/appearance/compose_mode_mockups";

interface ComposeModeCardProps {
  mode: "default" | "fullscreen" | "minimized";
  label: string;
  is_selected: boolean;
  on_select: () => void;
  theme: "light" | "dark" | "themed";
}

export function ComposeModeCard({
  mode,
  label,
  is_selected,
  on_select,
  theme,
}: ComposeModeCardProps) {
  const get_mockup = () => {
    if (mode === "fullscreen") return <ComposeMockupFullscreen theme={theme} />;
    if (mode === "minimized") return <ComposeMockupMinimized theme={theme} />;

    return <ComposeMockupDefault theme={theme} />;
  };

  const get_border_color = () => {
    if (theme === "themed") return "1px solid var(--border-secondary)";
    if (theme === "light") return "1px solid #e5e5e5";

    return "1px solid #1a1a1a";
  };

  return (
    <button
      className="flex-1 p-3 rounded-[14px] transition-all cursor-pointer"
      type="button"
      onClick={on_select}
    >
      <div className="relative w-full aspect-[4/3] rounded-lg mb-3">
        <div
          className="w-full h-full rounded-lg overflow-hidden"
          style={{ border: get_border_color() }}
        >
          {get_mockup()}
        </div>
        <SelectionMark selected={is_selected} />
      </div>
      <div className="flex items-center justify-center">
        <span className="text-sm font-medium text-txt-primary">{label}</span>
      </div>
    </button>
  );
}
