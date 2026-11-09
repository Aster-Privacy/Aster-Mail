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

import { DEFAULT_PREFERENCES } from "@/services/api/preferences";
import {
  build_theme_fields_update,
  build_theme_mode_update,
  build_theme_sync_toggle_update,
  get_effective_theme_fields,
  get_theme_surface,
  is_calendar_theme_active,
  type ThemeSyncPreferences,
} from "@/lib/theme_sync";

function make_preferences(): ThemeSyncPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    theme: "light",
    color_theme: "default",
    custom_theme_seed: "#111111",
    calendar_theme_separate: true,
    calendar_theme: "dark",
    calendar_color_theme: "purple",
    calendar_custom_theme_seed: "#222222",
  };
}

describe("theme surface in mail", () => {
  it("defaults to the mail surface", () => {
    expect(get_theme_surface()).toBe("mail");
  });

  it("ignores the calendar theme fields", () => {
    const preferences = make_preferences();

    expect(is_calendar_theme_active(preferences)).toBe(false);
    expect(get_effective_theme_fields(preferences)).toEqual({
      theme: "light",
      color_theme: "default",
      custom_theme_seed: "#111111",
    });
    expect(build_theme_fields_update(preferences, { theme: "dark" })).toEqual({
      theme: "dark",
    });
    expect(build_theme_mode_update(preferences, "system")).toEqual({
      theme: "system",
    });
    expect(build_theme_sync_toggle_update(preferences, true)).toEqual({
      theme_sync_enabled_web: true,
    });
  });
});
