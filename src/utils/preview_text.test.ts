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
  build_body_preview,
  build_list_preview,
  extract_preheader_text,
  strip_preview_filler,
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
    expect(truncate_with_ellipsis(`ab ${"c".repeat(40)}`, 20)).toBe(
      `ab ${"c".repeat(17)}${ELLIPSIS}`,
    );
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

describe("strip_preview_filler", () => {
  it("removes zero-width and padding filler characters", () => {
    expect(
      strip_preview_filler(
        "Get 30% off\u200c\u200b\u200d\u2060\ufeff\u034f\u00ad\u00a0 today",
      ),
    ).toBe("Get 30% off today");
  });

  it("removes object replacement characters left by inline images", () => {
    expect(strip_preview_filler("￼￼ Your Apple Account")).toBe(
      "Your Apple Account",
    );
  });

  it("removes interlinear annotation markers", () => {
    expect(strip_preview_filler("a￹b￺c￻d")).toBe("abcd");
  });
});

describe("truncate_with_ellipsis", () => {
  it("does not split an astral character at the cap", () => {
    const value = `${"a".repeat(9)}\u{1f600}tail`;

    expect(truncate_with_ellipsis(value, 10)).toBe(`${"a".repeat(9)}${ELLIPSIS}`);
  });
});

describe("extract_preheader_text", () => {
  it("reads a display:none preheader", () => {
    const html =
      '<body><div style="display:none">Get 30% off your next 3 meals.</div><table><tr><td>Visible header</td></tr></table></body>';

    expect(extract_preheader_text(html)).toBe("Get 30% off your next 3 meals.");
  });

  it("reads a max-height:0 preheader", () => {
    const html =
      '<body><span style="max-height:0px;overflow:hidden;mso-hide:all">Your order shipped today.</span><p>Hello there</p></body>';

    expect(extract_preheader_text(html)).toBe("Your order shipped today.");
  });

  it("reads a font-size:0 preheader", () => {
    const html =
      '<body><div style="font-size:0;line-height:0;color:#ffffff">Two seats left for the workshop.</div><h1>Workshop</h1></body>';

    expect(extract_preheader_text(html)).toBe(
      "Two seats left for the workshop.",
    );
  });

  it("descends through empty wrappers to reach the preheader", () => {
    const html =
      '<body><div><div></div><div style="opacity:0">Weekend deals inside.</div><p>Shop now</p></div></body>';

    expect(extract_preheader_text(html)).toBe("Weekend deals inside.");
  });

  it("drops zwnj padding that follows the preheader", () => {
    const padding = "\u200c\u00a0".repeat(60);
    const html = `<body><div style="display:none">Free shipping this week.${padding}</div><p>Body</p></body>`;

    expect(extract_preheader_text(html)).toBe("Free shipping this week.");
  });

  it("ignores a hidden block that holds only filler", () => {
    const html = `<body><div style="display:none">${"\u200c".repeat(40)}</div><p>Body</p></body>`;

    expect(extract_preheader_text(html)).toBe("");
  });

  it("returns nothing when the first content is visible", () => {
    const html = "<body><p>Hi Sam, here are the notes from today.</p></body>";

    expect(extract_preheader_text(html)).toBe("");
  });

  it("returns nothing for plain text", () => {
    expect(extract_preheader_text("just a normal message")).toBe("");
  });
});

describe("build_body_preview", () => {
  it("prefers the preheader over the visible body", () => {
    const html =
      '<body><div style="display:none">Get 30% off your next 3 meals.</div><h1>Weekly menu</h1><p>Pick your meals</p></body>';

    expect(build_body_preview("Weekly menu Pick your meals", html)).toBe(
      "Get 30% off your next 3 meals.",
    );
  });

  it("falls back to visible html text when there is no preheader", () => {
    const html = "<body><h1>Weekly menu</h1><p>Pick your meals</p></body>";

    expect(build_body_preview("", html)).toBe("Weekly menu Pick your meals");
  });

  it("keeps plain text bodies unchanged", () => {
    expect(build_body_preview("Lunch at one?", "")).toBe("Lunch at one?");
  });

  it("strips filler characters from a plain text body", () => {
    expect(build_body_preview("Lunch\u200b\u00a0at one?", "")).toBe(
      "Lunch at one?",
    );
  });
});
