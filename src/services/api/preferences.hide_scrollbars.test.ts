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

import { build_merged_preferences, DEFAULT_PREFERENCES } from "./preferences";

describe("hide_scrollbars preference", () => {
  it("defaults to off", () => {
    expect(DEFAULT_PREFERENCES.hide_scrollbars).toBe(false);
    expect(build_merged_preferences({}, null).hide_scrollbars).toBe(false);
  });

  it("reads the synced value from the server blob", () => {
    const merged = build_merged_preferences({ hide_scrollbars: true }, null);

    expect(merged.hide_scrollbars).toBe(true);
  });

  it("treats a malformed synced value as off", () => {
    const merged = build_merged_preferences({ hide_scrollbars: "yes" }, null);

    expect(merged.hide_scrollbars).toBe(false);
  });

  it("keeps the cached value when an older client dropped the key", () => {
    const merged = build_merged_preferences(
      { theme: "dark" },
      { ...DEFAULT_PREFERENCES, hide_scrollbars: true },
    );

    expect(merged.hide_scrollbars).toBe(true);
  });
});
