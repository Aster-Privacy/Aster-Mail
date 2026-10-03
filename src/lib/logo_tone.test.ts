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
import { describe, it, expect } from "vitest";

import { classify_logo_pixels } from "./logo_tone";

type Rgba = [number, number, number, number];

const SIZE = 16;
const CLEAR: Rgba = [0, 0, 0, 0];
const BLACK: Rgba = [17, 17, 17, 255];
const WHITE: Rgba = [245, 245, 245, 255];
const ORANGE: Rgba = [228, 87, 46, 255];
const MID_GREY: Rgba = [140, 140, 140, 255];

function image(paint: (x: number, y: number) => Rgba): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      data.set(paint(x, y), (y * SIZE + x) * 4);
    }
  }

  return data;
}

function centered_mark(ink: Rgba): Uint8ClampedArray {
  return image((x, y) => (x >= 4 && x < 12 && y >= 4 && y < 12 ? ink : CLEAR));
}

describe("classify_logo_pixels", () => {
  it("calls a dark mark on a transparent background dark", () => {
    expect(classify_logo_pixels(centered_mark(BLACK))).toBe("dark");
  });

  it("calls a light mark on a transparent background light", () => {
    expect(classify_logo_pixels(centered_mark(WHITE))).toBe("light");
  });

  it("leaves full-bleed opaque icons alone, whatever their colour", () => {
    expect(classify_logo_pixels(image(() => ORANGE))).toBe("none");
    expect(classify_logo_pixels(image(() => BLACK))).toBe("none");
    expect(classify_logo_pixels(image(() => WHITE))).toBe("none");
  });

  it("leaves a mark with both dark and light parts alone", () => {
    const mixed = image((x, y) => {
      if (y < 4 || y >= 12) return CLEAR;

      return x < 8 ? BLACK : WHITE;
    });

    expect(classify_logo_pixels(mixed)).toBe("none");
  });

  it("leaves a mid-tone mark alone because it reads on both themes", () => {
    expect(classify_logo_pixels(centered_mark(MID_GREY))).toBe("none");
    expect(classify_logo_pixels(centered_mark(ORANGE))).toBe("none");
  });

  it("weights pixels by their alpha", () => {
    const faint_white_halo = image((x, y) => {
      if (x >= 5 && x < 11 && y >= 5 && y < 11) return BLACK;
      if (x >= 3 && x < 13 && y >= 3 && y < 13) return [255, 255, 255, 20];

      return CLEAR;
    });

    expect(classify_logo_pixels(faint_white_halo)).toBe("dark");
  });

  it("returns none for a fully transparent or empty image", () => {
    expect(classify_logo_pixels(image(() => CLEAR))).toBe("none");
    expect(classify_logo_pixels(new Uint8ClampedArray(0))).toBe("none");
  });
});
