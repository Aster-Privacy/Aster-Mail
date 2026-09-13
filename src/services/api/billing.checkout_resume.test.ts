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
  BILLING_RESUME_EVENT,
  clear_addon_target,
  consume_addon_resume,
  consume_checkout_resume,
  read_addon_target,
  read_checkout_target,
  remember_addon_target,
  remember_checkout_target,
  request_addon_resume,
  request_checkout_resume,
} from "./billing";

describe("checkout resume plumbing", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("requests a resume and announces it once", () => {
    let announced = 0;
    const listener = () => {
      announced += 1;
    };

    window.addEventListener(BILLING_RESUME_EVENT, listener);
    remember_checkout_target("nova", "year");
    request_checkout_resume();
    window.removeEventListener(BILLING_RESUME_EVENT, listener);

    expect(announced).toBe(1);
    expect(consume_checkout_resume()).toBe(true);
    expect(consume_checkout_resume()).toBe(false);
    expect(read_checkout_target()).toEqual({
      plan_code: "nova",
      billing_interval: "year",
    });
  });

  it("reports no resume when checkout was never started", () => {
    expect(consume_checkout_resume()).toBe(false);
  });

  it("remembers the add-on a checkout was started for", () => {
    expect(read_addon_target()).toBeNull();

    remember_addon_target("addon_10tb");

    expect(read_addon_target()).toBe("addon_10tb");

    clear_addon_target();

    expect(read_addon_target()).toBeNull();
  });

  it("requests an add-on resume and announces it once", () => {
    let announced = 0;
    const listener = () => {
      announced += 1;
    };

    window.addEventListener(BILLING_RESUME_EVENT, listener);
    remember_addon_target("addon_50gb");
    request_addon_resume();
    window.removeEventListener(BILLING_RESUME_EVENT, listener);

    expect(announced).toBe(1);
    expect(consume_addon_resume()).toBe(true);
    expect(consume_addon_resume()).toBe(false);
    expect(read_addon_target()).toBe("addon_50gb");
  });

  it("reports no add-on resume when no add-on checkout was cancelled", () => {
    expect(consume_addon_resume()).toBe(false);
  });
});
