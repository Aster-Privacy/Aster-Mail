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
import { describe, it, expect } from "vitest";

import { is_sandbox_status } from "./sandbox_notice";

describe("sandbox status shape", () => {
  it("accepts the status the desktop shell reports", () => {
    expect(is_sandbox_status({ enabled: false, reason: "bwrap_missing" })).toBe(
      true,
    );
    expect(
      is_sandbox_status({ enabled: true, reason: "probe_passed", detail: null }),
    ).toBe(true);
  });

  it("refuses anything else", () => {
    expect(is_sandbox_status(null)).toBe(false);
    expect(is_sandbox_status("off")).toBe(false);
    expect(is_sandbox_status({ enabled: "no", reason: "x" })).toBe(false);
    expect(is_sandbox_status({ enabled: false })).toBe(false);
  });
});
