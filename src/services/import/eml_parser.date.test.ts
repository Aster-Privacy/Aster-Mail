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

import { parse_eml } from "./eml_parser";

describe("parse_eml date inference (re-import dedup)", () => {
  it("does not flag a real Date header as inferred", () => {
    const raw =
      "From: a@example.com\nTo: b@example.com\nSubject: Hi\nDate: Wed, 15 Jan 2025 10:00:00 +0000\n\nbody";

    const parsed = parse_eml(raw);

    expect(parsed.date_inferred).not.toBe(true);
    expect(parsed.date.getUTCFullYear()).toBe(2025);
  });

  it("flags a missing Date header as inferred so the content hash stays stable", () => {
    const raw = "From: a@example.com\nTo: b@example.com\nSubject: Hi\n\nbody";

    const parsed = parse_eml(raw);

    expect(parsed.date_inferred).toBe(true);
  });

  it("flags an unparseable Date header as inferred", () => {
    const raw =
      "From: a@example.com\nTo: b@example.com\nSubject: Hi\nDate: not-a-date\n\nbody";

    const parsed = parse_eml(raw);

    expect(parsed.date_inferred).toBe(true);
  });
});
