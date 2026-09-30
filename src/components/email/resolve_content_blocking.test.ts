//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, expect, it } from "vitest";

import { resolve_content_blocking } from "./resolve_content_blocking";

const ALL_BLOCKED = {
  block_remote_images: true,
  block_remote_fonts: true,
  block_remote_css: true,
  block_tracking_pixels: true,
};

describe("resolve_content_blocking", () => {
  it("keeps every category blocked by default", () => {
    expect(
      resolve_content_blocking({
        lockdown_active: false,
        load_remote_content: false,
        preferences: ALL_BLOCKED,
      }),
    ).toEqual(ALL_BLOCKED);
  });

  it("unblocks every category when the reader loads all external content", () => {
    expect(
      resolve_content_blocking({
        lockdown_active: false,
        load_remote_content: true,
        preferences: ALL_BLOCKED,
      }),
    ).toEqual({
      block_remote_images: false,
      block_remote_fonts: false,
      block_remote_css: false,
      block_tracking_pixels: false,
    });
  });

  it("unblocks only the categories the reader picked", () => {
    expect(
      resolve_content_blocking({
        lockdown_active: false,
        load_remote_content: false,
        loaded_content_types: new Set(["image"]),
        preferences: ALL_BLOCKED,
      }),
    ).toEqual({
      block_remote_images: false,
      block_remote_fonts: true,
      block_remote_css: true,
      block_tracking_pixels: true,
    });
  });

  it("blocks everything in lockdown mode even after the reader loads content", () => {
    expect(
      resolve_content_blocking({
        lockdown_active: true,
        load_remote_content: true,
        loaded_content_types: new Set(["image", "css", "font"]),
        preferences: {
          block_remote_images: false,
          block_remote_fonts: false,
          block_remote_css: false,
          block_tracking_pixels: false,
        },
      }),
    ).toEqual(ALL_BLOCKED);
  });
});
