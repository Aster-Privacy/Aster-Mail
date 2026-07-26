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
  build_selection_snapshot,
  empty_selection_snapshot,
} from "@/components/email/inbox/selection_snapshot";

describe("build_selection_snapshot", () => {
  it("returns the shared empty snapshot when nothing is selected", () => {
    const snapshot = build_selection_snapshot([
      { id: "a" },
      { id: "b", is_selected: false },
    ]);

    expect(snapshot).toBe(empty_selection_snapshot);
    expect(snapshot.ids).toEqual([]);
  });

  it("collects ids in list order", () => {
    const snapshot = build_selection_snapshot([
      { id: "a", is_selected: true },
      { id: "b" },
      { id: "c", is_selected: true },
    ]);

    expect(snapshot.ids).toEqual(["a", "c"]);
    expect(snapshot.grouped_ids).toEqual(["a", "c"]);
  });

  it("expands grouped conversations with more than one member", () => {
    const snapshot = build_selection_snapshot([
      { id: "a", is_selected: true, grouped_email_ids: ["a", "a2", "a3"] },
      { id: "b", is_selected: true, grouped_email_ids: ["b"] },
    ]);

    expect(snapshot.ids).toEqual(["a", "b"]);
    expect(snapshot.grouped_ids).toEqual(["a", "a2", "a3", "b"]);
  });

  it("deduplicates folder and tag tokens across the selection", () => {
    const snapshot = build_selection_snapshot([
      {
        id: "a",
        is_selected: true,
        folders: [{ folder_token: "f1" }, { folder_token: "f2" }],
        tags: [{ id: "t1" }],
      },
      {
        id: "b",
        is_selected: true,
        folders: [{ folder_token: "f2" }],
        tags: [{ id: "t1" }, { id: "t2" }],
      },
      {
        id: "c",
        folders: [{ folder_token: "f9" }],
        tags: [{ id: "t9" }],
      },
    ]);

    expect(snapshot.folder_tokens).toEqual(["f1", "f2"]);
    expect(snapshot.tag_tokens).toEqual(["t1", "t2"]);
  });

  it("tolerates selected rows without folders or tags", () => {
    const snapshot = build_selection_snapshot([{ id: "a", is_selected: true }]);

    expect(snapshot.folder_tokens).toEqual([]);
    expect(snapshot.tag_tokens).toEqual([]);
  });
});
