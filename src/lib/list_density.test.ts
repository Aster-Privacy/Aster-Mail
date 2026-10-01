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
  list_select_menu_offset_class,
  list_select_slot_class,
} from "./list_density";

const CHECKBOX_PX = 18;

function width_px(slot_class: string): number {
  const width = slot_class.split(" ").find((part) => part.startsWith("w-"));
  const arbitrary = width?.match(/^w-\[(\d+)px\]$/);

  if (arbitrary) return Number(arbitrary[1]);

  return Number(width?.slice(2)) * 4;
}

function margin_px(offset_class: string): number {
  const match = offset_class.match(/^(-?)ms-(?:\[(\d+)px\]|(px)|(\d+))$/);

  if (!match) throw new Error(`unexpected class ${offset_class}`);

  const [, negative, arbitrary, pixel, scale] = match;
  const size = arbitrary ? Number(arbitrary) : pixel ? 1 : Number(scale) * 4;

  return negative ? -size : size;
}

describe("list_select_menu_offset_class", () => {
  it.each([
    [false, true],
    [true, true],
    [false, false],
    [true, false],
  ])(
    "keeps the menu arrow 4px from the checkbox (compact %s, pictures %s)",
    (compact, show_profile_pictures) => {
      const slot = width_px(
        list_select_slot_class(compact, show_profile_pictures),
      );
      const offset = margin_px(
        list_select_menu_offset_class(compact, show_profile_pictures),
      );

      expect((slot - CHECKBOX_PX) / 2 + offset).toBe(4);
    },
  );
});
