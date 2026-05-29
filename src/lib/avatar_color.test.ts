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

import { get_avatar_color, get_contrast_text } from "./avatar_color";

import { PROFILE_COLORS } from "@/constants/profile";

describe("get_contrast_text", () => {
  it("returns white initials on every pickable profile color", () => {
    for (const color of PROFILE_COLORS) {
      expect(get_contrast_text(color)).toBe("#ffffff");
    }
  });

  it("returns dark text on a light background", () => {
    expect(get_contrast_text("#ffffff")).toBe("#111827");
    expect(get_contrast_text("#fff")).toBe("#111827");
    expect(get_contrast_text("#fde047")).toBe("#111827");
  });

  it("returns white text on a dark background", () => {
    expect(get_contrast_text("#000000")).toBe("#ffffff");
    expect(get_contrast_text("#1e3a5f")).toBe("#ffffff");
  });

  it("falls back to white for malformed input", () => {
    expect(get_contrast_text("")).toBe("#ffffff");
    expect(get_contrast_text("#zzzzzz")).toBe("#ffffff");
    expect(get_contrast_text("nonsense")).toBe("#ffffff");
  });
});

describe("get_avatar_color", () => {
  it("is deterministic for the same identifier", () => {
    expect(get_avatar_color("alice@example.com")).toBe(
      get_avatar_color("alice@example.com"),
    );
  });

  it("always returns a 6-digit hex color", () => {
    for (const id of ["a", "bob@aster.cx", "李雷", "🎉", ""]) {
      expect(get_avatar_color(id)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
