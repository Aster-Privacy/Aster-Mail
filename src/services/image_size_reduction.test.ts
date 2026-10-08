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
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  is_reducible_image,
  prepare_image_attachments,
  register_image_size_prompt,
  scaled_dimensions,
} from "./image_size_reduction";

function file_of(type: string, size: number, name = "photo"): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("image_size_reduction", () => {
  afterEach(() => register_image_size_prompt(null));

  it("scales the longest edge down and keeps small images as they are", () => {
    expect(scaled_dimensions(4032, 3024)).toEqual({
      width: 1920,
      height: 1440,
    });
    expect(scaled_dimensions(3024, 4032)).toEqual({
      width: 1440,
      height: 1920,
    });
    expect(scaled_dimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("only offers to reduce large photos", () => {
    expect(is_reducible_image(file_of("image/jpeg", 600 * 1024))).toBe(true);
    expect(is_reducible_image(file_of("image/jpeg", 10 * 1024))).toBe(false);
    expect(is_reducible_image(file_of("image/gif", 600 * 1024))).toBe(false);
    expect(is_reducible_image(file_of("application/pdf", 600 * 1024))).toBe(
      false,
    );
  });

  it("does not ask when nothing can be reduced", async () => {
    const requester = vi.fn();

    register_image_size_prompt(requester);
    const files = [file_of("application/pdf", 900 * 1024)];

    expect(await prepare_image_attachments(files)).toBe(files);
    expect(requester).not.toHaveBeenCalled();
  });

  it("returns null on cancel and the same files on keep original", async () => {
    const files = [file_of("image/jpeg", 900 * 1024)];

    register_image_size_prompt(() => Promise.resolve("cancel"));
    expect(await prepare_image_attachments(files)).toBeNull();

    register_image_size_prompt(() => Promise.resolve("original"));
    expect(await prepare_image_attachments(files)).toBe(files);
  });

  it("keeps the original file when the image cannot be decoded", async () => {
    const photo = file_of("image/jpeg", 900 * 1024);
    const pdf = file_of("application/pdf", 900 * 1024, "doc");

    register_image_size_prompt(() => Promise.resolve("reduce"));
    const result = await prepare_image_attachments([photo, pdf]);

    expect(result).toEqual([photo, pdf]);
  });
});
