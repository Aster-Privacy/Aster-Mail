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
  ELLIPSIS,
  PREVIEW_SOURCE_CHAR_CAP,
  build_list_preview,
  truncate_with_ellipsis,
} from "./preview_text";

describe("truncate_with_ellipsis", () => {
  it("returns an empty string for empty input", () => {
    expect(truncate_with_ellipsis("", 10)).toBe("");
  });

  it("collapses whitespace runs", () => {
    expect(truncate_with_ellipsis("  a \n\n b  ", 100)).toBe("a b");
  });

  it("leaves short text untouched and adds no ellipsis", () => {
    expect(truncate_with_ellipsis("short message", 100)).toBe("short message");
  });

  it("appends an ellipsis when it cuts", () => {
    const result = truncate_with_ellipsis("x".repeat(50), 10);

    expect(result.endsWith(ELLIPSIS)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(11);
  });

  it("cuts on a word boundary when one is close to the cap", () => {
    expect(truncate_with_ellipsis("alpha beta gamma delta", 17)).toBe(
      `alpha beta gamma${ELLIPSIS}`,
    );
  });

  it("cuts mid-word when the last space is too far back", () => {
    expect(
      truncate_with_ellipsis(`ab ${"c".repeat(40)}`, 20),
    ).toBe(`ab ${"c".repeat(17)}${ELLIPSIS}`);
  });

  it("returns an empty string for a non-positive cap", () => {
    expect(truncate_with_ellipsis("anything", 0)).toBe("");
  });
});

describe("build_list_preview", () => {
  it("never emits a bare cut without an ellipsis", () => {
    const long = "word ".repeat(400);
    const preview = build_list_preview(long);

    expect(preview.endsWith(ELLIPSIS)).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(PREVIEW_SOURCE_CHAR_CAP + 1);
  });

  it("carries more than the row cap so the row can truncate itself", () => {
    expect(PREVIEW_SOURCE_CHAR_CAP).toBeGreaterThan(400);
  });

  it("passes through preview text that fits", () => {
    expect(build_list_preview("a short preview")).toBe("a short preview");
  });
});
