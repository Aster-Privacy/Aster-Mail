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
import { describe, it, expect, beforeEach } from "vitest";

import {
  account_index_path,
  app_pathname,
  get_active_account_index,
  parse_account_index,
  resolve_account_basename,
  strip_account_prefix,
  take_url_account_request,
  write_account_index_hint,
} from "./account_index_url";

function set_location(pathname: string, search = "", hash = ""): void {
  window.history.replaceState(null, "", `${pathname}${search}${hash}`);
}

describe("account_index_url", () => {
  beforeEach(() => {
    localStorage.clear();
    set_location("/");
  });

  it("parses a valid account index and rejects everything else", () => {
    expect(parse_account_index("/u/0/")).toBe(0);
    expect(parse_account_index("/u/3")).toBe(3);
    expect(parse_account_index("/u/12/settings/general")).toBe(12);
    expect(parse_account_index("/u/99")).toBe(null);
    expect(parse_account_index("/u/abc/all")).toBe(null);
    expect(parse_account_index("/user/1")).toBe(null);
    expect(parse_account_index("/all")).toBe(null);
  });

  it("strips the prefix back to an app path", () => {
    expect(strip_account_prefix("/u/1/all")).toBe("/all");
    expect(strip_account_prefix("/u/1/")).toBe("/");
    expect(strip_account_prefix("/u/1")).toBe("/");
    expect(strip_account_prefix("/all")).toBe("/all");
    expect(strip_account_prefix("/u/1/email/abc")).toBe("/email/abc");
  });

  it("builds a prefixed path from any path", () => {
    expect(account_index_path(2, "/all")).toBe("/u/2/all");
    expect(account_index_path(2, "/u/0/all")).toBe("/u/2/all");
    expect(account_index_path(0, "/")).toBe("/u/0/");
  });

  it("honors an explicit index in the url", () => {
    set_location("/u/2/starred", "?q=hi");

    expect(resolve_account_basename()).toBe("/u/2");
    expect(get_active_account_index()).toBe(2);
    expect(window.location.pathname).toBe("/u/2/starred");
    expect(take_url_account_request()).toBe(2);
    expect(take_url_account_request()).toBe(null);
  });

  it("adds the stored index to an app path that has none", () => {
    write_account_index_hint(1);
    set_location("/archive", "?q=hi", "#msg");

    expect(resolve_account_basename()).toBe("/u/1");
    expect(get_active_account_index()).toBe(1);
    expect(window.location.pathname).toBe("/u/1/archive");
    expect(window.location.search).toBe("?q=hi");
    expect(window.location.hash).toBe("#msg");
    expect(take_url_account_request()).toBe(null);
  });

  it("defaults to the first account when nothing is stored", () => {
    set_location("/");

    expect(resolve_account_basename()).toBe("/u/0");
    expect(window.location.pathname).toBe("/u/0/");
  });

  it("prefixes public entry paths without treating them as a switch request", () => {
    write_account_index_hint(2);

    for (const path of ["/sign-in", "/view/token", "/family/claim/abc"]) {
      set_location(path);

      expect(resolve_account_basename()).toBe("/u/2");
      expect(get_active_account_index()).toBe(2);
      expect(window.location.pathname).toBe(`/u/2${path}`);
      expect(take_url_account_request()).toBe(null);
    }
  });

  it("ignores an explicit index typed onto a sign-in url", () => {
    set_location("/u/1/sign-in", "?u=someone");

    expect(resolve_account_basename()).toBe("/u/1");
    expect(get_active_account_index()).toBe(1);
    expect(take_url_account_request()).toBe(null);
  });

  it("reports the app path with the prefix removed", () => {
    set_location("/u/1/sign-in");

    expect(app_pathname()).toBe("/sign-in");
  });

  it("ignores an out-of-range stored index", () => {
    write_account_index_hint(99);
    set_location("/");

    expect(resolve_account_basename()).toBe("/u/0");
  });
});
