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
  get_popup_dimensions,
  get_centered_popup_position,
  clamp_popup_position,
  get_resized_popup_position,
} from "./popup_viewer_layout";
import { POPUP_MARGIN, FULLSCREEN_MARGIN } from "./popup_viewer_types";

const short_laptop = { width: 1356, height: 667 };
const large_monitor = { width: 2560, height: 1400 };

describe("get_popup_dimensions", () => {
  it("keeps the default size on a viewport that fits it", () => {
    expect(get_popup_dimensions("default", large_monitor)).toEqual({
      width: 680,
      height: 720,
    });
  });

  it("grows the expanded window in both directions", () => {
    const base = get_popup_dimensions("default", large_monitor);
    const expanded = get_popup_dimensions("expanded", large_monitor);

    expect(expanded.width).toBeGreaterThan(base.width);
    expect(expanded.height).toBeGreaterThan(base.height);
    expect(expanded).toEqual({ width: 1280, height: 1260 });
  });

  it("scales the expanded window with a laptop viewport", () => {
    const expanded = get_popup_dimensions("expanded", {
      width: 1440,
      height: 900,
    });

    expect(expanded.width).toBe(Math.round(1440 * 0.7));
    expect(expanded.height).toBe(860);
  });

  it("never makes the expanded window narrower than the default one", () => {
    const expanded = get_popup_dimensions("expanded", {
      width: 900,
      height: 900,
    });

    expect(expanded.width).toBe(680);
  });

  it("caps the expanded width on a narrow viewport", () => {
    const expanded = get_popup_dimensions("expanded", {
      width: 600,
      height: 900,
    });

    expect(expanded.width).toBe(600 - POPUP_MARGIN * 2);
  });

  it("caps the height so the window fits a short viewport", () => {
    const dims = get_popup_dimensions("default", short_laptop);

    expect(dims.height).toBe(short_laptop.height - POPUP_MARGIN * 2);
    expect(dims.width).toBe(680);
  });

  it("caps the expanded height to the viewport too", () => {
    const dims = get_popup_dimensions("expanded", short_laptop);

    expect(dims.height).toBeLessThanOrEqual(
      short_laptop.height - POPUP_MARGIN * 2,
    );
  });

  it("caps the width on a narrow viewport", () => {
    const dims = get_popup_dimensions("default", { width: 600, height: 900 });

    expect(dims.width).toBe(600 - POPUP_MARGIN * 2);
  });

  it("fills the viewport minus the margin in fullscreen", () => {
    expect(get_popup_dimensions("fullscreen", short_laptop)).toEqual({
      width: short_laptop.width - FULLSCREEN_MARGIN * 2,
      height: short_laptop.height - FULLSCREEN_MARGIN * 2,
    });
  });

  it("never returns a negative size", () => {
    const dims = get_popup_dimensions("fullscreen", { width: 100, height: 90 });

    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
  });
});

describe("get_centered_popup_position", () => {
  it("centers the window in the viewport", () => {
    const dims = get_popup_dimensions("default", large_monitor);

    expect(get_centered_popup_position(dims, large_monitor)).toEqual({
      x: (2560 - 680) / 2,
      y: (1400 - 720) / 2,
    });
  });

  it("keeps the whole window visible on a short viewport", () => {
    const dims = get_popup_dimensions("default", short_laptop);
    const pos = get_centered_popup_position(dims, short_laptop);

    expect(pos.y).toBeGreaterThanOrEqual(POPUP_MARGIN);
    expect(pos.y + dims.height).toBeLessThanOrEqual(
      short_laptop.height - POPUP_MARGIN,
    );
    expect(pos.x).toBeGreaterThanOrEqual(POPUP_MARGIN);
    expect(pos.x + dims.width).toBeLessThanOrEqual(
      short_laptop.width - POPUP_MARGIN,
    );
  });
});

describe("clamp_popup_position", () => {
  const dims = { width: 680, height: 600 };

  it("leaves a position inside the viewport alone", () => {
    expect(clamp_popup_position({ x: 200, y: 30 }, dims, short_laptop)).toEqual(
      { x: 200, y: 30 },
    );
  });

  it("pulls a window dragged past the bottom right back on screen", () => {
    const pos = clamp_popup_position({ x: 5000, y: 5000 }, dims, short_laptop);

    expect(pos).toEqual({
      x: short_laptop.width - dims.width - POPUP_MARGIN,
      y: short_laptop.height - dims.height - POPUP_MARGIN,
    });
  });

  it("never lets the header leave the top or left edge", () => {
    expect(
      clamp_popup_position({ x: -400, y: -300 }, dims, short_laptop),
    ).toEqual({ x: POPUP_MARGIN, y: POPUP_MARGIN });
  });

  it("keeps the header visible when the window is taller than the viewport", () => {
    const tall = { width: 680, height: 900 };
    const pos = clamp_popup_position({ x: 100, y: 400 }, tall, short_laptop);

    expect(pos.y).toBeGreaterThanOrEqual(0);
  });
});

describe("get_resized_popup_position", () => {
  it("keeps the window centered on the same point when it grows", () => {
    const from = get_popup_dimensions("default", large_monitor);
    const to = get_popup_dimensions("expanded", large_monitor);
    const start = get_centered_popup_position(from, large_monitor);
    const next = get_resized_popup_position(start, from, to, large_monitor);

    expect(next.x + to.width / 2).toBe(start.x + from.width / 2);
    expect(next.y).toBeGreaterThanOrEqual(POPUP_MARGIN);
  });

  it("keeps a grown window fully on screen near an edge", () => {
    const from = get_popup_dimensions("default", short_laptop);
    const to = get_popup_dimensions("expanded", short_laptop);
    const next = get_resized_popup_position(
      { x: short_laptop.width - from.width - POPUP_MARGIN, y: POPUP_MARGIN },
      from,
      to,
      short_laptop,
    );

    expect(next.x).toBeGreaterThanOrEqual(POPUP_MARGIN);
    expect(next.x + to.width).toBeLessThanOrEqual(
      short_laptop.width - POPUP_MARGIN,
    );
    expect(next.y + to.height).toBeLessThanOrEqual(
      short_laptop.height - POPUP_MARGIN,
    );
  });
});
