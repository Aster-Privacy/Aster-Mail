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
  PLACEHOLDER_PIXEL_DATA_URL,
  data_image_byte_length,
  image_dimensions,
  is_placeholder_pixel,
  is_placeholder_pixel_src,
} from "./placeholder_pixel";

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG_2X2 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8DwnwEJMCJLAgA1BgP9qZtCBgAAAABJRU5ErkJggg==";

function bytes_of(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
}

describe("placeholder pixel detection", () => {
  it("flags the transparent 1x1 gif placeholder", () => {
    expect(is_placeholder_pixel_src(PLACEHOLDER_PIXEL_DATA_URL)).toBe(true);
    expect(
      is_placeholder_pixel(bytes_of(PLACEHOLDER_PIXEL_DATA_URL.split(",")[1])),
    ).toBe(true);
  });

  it("flags a 1x1 png and not a 2x2 png", () => {
    expect(is_placeholder_pixel_src(`data:image/png;base64,${PNG_1X1}`)).toBe(
      true,
    );
    expect(is_placeholder_pixel_src(`data:image/png;base64,${PNG_2X2}`)).toBe(
      false,
    );
    expect(image_dimensions(bytes_of(PNG_2X2))).toEqual({
      width: 2,
      height: 2,
    });
  });

  it("ignores sources that are not base64 image data", () => {
    expect(is_placeholder_pixel_src("https://example.com/a.gif")).toBe(false);
    expect(is_placeholder_pixel_src("data:text/html;base64,PGI+")).toBe(false);
  });

  it("measures the decoded size of a data image", () => {
    expect(data_image_byte_length(PLACEHOLDER_PIXEL_DATA_URL)).toBe(37);
    expect(data_image_byte_length("https://example.com/a.png")).toBeNull();
  });
});
