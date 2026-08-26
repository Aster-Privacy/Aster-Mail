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

import { describe, expect, it, vi, beforeEach } from "vitest";

const get_index_entries = vi.fn();

vi.mock("@/services/category_index", () => ({
  get_index_entries: (ids: string[]) => get_index_entries(ids),
}));

import { effective_category } from "@/services/effective_category";

describe("effective_category", () => {
  beforeEach(() => {
    get_index_entries.mockReset().mockReturnValue([]);
  });

  it("prefers the category the tabs actually place the message in", () => {
    get_index_entries.mockReturnValue([{ id: "a", category: "updates" }]);

    expect(effective_category({ id: "a", mail_category: "primary" })).toBe(
      "updates",
    );
  });

  it("falls back to the classified category when the index has no entry", () => {
    expect(effective_category({ id: "a", mail_category: "social" })).toBe(
      "social",
    );
  });

  it("defaults to primary with no id and no classification", () => {
    expect(effective_category({})).toBe("primary");
  });
});
