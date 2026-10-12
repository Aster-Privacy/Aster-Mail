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

import {
  condition_ready_to_save,
  default_condition,
} from "./rule_editor_helpers";

describe("condition_ready_to_save", () => {
  it("blocks a size condition that has no size", () => {
    const empty = default_condition("total_size");

    expect(condition_ready_to_save(empty)).toBe(false);
    expect(
      condition_ready_to_save({ ...empty, value: 1024 } as typeof empty),
    ).toBe(true);
  });

  it("keeps zero legal for a recipient count", () => {
    const count = default_condition("recipient_count");

    expect(
      condition_ready_to_save({ ...count, value: 0 } as typeof count),
    ).toBe(true);
  });

  it("blocks a text value that is only spaces", () => {
    const subject = default_condition("subject");

    expect(
      condition_ready_to_save({ ...subject, value: "   " } as typeof subject),
    ).toBe(false);
    expect(
      condition_ready_to_save({
        ...subject,
        value: "budget",
      } as typeof subject),
    ).toBe(true);
  });
});
