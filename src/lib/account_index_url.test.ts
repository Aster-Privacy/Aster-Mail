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
  account_index_url,
  app_pathname,
  is_public_entry_path,
  is_signed_in_entry_path,
  get_active_account_index,
  parse_account_index,
  resolve_account_basename,
  strip_account_prefix,
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
    expect(strip_account_prefix("/u/99/all")).toBe("/all");
  });

  it("builds a prefixed path from any path", () => {
    expect(account_index_path(2, "/all")).toBe("/u/2/all");
    expect(account_index_path(2, "/u/0/all")).toBe("/u/2/all");
    expect(account_index_path(0, "/")).toBe("/u/0/");
  });

  it("keeps an explicit index in the url as the basename", () => {
    set_location("/u/2/starred", "?q=hi");

    expect(resolve_account_basename()).toBe("/u/2");
    expect(get_active_account_index()).toBe(2);
    expect(window.location.pathname).toBe("/u/2/starred");
    expect(window.location.search).toBe("?q=hi");
  });

  it("rewrites an index with leading zeros to its plain form", () => {
    set_location("/u/007/starred", "?q=hi", "#msg");

    expect(resolve_account_basename()).toBe("/u/7");
    expect(get_active_account_index()).toBe(7);
    expect(window.location.pathname).toBe("/u/7/starred");
    expect(window.location.search).toBe("?q=hi");
    expect(window.location.hash).toBe("#msg");
  });

  it("treats a plain path as the first account and adds the prefix", () => {
    set_location("/archive", "?q=hi", "#msg");

    expect(resolve_account_basename()).toBe("/u/0");
    expect(get_active_account_index()).toBe(0);
    expect(window.location.pathname).toBe("/u/0/archive");
    expect(window.location.search).toBe("?q=hi");
    expect(window.location.hash).toBe("#msg");
  });

  it("maps the root path to the first account", () => {
    set_location("/");

    expect(resolve_account_basename()).toBe("/u/0");
    expect(window.location.pathname).toBe("/u/0/");
  });

  it("prefixes public entry paths with the first account", () => {
    for (const path of ["/sign-in", "/view/token", "/family/claim/abc"]) {
      set_location(path);

      expect(resolve_account_basename()).toBe("/u/0");
      expect(window.location.pathname).toBe(`/u/0${path}`);
      expect(is_public_entry_path(app_pathname())).toBe(true);
    }
  });

  it("treats invite pages as public pages that keep the signed-in account", () => {
    for (const path of ["/join/family", "/family/claim/abc", "/link-device"]) {
      expect(is_public_entry_path(path)).toBe(true);
      expect(is_signed_in_entry_path(path)).toBe(true);
    }

    for (const path of ["/sign-in", "/register", "/view/token", "/joined"]) {
      expect(is_signed_in_entry_path(path)).toBe(false);
    }
  });

  it("treats the device link page as a public page that keeps the signed-in account", () => {
    for (const path of ["/link-device", "/link-device/"]) {
      expect(is_public_entry_path(path)).toBe(true);
      expect(is_signed_in_entry_path(path)).toBe(true);
    }

    expect(is_signed_in_entry_path("/link-devices")).toBe(false);
  });

  it("keeps an out-of-range index so the chooser can explain it", () => {
    set_location("/u/99/all");

    expect(resolve_account_basename()).toBe("/u/99");
    expect(get_active_account_index()).toBe(99);
    expect(window.location.pathname).toBe("/u/99/all");
  });

  it("uses the plain index as the basename", () => {
    set_location("/u/007/settings");

    expect(resolve_account_basename()).toBe("/u/7");
    expect(get_active_account_index()).toBe(7);
    expect(window.location.pathname).toBe("/u/7/settings");
  });

  it("reports the app path with the prefix removed", () => {
    set_location("/u/1/sign-in");

    expect(app_pathname()).toBe("/sign-in");
  });

  it("builds the url a new account tab opens", () => {
    expect(account_index_url(0)).toBe("/u/0/");
    expect(account_index_url(3)).toBe("/u/3/");
  });

  it("does not treat lookalike paths as a prefix", () => {
    set_location("/user/1/all");

    expect(resolve_account_basename()).toBe("/u/0");
    expect(window.location.pathname).toBe("/u/0/user/1/all");
  });
});
