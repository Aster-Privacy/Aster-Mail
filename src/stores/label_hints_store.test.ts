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

import { get_label_hints, set_label_hints } from "./label_hints_store";

describe("label hints store", () => {
  it("forgets hints once an email has no labels left", () => {
    set_label_hints("email_a", [{ token: "t1", name: "Work" }]);
    expect(get_label_hints("email_a")).toHaveLength(1);

    set_label_hints("email_a", []);

    expect(get_label_hints("email_a")).toEqual([]);
  });

  it("keeps hints for other emails untouched", () => {
    set_label_hints("email_b", [{ token: "t2", name: "Personal" }]);
    set_label_hints("email_c", []);

    expect(get_label_hints("email_b")).toHaveLength(1);
  });
});
