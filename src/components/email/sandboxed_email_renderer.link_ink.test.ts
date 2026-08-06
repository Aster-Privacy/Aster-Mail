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

function relative_luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);

  return (
    (0.2126 * ((n >> 16) & 255) +
      0.7152 * ((n >> 8) & 255) +
      0.0722 * (n & 255)) /
    255
  );
}

const BLUE = "#3b82f6";

describe("link_ink_for", () => {
  it("keeps a saturated accent", () => {
    expect(link_ink_for("#2563eb")).toBe("#2563eb");
    expect(link_ink_for("#e11d48")).toBe("#e11d48");
    expect(link_ink_for("#16a34a")).toBe("#16a34a");
  });

  it("falls back to blue for white, black and grey accents", () => {
    expect(link_ink_for("#ffffff")).toBe(BLUE);
    expect(link_ink_for("#000000")).toBe(BLUE);
    expect(link_ink_for("#111111")).toBe(BLUE);
    expect(link_ink_for("#9ca3af")).toBe(BLUE);
    expect(link_ink_for("#f5f5f5")).toBe(BLUE);
  });

  it("falls back to blue for garbage input", () => {
    expect(link_ink_for("")).toBe(BLUE);
    expect(link_ink_for("red")).toBe(BLUE);
    expect(link_ink_for("javascript:alert(1)")).toBe(BLUE);
  });

  it("expands shorthand hex", () => {
    expect(link_ink_for("#0f0")).toBe("#00ff00");
    expect(link_ink_for("#fff")).toBe(BLUE);
  });
});

describe("link_hover_ink_for", () => {
  it("differs from the resting link color in both themes", () => {
    expect(link_hover_ink_for(BLUE, true)).not.toBe(BLUE);
    expect(link_hover_ink_for(BLUE, false)).not.toBe(BLUE);
  });

  it("brightens in dark mode and darkens in light mode", () => {
    expect(relative_luminance(link_hover_ink_for(BLUE, true))).toBeGreaterThan(
      relative_luminance(BLUE),
    );
    expect(relative_luminance(link_hover_ink_for(BLUE, false))).toBeLessThan(
      relative_luminance(BLUE),
    );
  });

  it("tracks the accent instead of a fixed hue", () => {
    expect(link_hover_ink_for("#e11d48", true)).not.toBe(
      link_hover_ink_for(BLUE, true),
    );
  });

  it("returns a valid six digit hex", () => {
    expect(link_hover_ink_for("#0f0", true)).toMatch(/^#[0-9a-f]{6}$/);
    expect(link_hover_ink_for("garbage", false)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
