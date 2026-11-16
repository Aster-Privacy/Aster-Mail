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
  selection_folder_status,
  selection_tag_status,
  tags_from_tokens,
} from "./selection_membership";

const rows = [
  { id: "a", tags: [{ id: "t1" }], folders: [{ folder_token: "f1" }] },
  { id: "b", tags: [{ id: "t1" }, { id: "t2" }], folders: [] },
  { id: "c", tags: [], folders: [{ folder_token: "f1" }] },
];

describe("selection_tag_status", () => {
  it("reports all, some, or none across the selected results", () => {
    const selected = new Set(["a", "b"]);

    expect(selection_tag_status(rows, selected, "t1")).toBe("all");
    expect(selection_tag_status(rows, selected, "t2")).toBe("some");
    expect(selection_tag_status(rows, selected, "t3")).toBe("none");
  });

  it("ignores rows that are not selected and empty selections", () => {
    expect(selection_tag_status(rows, new Set(["c"]), "t1")).toBe("none");
    expect(selection_tag_status(rows, new Set(), "t1")).toBe("none");
  });
});

describe("selection_folder_status", () => {
  it("reports mixed folder membership", () => {
    expect(selection_folder_status(rows, new Set(["a", "c"]), "f1")).toBe(
      "all",
    );
    expect(
      selection_folder_status(rows, new Set(["a", "b", "c"]), "f1"),
    ).toBe("some");
  });
});

describe("tags_from_tokens", () => {
  it("names known labels and keeps unknown tokens unnamed", () => {
    const lookup = new Map([["t1", { name: "Receipts", color: "#f00" }]]);

    expect(tags_from_tokens(["t1", "tx"], lookup)).toEqual([
      { id: "t1", name: "Receipts", color: "#f00", icon: undefined },
      { id: "tx", name: "", color: undefined, icon: undefined },
    ]);
    expect(tags_from_tokens(undefined, lookup)).toEqual([]);
  });
});
