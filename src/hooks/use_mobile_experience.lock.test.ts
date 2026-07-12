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
  get_locked_mobile_experience,
  reset_locked_mobile_experience,
  MOBILE_EXPERIENCE_BREAKPOINT_PX,
} from "./use_mobile_experience";

function set_user_agent(value: string): void {
  Object.defineProperty(navigator, "userAgent", {
    value,
    configurable: true,
  });
}

function set_inner_width(value: number): void {
  Object.defineProperty(window, "innerWidth", {
    value,
    configurable: true,
  });
}

const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148";

describe("get_locked_mobile_experience", () => {
  beforeEach(() => {
    reset_locked_mobile_experience();
  });

  it("keeps the mobile decision when the viewport later widens to desktop", () => {
    set_user_agent(PHONE_UA);
    set_inner_width(MOBILE_EXPERIENCE_BREAKPOINT_PX - 100);

    expect(get_locked_mobile_experience()).toBe(true);

    set_inner_width(MOBILE_EXPERIENCE_BREAKPOINT_PX + 400);

    expect(get_locked_mobile_experience()).toBe(true);
  });

  it("keeps the desktop decision when the viewport later narrows", () => {
    set_user_agent(PHONE_UA);
    set_inner_width(MOBILE_EXPERIENCE_BREAKPOINT_PX + 400);

    expect(get_locked_mobile_experience()).toBe(false);

    set_inner_width(MOBILE_EXPERIENCE_BREAKPOINT_PX - 100);

    expect(get_locked_mobile_experience()).toBe(false);
  });
});
