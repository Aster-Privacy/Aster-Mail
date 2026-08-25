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

import { compute_save_retry_delay } from "./use_preferences_core";

describe("compute_save_retry_delay", () => {
  it("backs off exponentially from the base delay", () => {
    expect(compute_save_retry_delay(0)).toBe(3000);
    expect(compute_save_retry_delay(1)).toBe(6000);
    expect(compute_save_retry_delay(2)).toBe(12000);
  });

  it("caps the delay so a long outage does not push retries out forever", () => {
    expect(compute_save_retry_delay(5)).toBe(60000);
  });

  it("stops retrying once the attempt budget is spent", () => {
    expect(compute_save_retry_delay(6)).toBeNull();
    expect(compute_save_retry_delay(40)).toBeNull();
  });
});
