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
} from "./preferences";

describe("build_merged_preferences", () => {
  it("keeps the cached value when a stale client dropped the key from the server blob", () => {
    const cached: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      show_aster_branding: false,
    };
    const server: Record<string, unknown> = { ...DEFAULT_PREFERENCES };

    delete server.show_aster_branding;

    const merged = build_merged_preferences(server, cached);

    expect(merged.show_aster_branding).toBe(false);
  });

  it("keeps a non-default cached undo_send_period and show_aster_branding when the server blob omits both", () => {
    const cached: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      undo_send_period: "30 seconds",
      show_aster_branding: false,
    };
    const server: Record<string, unknown> = { ...DEFAULT_PREFERENCES };

    delete server.undo_send_period;
    delete server.show_aster_branding;

    const merged = build_merged_preferences(server, cached);

    expect(merged.undo_send_period).toBe("30 seconds");
    expect(merged.undo_send_period).not.toBe(DEFAULT_PREFERENCES.undo_send_period);
    expect(merged.show_aster_branding).toBe(false);
  });

  it("re-defaults undo_send_period to the product default when the server omits it and there is no cache", () => {
    const server: Record<string, unknown> = { ...DEFAULT_PREFERENCES };

    delete server.undo_send_period;

    const merged = build_merged_preferences(server, null);

    expect(merged.undo_send_period).toBe("10 seconds");
  });

  it("re-defaults a missing key to the product default when there is no cache", () => {
    const server: Record<string, unknown> = { ...DEFAULT_PREFERENCES };

    delete server.show_aster_branding;

    const merged = build_merged_preferences(server, null);

    expect(merged.show_aster_branding).toBe(true);
  });

  it("lets the server value win over the cache when the server has the key", () => {
    const cached: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      show_aster_branding: true,
    };
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      show_aster_branding: false,
    };

    const merged = build_merged_preferences(server, cached);

    expect(merged.show_aster_branding).toBe(false);
  });

  it("treats an explicit server true as authoritative over a cached false", () => {
    const cached: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      show_aster_branding: false,
    };
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      show_aster_branding: true,
    };

    const merged = build_merged_preferences(server, cached);

    expect(merged.show_aster_branding).toBe(true);
  });

  it("does not let a dropped key leak unrelated cached edits over present server values", () => {
    const cached: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      show_aster_branding: false,
      undo_send_seconds: 5,
    };
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      undo_send_seconds: 30,
    };

    delete server.show_aster_branding;

    const merged = build_merged_preferences(server, cached);

    expect(merged.show_aster_branding).toBe(false);
    expect(merged.undo_send_seconds).toBe(30);
  });

  it("normalizes an invalid theme to dark", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      theme: "neon",
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.theme).toBe("dark");
  });
});
