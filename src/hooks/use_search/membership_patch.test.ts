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
import type { SearchResultItem } from "./types";

import { describe, it, expect } from "vitest";

import { patch_results_membership } from "./membership_patch";

function result(
  id: string,
  extra: Partial<SearchResultItem> = {},
): SearchResultItem {
  return {
    id,
    subject: `Subject ${id}`,
    sender_name: "Sender",
    sender_email: "news@example.com",
    preview: "",
    timestamp: "2026-01-01T00:00:00Z",
    is_read: true,
    is_starred: false,
    has_attachments: false,
    matched_fields: [],
    tag_tokens: [],
    folders: [],
    ...extra,
  } as SearchResultItem;
}

describe("patch_results_membership", () => {
  it("adds a label to every touched result and leaves the rest alone", () => {
    const results = [result("a"), result("b", { tag_tokens: ["t2"] }), result("c")];
    const next = patch_results_membership(results, ["a", "b"], {
      add_tag_tokens: ["t1"],
    });

    expect(next?.map((r) => r.tag_tokens)).toEqual([["t1"], ["t2", "t1"], []]);
    expect(next?.[2]).toBe(results[2]);
  });

  it("removes a label without touching other labels", () => {
    const results = [result("a", { tag_tokens: ["t1", "t2"] })];
    const next = patch_results_membership(results, ["a"], {
      remove_tag_tokens: ["t1"],
    });

    expect(next?.[0].tag_tokens).toEqual(["t2"]);
  });

  it("replaces labels when a full set is given", () => {
    const results = [result("a", { tag_tokens: ["t1"] })];
    const next = patch_results_membership(results, ["a"], {
      tag_tokens: ["t3"],
    });

    expect(next?.[0].tag_tokens).toEqual(["t3"]);
  });

  it("moves results to a folder and removes a folder", () => {
    const results = [
      result("a", { folders: [{ folder_token: "f1", name: "Old" }] }),
      result("b", { folders: [{ folder_token: "f2", name: "Two" }] }),
    ];
    const moved = patch_results_membership(results, ["a"], {
      folders: [{ folder_token: "f9", name: "Receipts" }],
    });
    const removed = patch_results_membership(results, ["b"], {
      remove_folder_tokens: ["f2"],
    });

    expect(moved?.[0].folders).toEqual([
      { folder_token: "f9", name: "Receipts" },
    ]);
    expect(removed?.[1].folders).toEqual([]);
  });

  it("patches a thread row when any of its messages is touched", () => {
    const results = [result("a", { grouped_email_ids: ["a", "a2"] })];
    const next = patch_results_membership(results, ["a2"], {
      add_tag_tokens: ["t1"],
    });

    expect(next?.[0].tag_tokens).toEqual(["t1"]);
  });

  it("returns null when nothing changes", () => {
    const results = [result("a", { tag_tokens: ["t1"] })];

    expect(
      patch_results_membership(results, ["a"], { add_tag_tokens: ["t1"] }),
    ).toBeNull();
    expect(patch_results_membership(results, [], { tag_tokens: [] })).toBeNull();
  });
});
