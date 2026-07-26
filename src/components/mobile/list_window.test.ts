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
  average_measured_height,
  compute_mobile_list_window,
  full_list_window,
  MOBILE_ROW_ESTIMATE_PX,
} from "@/components/mobile/list_window";

const uniform = { average_height: 100, overscan_px: 200 };

describe("compute_mobile_list_window", () => {
  it("returns an empty window for an empty list", () => {
    const result = compute_mobile_list_window({
      total: 0,
      scroll_top: 0,
      viewport_height: 800,
    });

    expect(result).toEqual({ start: 0, end: 0, top_pad: 0, bottom_pad: 0 });
  });

  it("keeps the total height stable regardless of scroll position", () => {
    const rendered_height = (scroll_top: number): number => {
      const w = compute_mobile_list_window({
        total: 1000,
        scroll_top,
        viewport_height: 800,
        ...uniform,
      });

      return w.top_pad + (w.end - w.start) * 100 + w.bottom_pad;
    };

    expect(rendered_height(0)).toBe(100_000);
    expect(rendered_height(5_000)).toBe(100_000);
    expect(rendered_height(99_000)).toBe(100_000);
  });

  it("covers the viewport plus the overscan band", () => {
    const result = compute_mobile_list_window({
      total: 1000,
      scroll_top: 5_000,
      viewport_height: 800,
      ...uniform,
    });

    expect(result.start).toBe(48);
    expect(result.top_pad).toBe(4_800);
    expect(result.end).toBe(60);
    expect(result.bottom_pad).toBe(94_000);
  });

  it("starts at the first row when scrolled to the top", () => {
    const result = compute_mobile_list_window({
      total: 1000,
      scroll_top: 0,
      viewport_height: 800,
      ...uniform,
    });

    expect(result.start).toBe(0);
    expect(result.top_pad).toBe(0);
    expect(result.end).toBe(10);
  });

  it("ends at the last row when scrolled to the bottom", () => {
    const result = compute_mobile_list_window({
      total: 100,
      scroll_top: 9_200,
      viewport_height: 800,
      ...uniform,
    });

    expect(result.end).toBe(100);
    expect(result.bottom_pad).toBe(0);
  });

  it("bounds the mounted row count no matter how long the list is", () => {
    for (const total of [1_000, 100_000, 1_000_000]) {
      const result = compute_mobile_list_window({
        total,
        scroll_top: Math.floor(total / 2) * 100,
        viewport_height: 800,
        ...uniform,
      });

      expect(result.end - result.start).toBeLessThanOrEqual(14);
    }
  });

  it("uses measured heights where it has them", () => {
    const measured = Array.from({ length: 20 }, (_, i) => (i < 10 ? 200 : 0));

    const result = compute_mobile_list_window({
      total: 20,
      scroll_top: 2_000,
      viewport_height: 400,
      overscan_px: 0,
      average_height: 100,
      measured,
    });

    expect(result.start).toBe(10);
    expect(result.top_pad).toBe(2_000);
  });

  it("always mounts at least one row", () => {
    const result = compute_mobile_list_window({
      total: 5,
      scroll_top: 0,
      viewport_height: 0,
      overscan_px: 0,
      average_height: 100,
    });

    expect(result.end).toBeGreaterThan(result.start);
  });

  it("clamps a scroll position past the end of the list", () => {
    const result = compute_mobile_list_window({
      total: 10,
      scroll_top: 100_000,
      viewport_height: 800,
      ...uniform,
    });

    expect(result.start).toBeLessThanOrEqual(10);
    expect(result.end).toBe(10);
    expect(result.bottom_pad).toBe(0);
  });

  it("falls back to the row estimate when the average is unusable", () => {
    const result = compute_mobile_list_window({
      total: 10,
      scroll_top: 0,
      viewport_height: 0,
      overscan_px: 0,
      average_height: 0,
    });

    expect(result.bottom_pad).toBe((10 - result.end) * MOBILE_ROW_ESTIMATE_PX);
  });
});

describe("average_measured_height", () => {
  it("ignores unmeasured rows", () => {
    expect(average_measured_height([0, 100, 0, 300])).toBe(200);
  });

  it("falls back when nothing is measured", () => {
    expect(average_measured_height([], 44)).toBe(44);
    expect(average_measured_height([0, 0], 44)).toBe(44);
  });
});

describe("full_list_window", () => {
  it("mounts everything with no padding", () => {
    expect(full_list_window(30)).toEqual({
      start: 0,
      end: 30,
      top_pad: 0,
      bottom_pad: 0,
    });
  });
});
