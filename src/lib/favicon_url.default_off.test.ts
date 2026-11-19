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

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
}));

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: { get_method: () => "direct" },
}));

vi.mock("@/lib/icon_cache", () => ({
  is_icon_failed: () => false,
}));

const { get_favicon_url, PENDING_FAVICON_SRC } = await import(
  "./favicon_url"
);
const { build_merged_preferences, DEFAULT_PREFERENCES } = await import(
  "@/services/api/preferences"
);

describe("company logos before the person opts in", () => {
  it("requests no logo from the server", () => {
    expect(get_favicon_url("shop.example")).toBe(PENDING_FAVICON_SRC);
  });

  it("keeps logos off for saved settings that predate the switch", () => {
    const saved: Record<string, unknown> = { ...DEFAULT_PREFERENCES };

    delete saved.load_sender_logos;

    expect(build_merged_preferences(saved, null).load_sender_logos).toBe(
      false,
    );
  });
});
