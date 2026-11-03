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

import {
  analyze_logo_pixels,
  classify_logo_pixels,
  measure_logo_tile,
} from "./logo_tone";

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

function disc(ink: Rgba, radius: number): Uint8ClampedArray {
  return image((x, y) => {
    const dx = x + 0.5 - SIZE / 2;
    const dy = y + 0.5 - SIZE / 2;

    return dx * dx + dy * dy <= radius * radius ? ink : CLEAR;
  });
}

function glyph(ink: Rgba): Uint8ClampedArray {
  return image((x, y) => {
    if (y < 3 || y >= 13) return CLEAR;

    return x === 3 || x === 4 || x === 11 || x === 12 || x === y ? ink : CLEAR;
  });
}

describe("measure_logo_tile", () => {
  it("gives an edge-to-edge opaque icon no extra fill", () => {
    expect(
      measure_logo_tile(
        image(() => ORANGE),
        SIZE,
        SIZE,
      ),
    ).toBe(100);
  });

  it("scales a centered tile with a transparent margin up to the edge without cropping it", () => {
    const tile = image((x, y) =>
      x >= 1 && x < 15 && y >= 1 && y < 15 ? ORANGE : CLEAR,
    );

    expect(measure_logo_tile(tile, SIZE, SIZE)).toBe(110);
    expect(measure_logo_tile(centered_mark(ORANGE), SIZE, SIZE)).toBe(150);
  });

  it("treats a round logo as a tile", () => {
    expect(measure_logo_tile(disc(ORANGE, 8), SIZE, SIZE)).toBe(100);
    expect(measure_logo_tile(disc(ORANGE, 7), SIZE, SIZE)).toBe(110);
  });

  it("does not treat a thin glyph as a tile", () => {
    expect(measure_logo_tile(glyph(BLACK), SIZE, SIZE)).toBeNull();
  });

  it("does not treat an off-center block as a tile", () => {
    const corner = image((x, y) => (x < 8 && y < 8 ? ORANGE : CLEAR));

    expect(measure_logo_tile(corner, SIZE, SIZE)).toBeNull();
  });

  it("does not treat a wide wordmark as a tile", () => {
    const bar = image((_x, y) => (y >= 6 && y < 10 ? BLACK : CLEAR));

    expect(measure_logo_tile(bar, SIZE, SIZE)).toBeNull();
  });

  it("returns null for an empty or truncated image", () => {
    expect(
      measure_logo_tile(
        image(() => CLEAR),
        SIZE,
        SIZE,
      ),
    ).toBeNull();
    expect(measure_logo_tile(new Uint8ClampedArray(0), SIZE, SIZE)).toBeNull();
    expect(measure_logo_tile(new Uint8ClampedArray(4), 0, 0)).toBeNull();
  });
});

describe("analyze_logo_pixels", () => {
  it("gives an opaque tile no backdrop tone, even when it is dark or light", () => {
    expect(analyze_logo_pixels(disc(BLACK, 7), SIZE, SIZE)).toEqual({
      tone: "none",
      fill: 110,
    });
    expect(analyze_logo_pixels(disc(WHITE, 8), SIZE, SIZE)).toEqual({
      tone: "none",
      fill: 100,
    });
  });

  it("keeps the backdrop tone for a transparent glyph", () => {
    expect(analyze_logo_pixels(glyph(BLACK), SIZE, SIZE)).toEqual({
      tone: "dark",
      fill: 100,
    });
    expect(analyze_logo_pixels(glyph(WHITE), SIZE, SIZE)).toEqual({
      tone: "light",
      fill: 100,
    });
  });

  it("leaves an edge-to-edge icon alone", () => {
    expect(
      analyze_logo_pixels(
        image(() => BLACK),
        SIZE,
        SIZE,
      ),
    ).toEqual({
      tone: "none",
      fill: 100,
    });
  });
});
