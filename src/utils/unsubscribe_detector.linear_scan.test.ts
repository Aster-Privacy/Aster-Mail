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

import { detect_unsubscribe_info } from "@/utils/unsubscribe_detector";

const LINK = (href: string, text = "x") => `<a href="${href}">${text}</a>`;

function body_link(html: string, text = "") {
  return detect_unsubscribe_info(html, text).unsubscribe_link;
}

function time_ms(run: () => void) {
  const started = performance.now();

  run();

  return performance.now() - started;
}

describe("body unsubscribe scan stays linear", () => {
  const SIZE = 1_000_000;
  const hostile_bodies = [
    'href="' + "remove".repeat(SIZE / 6),
    'href="' + "manage".repeat(SIZE / 6),
    'href="' + "subscription".repeat(SIZE / 12),
    '<a href="x"' + " ".repeat(SIZE),
    "<a ".repeat(SIZE / 3),
    "<a href='https://a.example/'>" + "unsubscrib".repeat(SIZE / 10),
    'href="'.repeat(SIZE / 6),
  ];
  const hostile_texts = [
    "http://".repeat(SIZE / 7),
    "https://a".repeat(SIZE / 9),
  ];

  for (const [index, html] of hostile_bodies.entries()) {
    it(`scans hostile html body ${index} quickly`, () => {
      expect(time_ms(() => body_link(html))).toBeLessThan(1500);
    });
  }

  for (const [index, text] of hostile_texts.entries()) {
    it(`scans hostile text body ${index} quickly`, () => {
      expect(time_ms(() => body_link("", text))).toBeLessThan(1500);
    });
  }
});

describe("body unsubscribe scan keeps its matching rules", () => {
  it("prefers an unsubscribe href over earlier preference links", () => {
    const html =
      LINK("https://s.example/manage/preferences") +
      LINK("https://s.example/unsubscribe?u=1");

    expect(body_link(html)).toBe("https://s.example/unsubscribe?u=1");
  });

  it("matches split keywords only in order", () => {
    expect(body_link(LINK("https://s.example/list/remove"))).toBeUndefined();
    expect(body_link(LINK("https://s.example/remove?from=list"))).toBe(
      "https://s.example/remove?from=list",
    );
    expect(body_link(LINK("https://s.example/subscription/settings"))).toBe(
      "https://s.example/subscription/settings",
    );
  });

  it("matches hrefs case-insensitively and decodes entities", () => {
    expect(body_link(LINK("https://s.example/OptOut?a=1&amp;b=2"))).toBe(
      "https://s.example/OptOut?a=1&b=2",
    );
  });

  it("falls back to the anchor text", () => {
    const html =
      '<a class="f" href="https://s.example/l/abc">Opt out of these emails</a>';

    expect(body_link(html)).toBe("https://s.example/l/abc");
  });

  it("skips an anchor whose text is not about unsubscribing", () => {
    const html =
      LINK("https://s.example/a", "Read more") +
      LINK("https://s.example/b", "Unsubscribe");

    expect(body_link(html)).toBe("https://s.example/b");
  });

  it("ignores links that are not http", () => {
    expect(body_link(LINK("javascript:unsubscribe()"))).toBeUndefined();
  });

  it("finds a keyword link in plain text", () => {
    expect(
      body_link("", "Bye.\nhttps://s.example/r/unsubscribe/xyz\nThanks"),
    ).toBe("https://s.example/r/unsubscribe/xyz");
  });
});
