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
import { describe, expect, it } from "vitest";

import {
  LIST_SELECT_CHECKBOX_PX,
  LIST_SELECT_CONTROL_PAD_PX,
  list_select_control_layout,
  list_select_slot_class,
} from "./list_density";

function width_px(slot_class: string): number {
  const width = slot_class.split(" ").find((part) => part.startsWith("w-"));
  const arbitrary = width?.match(/^w-\[(\d+)px\]$/);

  if (arbitrary) return Number(arbitrary[1]);

  return Number(width?.slice(2)) * 4;
}

const CASES = [
  [false, true],
  [true, true],
  [false, false],
  [true, false],
] as const;

describe("list_select_control_layout", () => {
  it.each(CASES)(
    "keeps the slot as wide as the rows below (compact %s, pictures %s)",
    (compact, show_profile_pictures) => {
      expect(
        list_select_control_layout(compact, show_profile_pictures).slot_px,
      ).toBe(width_px(list_select_slot_class(compact, show_profile_pictures)));
    },
  );

  it.each(CASES)(
    "pads the checkbox evenly inside the hover pill (compact %s, pictures %s)",
    (compact, show_profile_pictures) => {
      const { slot_px, inset_px } = list_select_control_layout(
        compact,
        show_profile_pictures,
      );

      expect(inset_px + (slot_px - LIST_SELECT_CHECKBOX_PX) / 2).toBe(
        LIST_SELECT_CONTROL_PAD_PX,
      );
      expect(inset_px).toBeGreaterThanOrEqual(0);
      expect(inset_px).toBeLessThanOrEqual(12);
    },
  );

  it.each(CASES)(
    "starts the menu arrow at the checkbox edge (compact %s, pictures %s)",
    (compact, show_profile_pictures) => {
      const { slot_px, menu_offset_px } = list_select_control_layout(
        compact,
        show_profile_pictures,
      );

      expect((slot_px - LIST_SELECT_CHECKBOX_PX) / 2 + menu_offset_px).toBe(0);
    },
  );
});
