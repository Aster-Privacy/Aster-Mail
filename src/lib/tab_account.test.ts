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
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  bind_tab_account,
  choose_tab_account,
  clear_tab_account,
  forget_cookie_owner,
  get_tab_account_id,
  is_account_choice_required,
  note_cookie_owner,
  read_tab_account_binding,
  reset_tab_account_for_tests,
  set_account_choice_required,
  subscribe_tab_account,
  tab_shares_session_cookies,
} from "./tab_account";
import {
  clear_csrf_cache,
  get_csrf_token_from_cookie,
  set_csrf_token,
} from "@/services/api/csrf";

const ids = ["acct_a", "acct_b", "acct_c"];

describe("choose_tab_account", () => {
  it("returns empty when no account is stored", () => {
    expect(choose_tab_account([], 0, null, false)).toEqual({ kind: "empty" });
  });

  it("follows the url index on a fresh navigation", () => {
    expect(choose_tab_account(ids, 1, null, false)).toEqual({
      kind: "bound",
      id: "acct_b",
      index: 1,
      moved: false,
    });
  });

  it("lets the url win over the binding on a fresh navigation", () => {
    const binding = { id: "acct_a", index: 0 };

    expect(choose_tab_account(ids, 2, binding, false)).toMatchObject({
      kind: "bound",
      id: "acct_c",
    });
  });

  it("keeps the bound account on reload even after a reorder", () => {
    const binding = { id: "acct_a", index: 0 };

    expect(choose_tab_account(["acct_b", "acct_a"], 0, binding, true)).toEqual(
      { kind: "bound", id: "acct_a", index: 1, moved: true },
    );
  });

  it("asks for a choice on reload when the bound account was removed", () => {
    const binding = { id: "acct_gone", index: 1 };

    expect(choose_tab_account(ids, 1, binding, true)).toEqual({
      kind: "invalid_index",
      requested: 1,
    });
  });

  it("asks for a choice when the url index has no account", () => {
    expect(choose_tab_account(ids, 5, null, false)).toEqual({
      kind: "invalid_index",
      requested: 5,
    });
    expect(choose_tab_account(ids, 5, null, true)).toEqual({
      kind: "invalid_index",
      requested: 5,
    });
  });
});

describe("tab binding", () => {
  beforeEach(() => {
    sessionStorage.clear();
    reset_tab_account_for_tests();
    clear_csrf_cache();
  });

  it("stores the binding in this tab only", () => {
    bind_tab_account("acct_b", 1);

    expect(get_tab_account_id()).toBe("acct_b");
    expect(read_tab_account_binding()).toEqual({ id: "acct_b", index: 1 });
    expect(localStorage.getItem("aster_tab_account")).toBe(null);
  });

  it("rejects malformed stored bindings", () => {
    for (const raw of [
      "not json",
      JSON.stringify({ id: "acct_b" }),
      JSON.stringify({ id: "acct b", index: 0 }),
      JSON.stringify({ id: "acct_b", index: -1 }),
      JSON.stringify({ id: "acct_b", index: 1.5 }),
      JSON.stringify(null),
    ]) {
      sessionStorage.setItem("aster_tab_account", raw);

      expect(read_tab_account_binding()).toBe(null);
    }
  });

  it("clears the binding and notifies listeners", () => {
    const listener = vi.fn();

    subscribe_tab_account(listener);
    bind_tab_account("acct_a", 0);
    clear_tab_account();

    expect(get_tab_account_id()).toBe(null);
    expect(read_tab_account_binding()).toBe(null);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("drops the chooser once an account is bound", () => {
    set_account_choice_required(true);
    expect(is_account_choice_required()).toBe(true);

    bind_tab_account("acct_a", 0);

    expect(is_account_choice_required()).toBe(false);
  });

  it("shares cookies only when this tab owns the cookie session", () => {
    expect(tab_shares_session_cookies()).toBe(true);

    bind_tab_account("acct_b", 1);
    expect(tab_shares_session_cookies()).toBe(false);

    note_cookie_owner("acct_b");
    expect(tab_shares_session_cookies()).toBe(true);

    note_cookie_owner("acct_a");
    expect(tab_shares_session_cookies()).toBe(false);

    note_cookie_owner("acct_b");
    forget_cookie_owner();
    expect(tab_shares_session_cookies()).toBe(false);
  });

  it("never reads another account's csrf cookie in a detached tab", () => {
    document.cookie = "csrf_token=cookie_owner_token; path=/";
    bind_tab_account("acct_b", 1);
    note_cookie_owner("acct_a");

    expect(get_csrf_token_from_cookie()).toBe(null);

    set_csrf_token("own_session_token");
    expect(get_csrf_token_from_cookie()).toBe("own_session_token");

    clear_csrf_cache();
    note_cookie_owner("acct_b");
    expect(get_csrf_token_from_cookie()).toBe("cookie_owner_token");

    document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });
});
