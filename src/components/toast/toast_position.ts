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
  resolve_toast_layout,
  resolve_toast_position,
  type ResolvedToastPosition,
  type ToastPosition,
} from "@aster/ui";

import { use_preferences } from "@/contexts/preferences_context";

export {
  TOAST_POSITION_LAYOUT,
  DEFAULT_TOAST_POSITION,
  is_top_position,
  resolve_toast_position,
} from "@aster/ui";
export type { ToastPosition, ToastPositionLayout } from "@aster/ui";

export function use_toast_position(
  override?: ToastPosition,
  lift_above_island = false,
): ResolvedToastPosition {
  const { preferences } = use_preferences();
  const position =
    override ?? resolve_toast_position(preferences.toast_position);

  return resolve_toast_layout(position, lift_above_island);
}
