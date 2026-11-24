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
import { describe, expect, it } from "vitest";

import {
  is_plan_pending,
  notifications_section_ready,
  wants_product_updates_unsubscribe,
} from "./notifications_ready";

const settled = {
  product_updates_settled: true,
  offers_loaded: true,
  source_notify_loaded: true,
  permission_settled: true,
  plan_pending: false,
};

describe("notifications_section_ready", () => {
  it("is ready once every load has settled", () => {
    expect(notifications_section_ready(settled)).toBe(true);
  });

  it.each([
    "product_updates_settled",
    "offers_loaded",
    "source_notify_loaded",
    "permission_settled",
  ] as const)("waits while %s is pending", (key) => {
    expect(notifications_section_ready({ ...settled, [key]: false })).toBe(
      false,
    );
  });

  it("waits while the plan is loading", () => {
    expect(
      notifications_section_ready({ ...settled, plan_pending: true }),
    ).toBe(false);
  });
});

describe("is_plan_pending", () => {
  it("is pending only while limits are loading for the first time", () => {
    expect(is_plan_pending(null, true, false)).toBe(true);
    expect(is_plan_pending(null, false, false)).toBe(false);
    expect(is_plan_pending(null, true, true)).toBe(false);
    expect(is_plan_pending({ plan_code: "free" }, true, false)).toBe(false);
  });
});

describe("wants_product_updates_unsubscribe", () => {
  it("reads the unsubscribe link parameter", () => {
    expect(
      wants_product_updates_unsubscribe("?unsubscribe=product_updates"),
    ).toBe(true);
    expect(wants_product_updates_unsubscribe("?unsubscribe=other")).toBe(false);
    expect(wants_product_updates_unsubscribe("")).toBe(false);
  });
});
