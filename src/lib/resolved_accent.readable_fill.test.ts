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

import { BODY_TEXT_CONTRAST, contrast_ratio } from "@/lib/email_ink";
import { readable_accent_fill } from "@/lib/resolved_accent";

const theme_accents: Record<string, string> = {
  light: "#3b82f6",
  purple: "#a855f7",
  green: "#22c55e",
  rose: "#f43f5e",
  orange: "#f97316",
  teal: "#14b88a",
  indigo: "#6366f1",
  amber: "#f5be0b",
  cyan: "#068fd4",
  slate: "#64748b",
  aster_blue: "#3b82f6",
  lime: "#84cc16",
  fuchsia: "#cd1fd6",
  emerald: "#31d926",
  pink: "#e0399d",
  black: "#f4f4f5",
  custom_yellow: "#ffff00",
  custom_navy: "#1e3a8a",
};

describe("readable_accent_fill", () => {
  for (const [theme, accent] of Object.entries(theme_accents)) {
    it(`keeps ${theme} chip text at AA contrast`, () => {
      const { fill, fill_hover, fg } = readable_accent_fill(accent);

      expect(fill).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrast_ratio(fill, fg)).toBeGreaterThanOrEqual(
        BODY_TEXT_CONTRAST,
      );
      expect(contrast_ratio(fill_hover, fg)).toBeGreaterThanOrEqual(
        BODY_TEXT_CONTRAST,
      );
    });
  }

  it("keeps an accent that already passes unchanged", () => {
    expect(readable_accent_fill("#1e3a8a").fill.toLowerCase()).toBe("#1e3a8a");
  });

  it("darkens the default blue instead of using it as is", () => {
    const { fill, fg } = readable_accent_fill("#3b82f6");

    expect(fg).toBe("#ffffff");
    expect(fill.toLowerCase()).not.toBe("#3b82f6");
    expect(contrast_ratio("#3b82f6", "#ffffff")).toBeLessThan(
      BODY_TEXT_CONTRAST,
    );
  });
});
