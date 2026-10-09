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

import { square_crop, square_output_size } from "./square_avatar_image";

describe("square_crop", () => {
  it("centers a square on a portrait image", () => {
    expect(square_crop(1080, 2340)).toEqual({ x: 0, y: 630, side: 1080 });
  });

  it("centers a square on a landscape image", () => {
    expect(square_crop(4000, 3000)).toEqual({ x: 500, y: 0, side: 3000 });
  });

  it("keeps a square image whole", () => {
    expect(square_crop(800, 800)).toEqual({ x: 0, y: 0, side: 800 });
  });
});

describe("square_output_size", () => {
  it("caps large sources at the requested size", () => {
    expect(square_output_size(1080, 512)).toBe(512);
  });

  it("never upscales a small source", () => {
    expect(square_output_size(200, 512)).toBe(200);
  });

  it("never returns zero", () => {
    expect(square_output_size(0, 512)).toBe(1);
  });
});
