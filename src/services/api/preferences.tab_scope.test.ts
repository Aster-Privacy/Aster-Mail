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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cache_preferences_locally,
  forget_account_preferences_cache,
  get_cached_preferences,
  type UserPreferences,
} from "./preferences";

import {
  bind_tab_account,
  note_cookie_owner,
  reset_tab_account_for_tests,
} from "@/lib/tab_account";

function prefs(theme: string): UserPreferences {
  return { theme } as unknown as UserPreferences;
}

describe("preferences cache per tab account", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    reset_tab_account_for_tests();
  });

  afterEach(() => {
    reset_tab_account_for_tests();
  });

  it("keeps a detached tab's preferences out of the shared key", () => {
    note_cookie_owner("acct_a");
    bind_tab_account("acct_b", 1);
    cache_preferences_locally(prefs("dark"));

    expect(localStorage.getItem("aster_preferences_cache")).toBeNull();
    expect(localStorage.getItem("aster_preferences_cache:acct_b")).not.toBeNull();
  });

  it("never reads another account's shared cache in a bound tab", () => {
    localStorage.setItem(
      "aster_preferences_cache",
      JSON.stringify({ theme: "dark" }),
    );
    bind_tab_account("acct_b", 1);

    expect(get_cached_preferences()).toBeNull();
  });

  it("writes the shared key from the tab that owns the session cookies", () => {
    note_cookie_owner("acct_a");
    bind_tab_account("acct_a", 0);
    cache_preferences_locally(prefs("dark"));

    expect(localStorage.getItem("aster_preferences_cache")).not.toBeNull();
    expect(localStorage.getItem("aster_preferences_cache:acct_a")).not.toBeNull();
  });

  it("forgets a removed account's cached preferences", () => {
    localStorage.setItem("aster_preferences_cache:acct_b", "{}");
    localStorage.setItem("aster_text_size:acct_b", "{}");
    forget_account_preferences_cache("acct_b");

    expect(localStorage.getItem("aster_preferences_cache:acct_b")).toBeNull();
    expect(localStorage.getItem("aster_text_size:acct_b")).toBeNull();
  });
});
