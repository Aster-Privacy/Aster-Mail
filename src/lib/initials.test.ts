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

import { get_initials } from "./initials";

describe("get_initials", () => {
  it("takes first and last initial of a multi-word name", () => {
    expect(get_initials("Ada Lovelace", undefined, "en")).toBe("AL");
  });

  it("uses three-word names by first and last word", () => {
    expect(get_initials("John Fitzgerald Kennedy", undefined, "en")).toBe("JK");
  });

  it("collapses extra whitespace", () => {
    expect(get_initials("  John   Smith  ", undefined, "en")).toBe("JS");
  });

  it("returns a single initial for a single-word name", () => {
    expect(get_initials("Madonna", undefined, "en")).toBe("M");
  });

  it("falls back to the email local part when no name", () => {
    expect(get_initials("", "alice@example.com", "en")).toBe("A");
    expect(get_initials(undefined, "bob@aster.cx", "en")).toBe("B");
  });

  it("returns ? when nothing is usable", () => {
    expect(get_initials("", "", "en")).toBe("?");
    expect(get_initials(undefined, undefined, "en")).toBe("?");
  });

  it("keeps CJK characters intact", () => {
    expect(get_initials("李雷", undefined, "zh-CN")).toBe("李");
    expect(get_initials("李 雷", undefined, "zh-CN")).toBe("李雷");
  });

  it("treats an emoji as a single grapheme, not a broken half", () => {
    expect(get_initials("🎉", undefined, "en")).toBe("🎉");
    expect(get_initials("🎉 Party", undefined, "en")).toBe("🎉P");
  });

  it("handles astral-plane letters without splitting surrogate pairs", () => {
    expect(get_initials("𝓐lice", undefined, "en")).toBe("𝓐");
  });

  it("uppercases per locale (Turkish dotted I)", () => {
    expect(get_initials("ibrahim", undefined, "tr")).toBe("İ");
    expect(get_initials("ibrahim", undefined, "en")).toBe("I");
  });
});
