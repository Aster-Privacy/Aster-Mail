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

import { security_section_ready } from "./security_ready";

const settled = {
  totp_settled: true,
  login_alerts_settled: true,
  recovery_settled: true,
  recovery_section_settled: true,
  passkeys_settled: true,
  guard_settled: true,
};

describe("security_section_ready", () => {
  it("is ready once every load has settled", () => {
    expect(security_section_ready(settled)).toBe(true);
  });

  it.each(Object.keys(settled))("waits while %s is pending", (key) => {
    expect(security_section_ready({ ...settled, [key]: false })).toBe(false);
  });
});
