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
import type { UserPreferences } from "@/services/api/preferences";

export type ReadingPanePosition = UserPreferences["reading_pane_position"];

export const READING_PANE_POSITIONS: readonly ReadingPanePosition[] = [
  "right",
  "bottom",
  "hidden",
];

export function reading_pane_patch(
  current: Pick<UserPreferences, "email_view_mode">,
  position: ReadingPanePosition,
): Partial<UserPreferences> {
  if (position !== "hidden" && current.email_view_mode !== "split") {
    return { reading_pane_position: position, email_view_mode: "split" };
  }

  return { reading_pane_position: position };
}

export function active_reading_pane(
  preferences: Pick<UserPreferences, "email_view_mode" | "reading_pane_position">,
): ReadingPanePosition {
  if (preferences.email_view_mode !== "split") return "hidden";

  return preferences.reading_pane_position;
}
