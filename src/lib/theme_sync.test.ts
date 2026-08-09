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
  build_merged_preferences,
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@/services/api/preferences";
import {
  build_theme_fields_update,
  build_theme_sync_toggle_update,
  get_effective_theme_fields,
  is_theme_sync_enabled,
} from "@/lib/theme_sync";

function make_preferences(
  overrides: Partial<UserPreferences>,
): UserPreferences {
  return { ...DEFAULT_PREFERENCES, ...overrides };
}

describe("theme sync defaults", () => {
  it("defaults to synced", () => {
    expect(DEFAULT_PREFERENCES.theme_sync_enabled_web).toBe(true);
    expect(DEFAULT_PREFERENCES.theme_web).toBe("");
    expect(DEFAULT_PREFERENCES.color_theme_web).toBe("");
    expect(DEFAULT_PREFERENCES.custom_theme_seed_web).toBe("");
    expect(is_theme_sync_enabled(DEFAULT_PREFERENCES)).toBe(true);
  });
});

describe("get_effective_theme_fields", () => {
  it("reads the shared values while sync is on", () => {
    const preferences = make_preferences({
      theme: "light",
      color_theme: "purple",
      custom_theme_seed: "#111111",
      theme_web: "dark",
      color_theme_web: "green",
      custom_theme_seed_web: "#222222",
    });

    expect(get_effective_theme_fields(preferences)).toEqual({
      theme: "light",
      color_theme: "purple",
      custom_theme_seed: "#111111",
    });
  });

  it("reads the web values while sync is off", () => {
    const preferences = make_preferences({
      theme_sync_enabled_web: false,
      theme: "light",
      color_theme: "purple",
      custom_theme_seed: "#111111",
      theme_web: "dark",
      color_theme_web: "green",
      custom_theme_seed_web: "#222222",
    });

    expect(get_effective_theme_fields(preferences)).toEqual({
      theme: "dark",
      color_theme: "green",
      custom_theme_seed: "#222222",
    });
  });

  it("falls back to the shared value for every empty web field", () => {
    const preferences = make_preferences({
      theme_sync_enabled_web: false,
      theme: "light",
      color_theme: "purple",
      custom_theme_seed: "#111111",
    });

    expect(get_effective_theme_fields(preferences)).toEqual({
      theme: "light",
      color_theme: "purple",
      custom_theme_seed: "#111111",
    });
  });

  it("ignores an unrecognized web value", () => {
    const preferences = make_preferences({
      theme_sync_enabled_web: false,
      theme: "light",
      color_theme: "purple",
      theme_web: "midnight",
      color_theme_web: "not_a_theme",
    });

    expect(get_effective_theme_fields(preferences)).toEqual({
      theme: "light",
      color_theme: "purple",
      custom_theme_seed: DEFAULT_PREFERENCES.custom_theme_seed,
    });
  });
});

describe("build_theme_fields_update", () => {
  it("writes the shared fields while sync is on", () => {
    const preferences = make_preferences({});

    expect(
      build_theme_fields_update(preferences, {
        theme: "dark",
        color_theme: "teal",
        custom_theme_seed: "#333333",
      }),
    ).toEqual({
      theme: "dark",
      color_theme: "teal",
      custom_theme_seed: "#333333",
    });
  });

  it("writes only the web fields while sync is off", () => {
    const preferences = make_preferences({ theme_sync_enabled_web: false });

    expect(
      build_theme_fields_update(preferences, {
        theme: "dark",
        color_theme: "teal",
        custom_theme_seed: "#333333",
      }),
    ).toEqual({
      theme_web: "dark",
      color_theme_web: "teal",
      custom_theme_seed_web: "#333333",
    });
  });

  it("never writes another platform's fields", () => {
    const off = make_preferences({ theme_sync_enabled_web: false });
    const on = make_preferences({});
    const keys = [
      ...Object.keys(build_theme_fields_update(off, { theme: "dark" })),
      ...Object.keys(build_theme_fields_update(on, { theme: "dark" })),
    ];

    expect(keys.some((key) => key.endsWith("_ios"))).toBe(false);
    expect(keys.some((key) => key.endsWith("_android"))).toBe(false);
  });
});

describe("build_theme_sync_toggle_update", () => {
  it("seeds the web fields from the effective theme when turning sync off", () => {
    const preferences = make_preferences({
      theme: "light",
      color_theme: "rose",
      custom_theme_seed: "#abcdef",
    });
    const update = build_theme_sync_toggle_update(preferences, false);

    expect(update).toEqual({
      theme_web: "light",
      color_theme_web: "rose",
      custom_theme_seed_web: "#abcdef",
      theme_sync_enabled_web: false,
    });

    const next = { ...preferences, ...update };

    expect(get_effective_theme_fields(next)).toEqual(
      get_effective_theme_fields(preferences),
    );
  });

  it("adopts the shared values when turning sync on", () => {
    const preferences = make_preferences({
      theme_sync_enabled_web: false,
      theme: "light",
      color_theme: "rose",
      custom_theme_seed: "#abcdef",
      theme_web: "dark",
      color_theme_web: "green",
      custom_theme_seed_web: "#222222",
    });
    const update = build_theme_sync_toggle_update(preferences, true);

    expect(update).toEqual({ theme_sync_enabled_web: true });
    expect(get_effective_theme_fields({ ...preferences, ...update })).toEqual({
      theme: "light",
      color_theme: "rose",
      custom_theme_seed: "#abcdef",
    });
  });
});

describe("cross platform round trip", () => {
  it("preserves the fields owned by other platforms", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      theme: "light",
      theme_sync_enabled_ios: false,
      theme_ios: "dark",
      color_theme_ios: "teal",
      custom_theme_seed_ios: "#0f0f0f",
      theme_sync_enabled_android: false,
      theme_android: "light",
      color_theme_android: "amber",
      custom_theme_seed_android: "#f0f0f0",
      future_platform_setting: "keep_me",
    };

    const merged = build_merged_preferences(server, null);
    const update = build_theme_sync_toggle_update(merged, false);
    const saved = JSON.parse(
      JSON.stringify({ ...merged, ...update }),
    ) as Record<string, unknown>;

    expect(saved.theme_sync_enabled_ios).toBe(false);
    expect(saved.theme_ios).toBe("dark");
    expect(saved.color_theme_ios).toBe("teal");
    expect(saved.custom_theme_seed_ios).toBe("#0f0f0f");
    expect(saved.theme_sync_enabled_android).toBe(false);
    expect(saved.theme_android).toBe("light");
    expect(saved.color_theme_android).toBe("amber");
    expect(saved.custom_theme_seed_android).toBe("#f0f0f0");
    expect(saved.future_platform_setting).toBe("keep_me");
    expect(saved.theme).toBe("light");
    expect(saved.theme_web).toBe("light");
    expect(saved.theme_sync_enabled_web).toBe(false);

    const reloaded = build_merged_preferences(saved, null) as unknown as Record<
      string,
      unknown
    >;

    for (const key of Object.keys(saved)) {
      expect(reloaded[key]).toEqual(saved[key]);
    }
  });
});
