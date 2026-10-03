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
  preferences_equal,
  reconcile_preferences,
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "./preferences";

describe("reconcile_preferences", () => {
  it("applies only the keys the user changed onto the fresh server blob", () => {
    const base: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      show_aster_branding: true,
      conversation_grouping: true,
    };
    const current: UserPreferences = {
      ...base,
      show_aster_branding: false,
    };
    const server: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      show_aster_branding: true,
      conversation_grouping: false,
    };

    const result = reconcile_preferences(base, current, server);

    expect(result.show_aster_branding).toBe(false);
    expect(result.conversation_grouping).toBe(false);
  });

  it("does not clobber an unrelated field another device changed", () => {
    const base: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      show_aster_branding: true,
      undo_send_seconds: 5,
    };
    const current: UserPreferences = {
      ...base,
      show_aster_branding: false,
    };
    const server: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      show_aster_branding: true,
      undo_send_seconds: 30,
    };

    const result = reconcile_preferences(base, current, server);

    expect(result.show_aster_branding).toBe(false);
    expect(result.undo_send_seconds).toBe(30);
  });

  it("returns the server blob unchanged when the user changed nothing", () => {
    const base: UserPreferences = { ...DEFAULT_PREFERENCES };
    const current: UserPreferences = { ...DEFAULT_PREFERENCES };
    const server: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      theme: "light",
      accent_color: "#abcdef",
    };

    const result = reconcile_preferences(base, current, server);

    expect(result.theme).toBe("light");
    expect(result.accent_color).toBe("#abcdef");
  });

  it("preserves multiple local edits over the server values", () => {
    const base: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      show_aster_branding: true,
      conversation_grouping: true,
      undo_send_seconds: 5,
    };
    const current: UserPreferences = {
      ...base,
      show_aster_branding: false,
      conversation_grouping: false,
    };
    const server: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      show_aster_branding: true,
      conversation_grouping: true,
      undo_send_seconds: 30,
    };

    const result = reconcile_preferences(base, current, server);

    expect(result.show_aster_branding).toBe(false);
    expect(result.conversation_grouping).toBe(false);
    expect(result.undo_send_seconds).toBe(30);
  });

  it("does not mutate its inputs", () => {
    const base: UserPreferences = { ...DEFAULT_PREFERENCES };
    const current: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      show_aster_branding: false,
    };
    const server: UserPreferences = { ...DEFAULT_PREFERENCES };

    reconcile_preferences(base, current, server);

    expect(server.show_aster_branding).toBe(
      DEFAULT_PREFERENCES.show_aster_branding,
    );
    expect(current.show_aster_branding).toBe(false);
  });
});

describe("preferences_equal", () => {
  it("treats a fresh copy with the same values as equal", () => {
    const left: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      muted_folder_tokens: ["a", "b"],
    };
    const right: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      muted_folder_tokens: ["a", "b"],
    };

    expect(preferences_equal(left, right)).toBe(true);
  });

  it("notices a changed top-level value", () => {
    expect(
      preferences_equal(DEFAULT_PREFERENCES, {
        ...DEFAULT_PREFERENCES,
        compact_mode: !DEFAULT_PREFERENCES.compact_mode,
      }),
    ).toBe(false);
  });

  it("notices a changed nested value", () => {
    expect(
      preferences_equal(
        { ...DEFAULT_PREFERENCES, muted_folder_tokens: ["a"] },
        { ...DEFAULT_PREFERENCES, muted_folder_tokens: ["a", "b"] },
      ),
    ).toBe(false);
  });

  it("notices a key that only one side has", () => {
    const extra = {
      ...DEFAULT_PREFERENCES,
      added_by_newer_client: true,
    } as unknown as UserPreferences;

    expect(preferences_equal(DEFAULT_PREFERENCES, extra)).toBe(false);
    expect(preferences_equal(extra, DEFAULT_PREFERENCES)).toBe(false);
  });
});
