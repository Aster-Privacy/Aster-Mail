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
import { describe, it, expect, vi } from "vitest";

vi.mock("@/contexts/theme_context", () => ({ useTheme: () => ({ theme: "dark" }) }));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: {} }),
  FONT_SIZE_DEFAULT: 14,
  normalize_font_size_scale: (value: number) => value,
}));
vi.mock("@/lib/i18n/context", () => ({ use_i18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/services/api/client", () => ({
  api_client: { get_access_token: () => null },
}));
vi.mock("@/services/routing/routing_provider", () => ({ routed_fetch: vi.fn() }));
vi.mock("@/services/routing/connection_store", () => ({
  connection_store: { get_method: () => "direct", get_api_onion_url: () => null },
}));

const { link_ink_for, link_hover_ink_for } = await import(
  "./sandboxed_email_renderer"
);

const { contrast_ratio, hex_to_hsl } = await import("@/lib/email_ink");

const LIGHT = "#ffffff";
const DARK = "#121212";
const BLUE = "#3b82f6";

const THEME_ACCENTS = [
  "#3b82f6",
  "#a855f7",
  "#22c55e",
  "#f43f5e",
  "#f97316",
  "#14b88a",
  "#6366f1",
  "#f5be0b",
  "#068fd4",
  "#64748b",
  "#84cc16",
  "#cd1fd6",
  "#31d926",
  "#e0399d",
  "#d4d4d8",
];

function hue_gap(a: string, b: string): number {
  const diff = Math.abs(hex_to_hsl(a).h - hex_to_hsl(b).h);

  return Math.min(diff, 360 - diff);
}

describe("link_ink_for", () => {
  it("meets body text contrast on both surfaces for every theme accent", () => {
    for (const accent of THEME_ACCENTS) {
      expect(contrast_ratio(link_ink_for(accent, LIGHT), LIGHT)).toBeGreaterThanOrEqual(4.5);
      expect(contrast_ratio(link_ink_for(accent, DARK), DARK)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the accent hue instead of falling back to blue", () => {
    for (const accent of THEME_ACCENTS.filter((c) => hex_to_hsl(c).s > 0.2)) {
      expect(hue_gap(link_ink_for(accent, LIGHT), accent)).toBeLessThan(4);
      expect(hue_gap(link_ink_for(accent, DARK), accent)).toBeLessThan(4);
    }
  });

  it("gives an achromatic accent a readable ink", () => {
    expect(contrast_ratio(link_ink_for("#d4d4d8", DARK), DARK)).toBeGreaterThanOrEqual(4.5);
    expect(contrast_ratio(link_ink_for("#ffffff", LIGHT), LIGHT)).toBeGreaterThanOrEqual(4.5);
  });

  it("returns a valid six digit hex for garbage input", () => {
    expect(link_ink_for("", LIGHT)).toMatch(/^#[0-9a-f]{6}$/);
    expect(link_ink_for("red", LIGHT)).toMatch(/^#[0-9a-f]{6}$/);
    expect(link_ink_for("javascript:alert(1)", DARK)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("expands shorthand hex", () => {
    expect(hue_gap(link_ink_for("#0f0", LIGHT), "#00ff00")).toBeLessThan(4);
  });
});

describe("link_hover_ink_for", () => {
  it("differs from the resting link color on both surfaces", () => {
    expect(link_hover_ink_for(BLUE, DARK)).not.toBe(link_ink_for(BLUE, DARK));
    expect(link_hover_ink_for(BLUE, LIGHT)).not.toBe(link_ink_for(BLUE, LIGHT));
  });

  it("keeps body text contrast on both surfaces", () => {
    for (const accent of THEME_ACCENTS) {
      expect(contrast_ratio(link_hover_ink_for(accent, LIGHT), LIGHT)).toBeGreaterThanOrEqual(4.5);
      expect(contrast_ratio(link_hover_ink_for(accent, DARK), DARK)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("tracks the accent instead of a fixed hue", () => {
    expect(link_hover_ink_for("#e11d48", DARK)).not.toBe(
      link_hover_ink_for(BLUE, DARK),
    );
  });

  it("returns a valid six digit hex", () => {
    expect(link_hover_ink_for("#0f0", DARK)).toMatch(/^#[0-9a-f]{6}$/);
    expect(link_hover_ink_for("garbage", LIGHT)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
