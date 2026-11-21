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
  has_retention_options,
  retention_step_for,
  step_before_confirm,
} from "@/components/settings/billing/cancel_flow";

const none = { has_save_offer: false, has_plan_offer: false, can_pause: false };

describe("cancel flow", () => {
  it("offers no options and returns to the reason when nothing qualifies", () => {
    expect(retention_step_for(none)).toBeNull();
    expect(has_retention_options(none)).toBe(false);
    expect(step_before_confirm(none, "save")).toBe("reason");
  });

  it("shows at most one retention step, the save offer first", () => {
    const all = { has_save_offer: true, has_plan_offer: true, can_pause: true };

    expect(retention_step_for(all)).toBe("save");
    expect(has_retention_options(all)).toBe(true);
  });

  it("falls back to the plan offer and then to the pause", () => {
    expect(
      retention_step_for({ ...none, has_plan_offer: true, can_pause: true }),
    ).toBe("offer");
    expect(retention_step_for({ ...none, can_pause: true })).toBe("pause");
  });

  it("goes back from the confirmation to the step the user came from", () => {
    const all = { has_save_offer: true, has_plan_offer: true, can_pause: true };

    expect(step_before_confirm(all, "reason")).toBe("reason");
    expect(step_before_confirm(all, "save")).toBe("save");
  });
});
