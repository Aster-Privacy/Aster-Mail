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
import { afterEach, describe, expect, it } from "vitest";

import {
  initial_requested_plan,
  read_requested_plan,
  should_open_requested_plan,
  strip_requested_plan,
} from "@/components/settings/billing/requested_plan";

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("read_requested_plan", () => {
  it("accepts known plan codes", () => {
    expect(read_requested_plan("?plan=nova")).toBe("nova");
    expect(read_requested_plan("?plan=family")).toBe("family");
  });

  it("ignores unknown or missing plans", () => {
    expect(read_requested_plan("")).toBeNull();
    expect(read_requested_plan("?plan=free")).toBeNull();
    expect(read_requested_plan("?plan=%3Cscript%3E")).toBeNull();
  });
});

describe("strip_requested_plan", () => {
  it("reads the plan, then removes only that parameter", () => {
    window.history.replaceState({}, "", "/settings/billing?plan=nova&tab=x");

    expect(initial_requested_plan()).toBe("nova");
    strip_requested_plan();
    expect(window.location.search).toBe("?tab=x");
    expect(initial_requested_plan()).toBeNull();
  });

  it("removes an invalid plan without reporting it", () => {
    window.history.replaceState({}, "", "/settings/billing?plan=bogus");

    expect(initial_requested_plan()).toBeNull();
    strip_requested_plan();
    expect(window.location.search).toBe("");
  });
});

describe("should_open_requested_plan", () => {
  it("skips the plan you already have", () => {
    expect(should_open_requested_plan("nova", "nova")).toBe(false);
    expect(should_open_requested_plan("nova", "free")).toBe(true);
    expect(should_open_requested_plan("nova", undefined)).toBe(true);
    expect(should_open_requested_plan(null, "free")).toBe(false);
  });
});
