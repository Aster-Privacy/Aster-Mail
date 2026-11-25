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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canvas_readback_trusted,
  reset_canvas_readback_check,
} from "./canvas_readback";

type PixelFilter = (pixels: Uint8ClampedArray) => void;

function fake_context(filter: PixelFilter) {
  const size = 32;
  const pixels = new Uint8ClampedArray(size * size * 4);
  let fill: [number, number, number] = [0, 0, 0];

  return {
    set fillStyle(value: string) {
      const match = value.match(/rgb\((\d+), (\d+), (\d+)\)/);

      if (match) fill = [Number(match[1]), Number(match[2]), Number(match[3])];
    },
    fillRect(x: number, y: number) {
      const offset = (y * size + x) * 4;

      pixels[offset] = fill[0];
      pixels[offset + 1] = fill[1];
      pixels[offset + 2] = fill[2];
      pixels[offset + 3] = 255;
    },
    getImageData() {
      const copy = new Uint8ClampedArray(pixels);

      filter(copy);

      return { data: copy };
    },
  };
}

function install_context(filter: PixelFilter | null) {
  return vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation((() =>
      filter ? fake_context(filter) : null) as never);
}

describe("canvas_readback_trusted", () => {
  beforeEach(() => reset_canvas_readback_check());

  afterEach(() => {
    vi.restoreAllMocks();
    reset_canvas_readback_check();
  });

  it("trusts a canvas that reads back what was drawn", () => {
    install_context(() => {});

    expect(canvas_readback_trusted()).toBe(true);
  });

  it("distrusts a canvas that returns random pixels", () => {
    install_context((pixels) => {
      for (let i = 0; i < pixels.length; i++) {
        pixels[i] = (i * 7919 + 13) % 256;
      }
    });

    expect(canvas_readback_trusted()).toBe(false);
  });

  it("distrusts a canvas that alters a single channel", () => {
    install_context((pixels) => {
      pixels[42] = pixels[42] ^ 1;
    });

    expect(canvas_readback_trusted()).toBe(false);
  });

  it("distrusts a canvas that returns a blank image", () => {
    install_context((pixels) => pixels.fill(255));

    expect(canvas_readback_trusted()).toBe(false);
  });

  it("distrusts a browser without a 2d context", () => {
    install_context(null);

    expect(canvas_readback_trusted()).toBe(false);
  });

  it("caches the first answer", () => {
    const spy = install_context(() => {});

    canvas_readback_trusted();
    canvas_readback_trusted();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
