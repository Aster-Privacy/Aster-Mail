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
  clear_csrf_cache,
  get_csrf_token_from_cookie,
  set_csrf_token,
} from "@/services/api/csrf";
import {
  bind_tab_account,
  note_cookie_owner,
  reset_tab_account_for_tests,
} from "@/lib/tab_account";

function set_cookie(value: string): void {
  document.cookie = `csrf_token=${value}; path=/`;
}

describe("csrf token tab scope", () => {
  beforeEach(() => {
    reset_tab_account_for_tests();
    clear_csrf_cache();
    window.sessionStorage.clear();
    set_cookie("cookie_owner_token");
  });

  afterEach(() => {
    document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    clear_csrf_cache();
    reset_tab_account_for_tests();
  });

  it("drops a cookie token once the tab no longer shares cookies", () => {
    expect(get_csrf_token_from_cookie()).toBe("cookie_owner_token");

    note_cookie_owner("acct_a");
    bind_tab_account("acct_b", 1);

    expect(get_csrf_token_from_cookie()).toBeNull();
  });

  it("keeps the cookie token for the tab that owns the cookies", () => {
    note_cookie_owner("acct_a");
    bind_tab_account("acct_a", 0);

    expect(get_csrf_token_from_cookie()).toBe("cookie_owner_token");
  });

  it("keeps a token set in memory for the bound account", () => {
    note_cookie_owner("acct_a");
    bind_tab_account("acct_b", 1);
    set_csrf_token("memory_token_b");

    expect(get_csrf_token_from_cookie()).toBe("memory_token_b");
  });

  it("drops a memory token when the tab is bound to another account", () => {
    note_cookie_owner("acct_a");
    bind_tab_account("acct_b", 1);
    set_csrf_token("memory_token_b");
    bind_tab_account("acct_c", 2);

    expect(get_csrf_token_from_cookie()).toBeNull();
  });

  it("keeps a token set before the tab was bound", () => {
    note_cookie_owner("acct_a");
    set_csrf_token("memory_token_early");
    bind_tab_account("acct_b", 1);

    expect(get_csrf_token_from_cookie()).toBe("memory_token_early");
  });
});
