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
  reconcile_preferences,
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
    expect(merged.undo_send_period).not.toBe(
      DEFAULT_PREFERENCES.undo_send_period,
    );
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

  it("keeps the system theme instead of rewriting it to dark", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      theme: "system",
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.theme).toBe("system");
  });

  it("keeps a cached system theme when the server blob omits the key", () => {
    const server: Record<string, unknown> = { ...DEFAULT_PREFERENCES };

    delete server.theme;

    const merged = build_merged_preferences(server, {
      ...DEFAULT_PREFERENCES,
      theme: "system",
    });

    expect(merged.theme).toBe("system");
  });

  it("replaces a sort order a mobile client left unset so the sort menu still shows a choice", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      inbox_sort_order: "",
      conversation_order: "newest",
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.inbox_sort_order).toBe("newest_first");
    expect(merged.conversation_order).toBe("asc");
  });

  it("keeps an oldest-first inbox written by an older mobile client", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      inbox_sort_order: "",
      conversation_order: "oldest",
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.inbox_sort_order).toBe("oldest_first");
    expect(merged.conversation_order).toBe("asc");
  });

  it("leaves a valid sort order and conversation order alone", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      inbox_sort_order: "oldest_first",
      conversation_order: "desc",
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.inbox_sort_order).toBe("oldest_first");
    expect(merged.conversation_order).toBe("desc");
  });

  it("replaces a date format a mobile client left unset so the date format menu still shows a choice", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      date_format: "",
      time_format: "",
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.date_format).toBe("MM/DD/YYYY");
    expect(merged.time_format).toBe("12h");
  });

  it("leaves a valid date format and time format alone", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      date_format: "DD/MM/YYYY",
      time_format: "24h",
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.date_format).toBe("DD/MM/YYYY");
    expect(merged.time_format).toBe("24h");
  });
  it("restores the mobile toolbar when a stored blob holds a non-array value", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      mobile_toolbar_actions: "trash",
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.mobile_toolbar_actions).toEqual(
      DEFAULT_PREFERENCES.mobile_toolbar_actions,
    );
  });

  it("drops non-string entries from the mobile toolbar", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      mobile_toolbar_actions: ["trash", 7, "star"],
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.mobile_toolbar_actions).toEqual(["trash", "star"]);
  });
  it("upgrades legacy swipe action ids so the swipe list shows a selection", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      swipe_left_action: "trash",
      swipe_right_action: "mark_read",
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.swipe_left_action).toBe("delete");
    expect(merged.swipe_right_action).toBe("toggle_read");
  });

  it("falls back to the default swipe action for an unknown id", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      swipe_left_action: "teleport",
      swipe_right_action: "",
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.swipe_left_action).toBe("archive");
    expect(merged.swipe_right_action).toBe("toggle_read");
  });

  it("leaves a supported swipe action alone", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      swipe_left_action: "snooze",
      swipe_right_action: "none",
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.swipe_left_action).toBe("snooze");
    expect(merged.swipe_right_action).toBe("none");
  });

  it("defaults the sidebar layout when the server blob has no layout keys", () => {
    const server: Record<string, unknown> = { ...DEFAULT_PREFERENCES };

    delete server.sidebar_section_order;
    delete server.sidebar_hidden_items;

    const merged = build_merged_preferences(server, null);

    expect(merged.sidebar_section_order).toEqual([
      "mail",
      "folders",
      "labels",
      "aliases",
    ]);
    expect(merged.sidebar_hidden_items).toEqual([]);
  });

  it("keeps the cached sidebar layout when a stale client dropped the keys", () => {
    const cached: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      sidebar_section_order: ["aliases", "mail", "folders", "labels"],
      sidebar_hidden_items: ["trash"],
    };
    const server: Record<string, unknown> = { ...DEFAULT_PREFERENCES };

    delete server.sidebar_section_order;
    delete server.sidebar_hidden_items;

    const merged = build_merged_preferences(server, cached);

    expect(merged.sidebar_section_order).toEqual([
      "aliases",
      "mail",
      "folders",
      "labels",
    ]);
    expect(merged.sidebar_hidden_items).toEqual(["trash"]);
  });

  it("replaces malformed sidebar layout values with safe defaults", () => {
    const merged = build_merged_preferences(
      {
        ...DEFAULT_PREFERENCES,
        sidebar_section_order: "aliases",
        sidebar_hidden_items: { 0: "trash" },
      },
      null,
    );

    expect(merged.sidebar_section_order).toEqual([
      "mail",
      "folders",
      "labels",
      "aliases",
    ]);
    expect(merged.sidebar_hidden_items).toEqual([]);
  });

  it("keeps unknown sidebar ids from newer clients and drops invalid entries", () => {
    const merged = build_merged_preferences(
      {
        ...DEFAULT_PREFERENCES,
        sidebar_section_order: ["calendar", "aliases", "aliases", 7, "<b>"],
        sidebar_hidden_items: ["future_item", "trash", "trash", null, "A"],
      },
      null,
    );

    expect(merged.sidebar_section_order).toEqual([
      "calendar",
      "aliases",
      "mail",
      "folders",
      "labels",
    ]);
    expect(merged.sidebar_hidden_items).toEqual(["future_item", "trash"]);
  });

  it("caps oversized sidebar lists", () => {
    const many = Array.from({ length: 100 }, (_, index) => `item_${index}`);
    const merged = build_merged_preferences(
      {
        ...DEFAULT_PREFERENCES,
        sidebar_section_order: many,
        sidebar_hidden_items: many,
      },
      null,
    );

    expect(merged.sidebar_hidden_items).toHaveLength(32);
    expect(merged.sidebar_section_order).toHaveLength(36);
    expect(merged.sidebar_section_order.slice(-4)).toEqual([
      "mail",
      "folders",
      "labels",
      "aliases",
    ]);
  });
});

