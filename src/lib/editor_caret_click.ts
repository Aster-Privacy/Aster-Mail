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
export interface EditorCaretClickInput {
  container: HTMLElement;
  editor: HTMLElement;
  press_target: EventTarget | null;
  click_target: EventTarget | null;
  selection: Selection | null;
}

export function should_place_caret_at_end({
  container,
  editor,
  press_target,
  click_target,
  selection,
}: EditorCaretClickInput): boolean {
  if (click_target !== container) return false;
  if (press_target !== container) return false;

  if (
    selection &&
    selection.rangeCount > 0 &&
    !selection.isCollapsed &&
    editor.contains(selection.anchorNode)
  ) {
    return false;
  }

  return true;
}
