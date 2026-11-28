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
  ComposeMockupDefault,
  ComposeMockupFullscreen,
  ComposeMockupMinimized,
} from "@/components/settings/appearance/compose_mode_mockups";

interface ComposeModeCardProps {
  mode: "default" | "fullscreen" | "minimized";
  label: string;
  is_selected: boolean;
  on_select: () => void;
}

export function ComposeModeCard({
  mode,
  label,
  is_selected,
  on_select,
}: ComposeModeCardProps) {
  return (
    <PreviewOption
      is_selected={is_selected}
      label={label}
      on_select={on_select}
    >
      {mode === "default" && <ComposeMockupDefault />}
      {mode === "fullscreen" && <ComposeMockupFullscreen />}
      {mode === "minimized" && <ComposeMockupMinimized />}
    </PreviewOption>
  );
}
