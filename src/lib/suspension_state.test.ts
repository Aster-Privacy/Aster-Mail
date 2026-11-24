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
import { afterEach, describe, expect, it } from "vitest";

import {
  ACCOUNT_SUSPENDED_EVENT,
  apply_sign_in_scope,
  get_suspension_state,
  is_suspended_path,
  reset_suspension_state,
  set_suspension_state,
} from "./suspension_state";

afterEach(() => {
  reset_suspension_state();
});

describe("suspension state", () => {
  it("marks a suspended sign-in and keeps a reload hint", () => {
    apply_sign_in_scope({ session_scope: "suspended" });

    expect(get_suspension_state()).toBe("suspended");
    expect(sessionStorage.getItem("aster_session_scope")).toBe("suspended");
  });

  it("treats a full sign-in as active and clears the hint", () => {
    set_suspension_state("suspended");
    apply_sign_in_scope({});

    expect(get_suspension_state()).toBe("active");
    expect(sessionStorage.getItem("aster_session_scope")).toBeNull();
  });

  it("accepts the legacy suspended flag", () => {
    apply_sign_in_scope({ is_suspended: true });

    expect(get_suspension_state()).toBe("suspended");
  });

  it("switches to suspended when a request is refused mid-session", () => {
    set_suspension_state("active");
    window.dispatchEvent(new CustomEvent(ACCOUNT_SUSPENDED_EVENT));

    expect(get_suspension_state()).toBe("suspended");
  });

  it("resets to unknown on sign-out", () => {
    set_suspension_state("suspended");
    reset_suspension_state();

    expect(get_suspension_state()).toBe("unknown");
    expect(sessionStorage.getItem("aster_session_scope")).toBeNull();
  });

  it("matches only the suspension route", () => {
    expect(is_suspended_path("/suspended")).toBe(true);
    expect(is_suspended_path("/suspended/")).toBe(true);
    expect(is_suspended_path("/suspended-x")).toBe(false);
    expect(is_suspended_path("/")).toBe(false);
  });
});
