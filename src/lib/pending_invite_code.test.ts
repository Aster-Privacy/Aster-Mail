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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  clear_remembered_invite_code,
  current_invite_code,
  normalize_invite_code,
  read_remembered_invite_code,
  remember_invite_code,
} from "./pending_invite_code";

function set_search(search: string) {
  window.history.replaceState({}, "", `/register${search}`);
}

describe("pending_invite_code", () => {
  beforeEach(() => {
    localStorage.clear();
    set_search("");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes codes and rejects malformed ones", () => {
    expect(normalize_invite_code(" kf6ql6cy ")).toBe("KF6QL6CY");
    expect(normalize_invite_code("")).toBeNull();
    expect(normalize_invite_code("bad code")).toBeNull();
    expect(normalize_invite_code("A".repeat(17))).toBeNull();
  });

  it("keeps the code after the address loses it", () => {
    set_search("?ref=kf6ql6cy");
    expect(current_invite_code()).toBe("KF6QL6CY");
    set_search("");
    expect(current_invite_code()).toBe("KF6QL6CY");
  });

  it("prefers the code in the address over a remembered one", () => {
    remember_invite_code("OLDCODE1");
    set_search("?ref=NEWCODE2");
    expect(current_invite_code()).toBe("NEWCODE2");
    expect(read_remembered_invite_code()).toBe("NEWCODE2");
  });

  it("returns nothing once cleared", () => {
    remember_invite_code("KF6QL6CY");
    clear_remembered_invite_code();
    expect(current_invite_code()).toBeNull();
  });

  it("drops a remembered code after 30 days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    remember_invite_code("KF6QL6CY");
    vi.setSystemTime(new Date("2026-10-30T00:00:00Z"));
    expect(read_remembered_invite_code()).toBe("KF6QL6CY");
    vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
    expect(read_remembered_invite_code()).toBeNull();
  });

  it("ignores corrupt stored values", () => {
    localStorage.setItem("aster_pending_invite_code", "{not json");
    expect(read_remembered_invite_code()).toBeNull();
    expect(localStorage.getItem("aster_pending_invite_code")).toBeNull();
  });
});
