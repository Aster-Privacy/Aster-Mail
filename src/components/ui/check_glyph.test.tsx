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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { CHECK_GLYPH_PATH, CheckGlyph, DASH_GLYPH_PATH } from "./check_glyph";

const VIEW_BOX_CENTER = 8;
const STROKE_HALF = 1;

type Point = [number, number];

function check_points(): Point[] {
  const values = CHECK_GLYPH_PATH.replace("M", "")
    .trim()
    .split(/\s+/)
    .map(Number);
  const points: Point[] = [];

  for (let i = 0; i < values.length; i += 2) {
    points.push([values[i], values[i + 1]]);
  }

  return points;
}

function dash_points(): Point[] {
  const match = /^M([\d.]+) ([\d.]+)h([\d.]+)$/.exec(DASH_GLYPH_PATH);

  expect(match).not.toBeNull();
  const [x, y, length] = match!.slice(1).map(Number);

  return [
    [x, y],
    [x + length, y],
  ];
}

function stroke_box_center(points: Point[]): Point {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);

  return [
    (Math.min(...xs) - STROKE_HALF + Math.max(...xs) + STROKE_HALF) / 2,
    (Math.min(...ys) - STROKE_HALF + Math.max(...ys) + STROKE_HALF) / 2,
  ];
}

function ink_centroid(points: Point[]): Point {
  let total = 0;
  let sum_x = 0;
  let sum_y = 0;

  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const length = Math.hypot(bx - ax, by - ay);

    total += length;
    sum_x += (length * (ax + bx)) / 2;
    sum_y += (length * (ay + by)) / 2;
  }

  return [sum_x / total, sum_y / total];
}

function checkbox_css(): string {
  return readFileSync(
    resolve(__dirname, "../../styles/globals.css"),
    "utf8",
  ).replace(/\r\n/g, "\n");
}

function rule_body(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);

  expect(start).toBeGreaterThan(-1);

  return css.slice(start, css.indexOf("\n}", start));
}

function encoded(path: string): string {
  return `d='${path}'`;
}

describe("check glyph geometry", () => {
  it("centers the dash on the box to the pixel", () => {
    const points = dash_points();

    expect(stroke_box_center(points)).toEqual([
      VIEW_BOX_CENTER,
      VIEW_BOX_CENTER,
    ]);
    expect(points[0][1] - STROKE_HALF).toBe(
      Math.round(points[0][1] - STROKE_HALF),
    );
  });

  it("centers the check optically between its box and its ink", () => {
    const points = check_points();
    const [box_x, box_y] = stroke_box_center(points);
    const [ink_x, ink_y] = ink_centroid(points);

    expect(Math.abs((box_x + ink_x) / 2 - VIEW_BOX_CENTER)).toBeLessThan(0.1);
    expect(Math.abs((box_y + ink_y) / 2 - VIEW_BOX_CENTER)).toBeLessThan(0.1);
  });
});

describe("aster checkbox glyph styles", () => {
  it("draws the check and dash from the shared geometry", () => {
    const css = checkbox_css();
    const base = rule_body(css, ".aster_checkbox_box::after");
    const dash = rule_body(
      css,
      ".aster_checkbox_input:indeterminate + .aster_checkbox_box::after",
    );

    expect(base).toContain(encoded(CHECK_GLYPH_PATH));
    expect(dash).toContain(encoded(DASH_GLYPH_PATH));
  });

  it("pins the glyph to the center of the border box", () => {
    const base = rule_body(checkbox_css(), ".aster_checkbox_box::after");

    expect(base).toContain("top: 50%;");
    expect(base).toContain("left: 50%;");
    expect(base).toContain("width: 16px;");
    expect(base).toContain("height: 16px;");
    expect(base).toContain("margin: -8px 0 0 -8px;");
    expect(rule_body(checkbox_css(), ".aster_checkbox_check")).toContain(
      "display: none;",
    );
  });
});

describe("CheckGlyph", () => {
  it("renders a block svg on the shared viewBox", () => {
    const host = document.createElement("div");
    const root = createRoot(host);

    act(() => {
      root.render(<CheckGlyph className="w-4 h-4" />);
    });

    const svg = host.querySelector("svg");

    expect(svg?.getAttribute("viewBox")).toBe("0 0 16 16");
    expect(svg?.getAttribute("class")).toContain("block");
    expect(svg?.querySelector("path")?.getAttribute("d")).toBe(
      CHECK_GLYPH_PATH,
    );

    act(() => root.unmount());
  });
});
