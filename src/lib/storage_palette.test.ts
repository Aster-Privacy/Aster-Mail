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

import {
  build_storage_palette,
  color_delta,
  contrast_of,
  cvd_delta,
  hex_to_oklch,
  MIN_CVD_DELTA,
  MIN_NORMAL_DELTA,
  MIN_SEGMENT_CONTRAST,
  MIN_SEGMENT_CONTRAST_HIGH,
  oklch_to_hex,
  STORAGE_PALETTE_SIZE,
} from "@/lib/storage_palette";

interface ThemeCase {
  name: string;
  accent: string;
  surface: string;
  is_dark: boolean;
}

const THEMES: ThemeCase[] = [
  {
    name: "default light",
    accent: "#3b82f6",
    surface: "#ffffff",
    is_dark: false,
  },
  {
    name: "default dark",
    accent: "#3b82f6",
    surface: "#121212",
    is_dark: true,
  },
  { name: "purple", accent: "#a855f7", surface: "#1b1526", is_dark: true },
  { name: "green", accent: "#22c55e", surface: "#10201a", is_dark: true },
  { name: "rose", accent: "#f43f5e", surface: "#241318", is_dark: true },
  { name: "orange", accent: "#f97316", surface: "#241a10", is_dark: true },
  { name: "teal", accent: "#14b88a", surface: "#0f2020", is_dark: true },
  { name: "indigo", accent: "#6366f1", surface: "#191a2e", is_dark: true },
  { name: "amber", accent: "#f5be0b", surface: "#201a0a", is_dark: true },
  { name: "cyan", accent: "#068fd4", surface: "#0a1e24", is_dark: true },
  { name: "slate", accent: "#64748b", surface: "#16181c", is_dark: true },
  { name: "aster-blue", accent: "#3b82f6", surface: "#0f1b2e", is_dark: true },
  { name: "lime", accent: "#84cc16", surface: "#191f0a", is_dark: true },
  { name: "fuchsia", accent: "#cd1fd6", surface: "#241123", is_dark: true },
  { name: "emerald", accent: "#31d926", surface: "#0a1f13", is_dark: true },
  { name: "pink", accent: "#e0399d", surface: "#24101c", is_dark: true },
  { name: "black", accent: "#f4f4f5", surface: "#0a0a0a", is_dark: true },
];

const ACCENT_CHOICES = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#6b7280",
  "#000000",
  "#ffffff",
];

function pair_metrics(palette: string[], surface: string) {
  let normal = Infinity;
  let cvd = Infinity;
  let contrast = Infinity;

  for (let i = 0; i < palette.length; i++) {
    contrast = Math.min(contrast, contrast_of(palette[i], surface));
    for (let j = i + 1; j < palette.length; j++) {
      normal = Math.min(normal, color_delta(palette[i], palette[j]));
      cvd = Math.min(cvd, cvd_delta(palette[i], palette[j]));
    }
  }

  return { normal, cvd, contrast };
}

