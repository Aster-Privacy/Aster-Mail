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

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({ theme: "dark" }),
}));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: {} }),
  FONT_SIZE_DEFAULT: 14,
  normalize_font_size_scale: (value: number) => value,
}));
vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/services/api/client", () => ({
  api_client: { get_access_token: () => null },
}));
vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch: vi.fn(),
}));
vi.mock("@/services/routing/connection_store", () => ({
  connection_store: {
    get_method: () => "direct",
    get_api_onion_url: () => null,
  },
}));

const { fit_zoom_for } = await import("./sandboxed_email_renderer");

describe("fit_zoom_for", () => {
  it("leaves content that already fits at the reader's own zoom", () => {
    expect(fit_zoom_for(320, 400, 1)).toBe(1);
    expect(fit_zoom_for(400, 400, 1.25)).toBe(1.25);
  });

  it("shrinks a wide newsletter to the available width", () => {
    expect(fit_zoom_for(600, 300, 1)).toBe(0.5);
    expect(fit_zoom_for(900, 360, 1)).toBe(0.4);
  });

  it("never zooms past the reader's own preference", () => {
    expect(fit_zoom_for(600, 300, 0.4)).toBe(0.4);
  });

  it("stops shrinking at the legibility floor", () => {
    expect(fit_zoom_for(10000, 360, 1)).toBe(0.35);
  });

  it("keeps the reader's zoom when nothing can be measured", () => {
    expect(fit_zoom_for(0, 400, 1.25)).toBe(1.25);
    expect(fit_zoom_for(900, 0, 1.25)).toBe(1.25);
  });
});
