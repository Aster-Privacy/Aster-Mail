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
import { describe, it, expect, afterEach, vi } from "vitest";

import {
  compute_dated_icon_layout,
  dated_icon_box,
  estimate_label_metrics,
  fit_dated_label,
  type LabelMetrics,
} from "./dated_calendar_icon";

function scaled_measurer(per_px: LabelMetrics) {
  return (label: string, font: string): LabelMetrics => {
    const size = Number(/(\d+)px/.exec(font)?.[1] ?? "0");

    return {
      left: per_px.left * size * label.length,
      right: per_px.right * size * label.length,
      ascent: per_px.ascent * size,
      descent: per_px.descent * size,
    };
  };
}

describe("dated calendar icon layout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shrinks the label until it fits the panel and centers its ink", () => {
    const measure = scaled_measurer({
      left: 0.25,
      right: 0.25,
      ascent: 0.7,
      descent: 0,
    });
    const layout = fit_dated_label(
      "24",
      { left: 10, top: 20, width: 100, height: 80 },
      0.62,
      "sans-serif",
      measure,
    );

    expect(layout).toEqual({ label: "24", font_px: 70, x: 60, y: 85 });
  });

  it("keeps the app icon geometry of the original artwork", () => {
    const layout = compute_dated_icon_layout("app", 7, () => null);

    expect(dated_icon_box("app")).toMatchObject({ width: 132, height: 132 });
    expect(layout.erase).toEqual([55, 60, 63, 54]);
    expect(layout.label).toBe("7");
    expect(layout.x).toBeGreaterThan(45);
    expect(layout.x).toBeLessThan(132);
    expect(layout.y).toBeGreaterThan(48);
    expect(layout.y).toBeLessThanOrEqual(127);
  });

  it("scales the rail icon to its output height without an erase box", () => {
    const layout = compute_dated_icon_layout("rail", 31, () => null);

    expect(layout).toMatchObject({ width: 72, height: 72, erase: null });
    expect(layout.font_px).toBeGreaterThan(6);
  });

  it("estimates metrics when text measurement is unavailable", () => {
    const metrics = estimate_label_metrics("12", 20);

    expect(metrics.left).toBeCloseTo(metrics.right);
    expect(metrics.left + metrics.right).toBeGreaterThan(0);
    expect(metrics.ascent).toBeGreaterThan(0);
  });

  it("ignores empty text metrics from a restricted canvas", async () => {
    vi.resetModules();
    const fresh = await import("./dated_calendar_icon");

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      font: "",
      fontKerning: "auto",
      measureText: () => ({
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: 0,
        actualBoundingBoxAscent: 0,
        actualBoundingBoxDescent: 0,
      }),
    } as unknown as CanvasRenderingContext2D);

    expect(
      fresh.measure_label_with_canvas("5", "560 20px sans-serif"),
    ).toBeNull();
  });

  it("measures the label around its center like the drawn text", async () => {
    vi.resetModules();
    const fresh = await import("./dated_calendar_icon");
    const context = {
      font: "",
      fontKerning: "auto",
      textAlign: "start",
      textBaseline: "top",
      measureText: () =>
        context.textAlign === "center"
          ? {
              actualBoundingBoxLeft: 6,
              actualBoundingBoxRight: 6,
              actualBoundingBoxAscent: 14,
              actualBoundingBoxDescent: 0,
            }
          : {
              actualBoundingBoxLeft: 0,
              actualBoundingBoxRight: 12,
              actualBoundingBoxAscent: 14,
              actualBoundingBoxDescent: 0,
            },
    };

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );

    expect(
      fresh.measure_label_with_canvas("24", "560 20px sans-serif"),
    ).toEqual({
      left: 6,
      right: 6,
      ascent: 14,
      descent: 0,
    });
    expect(context.textBaseline).toBe("alphabetic");
  });
});