describe("build_storage_palette", () => {
  for (const theme of THEMES) {
    for (const high_contrast of [false, true]) {
      const label = `${theme.name}${high_contrast ? " high contrast" : ""}`;

      it(`gives ${label} six distinct readable colors`, () => {
        const palette = build_storage_palette({ ...theme, high_contrast });
        const metrics = pair_metrics(palette, theme.surface);

        expect(palette).toHaveLength(STORAGE_PALETTE_SIZE);
        expect(new Set(palette).size).toBe(STORAGE_PALETTE_SIZE);
        palette.forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/));
        expect(metrics.contrast).toBeGreaterThanOrEqual(
          high_contrast ? MIN_SEGMENT_CONTRAST_HIGH : MIN_SEGMENT_CONTRAST,
        );
        expect(metrics.normal).toBeGreaterThanOrEqual(MIN_NORMAL_DELTA * 0.98);
        expect(metrics.cvd).toBeGreaterThanOrEqual(MIN_CVD_DELTA * 0.95);
      });
    }
  }

  it("keeps the theme accent as the first color when it is readable", () => {
    for (const theme of THEMES) {
      const palette = build_storage_palette({ ...theme, high_contrast: false });

      if (contrast_of(theme.accent, theme.surface) >= MIN_SEGMENT_CONTRAST) {
        expect(palette[0]).toBe(theme.accent);
      } else {
        expect(contrast_of(palette[0], theme.surface)).toBeGreaterThanOrEqual(
          MIN_SEGMENT_CONTRAST,
        );
      }
    }
  });

  it("keeps the first color on the accent hue when it adjusts lightness", () => {
    const palette = build_storage_palette({
      accent: "#3b82f6",
      surface: "#ffffff",
      is_dark: false,
      high_contrast: true,
    });

    expect(palette[0]).not.toBe("#3b82f6");
    expect(
      Math.abs(hex_to_oklch(palette[0])[2] - hex_to_oklch("#3b82f6")[2]),
    ).toBeLessThan(3);
  });

  it("gives each theme its own palette", () => {
    const dark_themes = THEMES.filter(
      (theme) =>
        theme.is_dark &&
        theme.name !== "default dark" &&
        theme.name !== "aster-blue",
    );
    const keys = dark_themes.map((theme) =>
      build_storage_palette({ ...theme, high_contrast: false }).join(","),
    );

    expect(new Set(keys).size).toBe(dark_themes.length);
  });

  it("places the plan and add-on colors near the accent hue", () => {
    for (const theme of THEMES.filter(
      (entry) => entry.name !== "black" && entry.name !== "slate",
    )) {
      const palette = build_storage_palette({ ...theme, high_contrast: false });
      const accent_hue = hex_to_oklch(theme.accent)[2];
      const distance = (hue: number) => {
        const raw = Math.abs(hue - accent_hue) % 360;

        return raw > 180 ? 360 - raw : raw;
      };

      expect(distance(hex_to_oklch(palette[1])[2])).toBeLessThanOrEqual(75);
    }
  });

  it("stays distinct for custom accents across the hue wheel", () => {
    for (const is_dark of [true, false]) {
      const surface = is_dark ? "#121212" : "#ffffff";
      const samples = is_dark
        ? [
            [0.6, 0.15],
            [0.75, 0.18],
            [0.9, 0.1],
            [0.5, 0.02],
          ]
        : [
            [0.5, 0.15],
            [0.6, 0.2],
            [0.85, 0.15],
            [0.3, 0.1],
          ];

      for (let hue = 0; hue < 360; hue += 15) {
        for (const [lightness, chroma] of samples) {
          const accent = oklch_to_hex(lightness, chroma, hue);
          const palette = build_storage_palette({
            accent,
            surface,
            is_dark,
            high_contrast: false,
          });
          const metrics = pair_metrics(palette, surface);

          expect(metrics.contrast).toBeGreaterThanOrEqual(MIN_SEGMENT_CONTRAST);
          expect(metrics.normal).toBeGreaterThanOrEqual(0.09);
          expect(metrics.cvd).toBeGreaterThanOrEqual(0.035);
        }
      }
    }
  });

  it("handles common custom accent colors", () => {
    for (const accent of ACCENT_CHOICES) {
      for (const is_dark of [true, false]) {
        const surface = is_dark ? "#121212" : "#ffffff";
        const palette = build_storage_palette({
          accent,
          surface,
          is_dark,
          high_contrast: false,
        });
        const metrics = pair_metrics(palette, surface);

        expect(metrics.contrast).toBeGreaterThanOrEqual(MIN_SEGMENT_CONTRAST);
        expect(metrics.normal).toBeGreaterThanOrEqual(0.09);
        expect(metrics.cvd).toBeGreaterThanOrEqual(0.035);
      }
    }
  });

  it("falls back to defaults for unreadable input", () => {
    const palette = build_storage_palette({
      accent: "var(--accent)",
      surface: "transparent",
      is_dark: true,
      high_contrast: false,
    });

    expect(palette[0]).toBe("#3b82f6");
    expect(palette).toHaveLength(STORAGE_PALETTE_SIZE);
  });
});
