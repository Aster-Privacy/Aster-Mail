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

import { looks_format_flowed, unflow_format_flowed } from "./format_flowed";

describe("unflow_format_flowed", () => {
  it("joins soft-wrapped lines into one paragraph", () => {
    const input =
      "This is a long paragraph that was \nsoft wrapped at the sending client.";

    expect(unflow_format_flowed(input)).toBe(
      "This is a long paragraph that was soft wrapped at the sending client.",
    );
  });

  it("keeps hard breaks between fixed lines", () => {
    const input = "line one\nline two\nline three";

    expect(unflow_format_flowed(input)).toBe("line one\nline two\nline three");
  });

  it("preserves paragraph breaks (blank lines)", () => {
    const input = "first para soft \nwrapped\n\nsecond para";

    expect(unflow_format_flowed(input)).toBe(
      "first para soft wrapped\n\nsecond para",
    );
  });

  it("removes the trailing space when delsp is enabled", () => {
    const input = "hyphenated word bro \nken across a line";

    expect(unflow_format_flowed(input, { delsp: true })).toBe(
      "hyphenated word broken across a line",
    );
  });

  it("keeps the space when delsp is disabled", () => {
    const input = "word one \nword two";

    expect(unflow_format_flowed(input)).toBe("word one word two");
  });

  it("removes space-stuffing from lines", () => {
    const input = " From the top\n >quoted looking line\n normal";

    expect(unflow_format_flowed(input)).toBe(
      "From the top\n>quoted looking line\nnormal",
    );
  });

  it("treats the signature separator as a hard break", () => {
    const input = "body text\n-- \nSignature line";

    expect(unflow_format_flowed(input)).toBe("body text\n-- \nSignature line");
  });

  it("reflows quoted lines within the same quote depth", () => {
    const input = "> quoted soft \n> wrapped reply";

    expect(unflow_format_flowed(input)).toBe("> quoted soft wrapped reply");
  });

  it("does not merge across differing quote depths", () => {
    const input = "> outer soft \n>> inner reply";

    expect(unflow_format_flowed(input)).toBe("> outer soft \n>> inner reply");
  });

  it("returns empty string for empty input", () => {
    expect(unflow_format_flowed("")).toBe("");
  });
});

describe("looks_format_flowed", () => {
  it("detects a soft-wrapped body", () => {
    expect(looks_format_flowed("wrapped line here \ncontinuation")).toBe(true);
  });

  it("ignores a message whose only trailing space is the signature marker", () => {
    expect(looks_format_flowed("body\n-- \nSignature")).toBe(false);
  });

  it("returns false for ordinary hard-wrapped text", () => {
    expect(looks_format_flowed("line one\nline two\nline three")).toBe(false);
  });

  it("returns false when a trailing-space line has no continuation", () => {
    expect(looks_format_flowed("trailing space here \n")).toBe(false);
  });
});