describe("build_merged_preferences calendar keys", () => {
  it("keeps the calendar week start written by Aster Calendar", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      calendar_week_starts_on: "monday",
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.calendar_week_starts_on).toBe("monday");
  });

  it("keeps keys this app does not know so a save cannot wipe them", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      calendar_default_view: "week",
      calendar_show_week_numbers: true,
    };

    const merged = build_merged_preferences(server, null) as unknown as Record<
      string,
      unknown
    >;

    expect(merged.calendar_default_view).toBe("week");
    expect(merged.calendar_show_week_numbers).toBe(true);
  });

  it("drops an invalid week start instead of passing it to the pickers", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      calendar_week_starts_on: "tuesday",
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.calendar_week_starts_on).toBeUndefined();
  });

  it("leaves the week start unset when no app has saved one", () => {
    const merged = build_merged_preferences({ ...DEFAULT_PREFERENCES }, null);

    expect("calendar_week_starts_on" in merged).toBe(false);
  });
});

describe("reconcile_preferences calendar keys", () => {
  it("keeps a week start that Aster Calendar saved while this app had the old blob", () => {
    const base: UserPreferences = { ...DEFAULT_PREFERENCES };
    const current: UserPreferences = { ...DEFAULT_PREFERENCES, theme: "light" };
    const server: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      calendar_week_starts_on: "monday",
    };

    const reconciled = reconcile_preferences(base, current, server);

    expect(reconciled.calendar_week_starts_on).toBe("monday");
    expect(reconciled.theme).toBe("light");
  });

  it("sends the week start chosen in this app over the server copy", () => {
    const base: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      calendar_week_starts_on: "sunday",
    };
    const current: UserPreferences = {
      ...base,
      calendar_week_starts_on: "saturday",
    };
    const server: UserPreferences = { ...base };

    const reconciled = reconcile_preferences(base, current, server);

    expect(reconciled.calendar_week_starts_on).toBe("saturday");
  });
});

describe("build_merged_preferences subject hiding default", () => {
  it("hides the subject for an account that never set the switch", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      obscure_subject_when_encrypted: false,
    };

    delete server.obscure_subject_user_set;

    const merged = build_merged_preferences(server, null);

    expect(merged.obscure_subject_when_encrypted).toBe(true);
  });

  it("hides the subject when the stored preferences carry neither key", () => {
    const server: Record<string, unknown> = { ...DEFAULT_PREFERENCES };

    delete server.obscure_subject_when_encrypted;
    delete server.obscure_subject_user_set;

    const merged = build_merged_preferences(server, null);

    expect(merged.obscure_subject_when_encrypted).toBe(true);
  });

  it("keeps the subject visible for an account that turned the switch off", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      obscure_subject_when_encrypted: false,
      obscure_subject_user_set: true,
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.obscure_subject_when_encrypted).toBe(false);
  });

  it("keeps the subject hidden for an account that turned the switch on", () => {
    const server: Record<string, unknown> = {
      ...DEFAULT_PREFERENCES,
      obscure_subject_when_encrypted: true,
      obscure_subject_user_set: true,
    };

    const merged = build_merged_preferences(server, null);

    expect(merged.obscure_subject_when_encrypted).toBe(true);
  });
});
