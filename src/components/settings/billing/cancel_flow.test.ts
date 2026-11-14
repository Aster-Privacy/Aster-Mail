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
  retention_step_for,
  step_after_reason,
  step_before_impact,
} from "@/components/settings/billing/cancel_flow";

const none = { has_save_offer: false, has_plan_offer: false, can_pause: false };

describe("cancel flow", () => {
  it("goes straight from the reason to the impact when nothing is offered", () => {
    expect(retention_step_for(none)).toBeNull();
    expect(step_after_reason(none)).toBe("impact");
    expect(step_before_impact(none)).toBe("reason");
  });

  it("shows at most one retention step, the save offer first", () => {
    const all = { has_save_offer: true, has_plan_offer: true, can_pause: true };

    expect(step_after_reason(all)).toBe("save");
    expect(step_before_impact(all)).toBe("save");
  });

  it("falls back to the plan offer and then to the pause", () => {
    expect(
      step_after_reason({ ...none, has_plan_offer: true, can_pause: true }),
    ).toBe("offer");
    expect(step_after_reason({ ...none, can_pause: true })).toBe("pause");
  });
});
