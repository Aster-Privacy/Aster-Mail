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
import { describe, expect, it, vi } from "vitest";

import {
  MAX_CONSECUTIVE_TAG_FAILURES,
  MAX_TAG_NAME_LENGTH,
  resolve_import_tags,
} from "./import_tags";

function creator() {
  return vi.fn(async (name: string, parent_token?: string) => ({
    name,
    tag_token: (parent_token ? parent_token + "/" : "new-") + name,
    parent_token,
  }));
}

describe("resolve_import_tags", () => {
  it("reuses existing labels case-insensitively and creates the rest", async () => {
    const create_tag = creator();
    const result = await resolve_import_tags({
      names: ["work", "Family", "Parent/Child"],
      existing_tags: [{ name: "Work", tag_token: "tok-work" }],
      create_tag,
    });

    expect(create_tag.mock.calls).toEqual([
      ["Family", undefined],
      ["Parent", undefined],
      ["Child", "new-Parent"],
    ]);
    expect(Array.from(result.tag_map.entries())).toEqual([
      ["work", "tok-work"],
      ["family", "new-Family"],
      ["parent/child", "new-Parent/Child"],
    ]);
    expect(result.created).toBe(3);
    expect(result.skipped).toBe(0);
  });

  it("creates a label once when its name repeats in another case", async () => {
    const create_tag = creator();
    const result = await resolve_import_tags({
      names: ["Travel", "TRAVEL", "travel"],
      existing_tags: [],
      create_tag,
    });

    expect(create_tag).toHaveBeenCalledTimes(1);
    expect(result.tag_map.get("travel")).toBe("new-Travel");
    expect(result.created).toBe(1);
  });

  it("continues without a label that can't be created", async () => {
    const create_tag = vi.fn(async (name: string) =>
      name === "Blocked" ? null : { name, tag_token: "new-" + name },
    );
    const result = await resolve_import_tags({
      names: ["Blocked", "Allowed"],
      existing_tags: [],
      create_tag,
    });

    expect(result.tag_map.has("blocked")).toBe(false);
    expect(result.tag_map.get("allowed")).toBe("new-Allowed");
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("stops asking for new labels after repeated failures", async () => {
    const create_tag = vi.fn(async () => null);
    const names = Array.from({ length: 10 }, (_, i) => `Label ${i}`);
    const result = await resolve_import_tags({
      names: [...names, "Existing"],
      existing_tags: [{ name: "existing", tag_token: "tok-existing" }],
      create_tag,
    });

    expect(create_tag).toHaveBeenCalledTimes(MAX_CONSECUTIVE_TAG_FAILURES);
    expect(result.skipped).toBe(10);
    expect(result.created).toBe(0);
    expect(result.tag_map.get("existing")).toBe("tok-existing");
  });

  it("treats a rejected creation like a failed one", async () => {
    const create_tag = vi.fn(async () => {
      throw new Error("offline");
    });
    const result = await resolve_import_tags({
      names: ["Work"],
      existing_tags: [],
      create_tag,
    });

    expect(result.skipped).toBe(1);
    expect(result.tag_map.size).toBe(0);
  });

  it("skips names that are too long without calling the server", async () => {
    const create_tag = creator();
    const result = await resolve_import_tags({
      names: ["x".repeat(MAX_TAG_NAME_LENGTH + 1), "Short"],
      existing_tags: [],
      create_tag,
    });

    expect(create_tag).toHaveBeenCalledTimes(1);
    expect(result.skipped).toBe(1);
    expect(result.tag_map.get("short")).toBe("new-Short");
  });

  it("stops when the import is cancelled", async () => {
    const create_tag = creator();
    let calls = 0;
    const result = await resolve_import_tags({
      names: ["One", "Two", "Three"],
      existing_tags: [],
      create_tag,
      should_stop: () => calls++ >= 1,
    });

    expect(create_tag).toHaveBeenCalledTimes(1);
    expect(result.tag_map.size).toBe(1);
  });

  it("nests under an existing parent and reuses an existing sublabel", async () => {
    const create_tag = creator();
    const result = await resolve_import_tags({
      names: ["Clients/Acme", "clients/acme/Invoices"],
      existing_tags: [
        { name: "Clients", tag_token: "tok-clients" },
        { name: "Acme", tag_token: "tok-acme", parent_token: "tok-clients" },
      ],
      create_tag,
    });

    expect(create_tag.mock.calls).toEqual([["Invoices", "tok-acme"]]);
    expect(result.tag_map.get("clients/acme")).toBe("tok-acme");
    expect(result.tag_map.get("clients/acme/invoices")).toBe(
      "tok-acme/Invoices",
    );
    expect(result.created).toBe(1);
  });

  it("keeps an existing label whose own name contains a slash", async () => {
    const create_tag = creator();
    const result = await resolve_import_tags({
      names: ["Parent/Child"],
      existing_tags: [{ name: "Parent/Child", tag_token: "tok-flat" }],
      create_tag,
    });

    expect(create_tag).not.toHaveBeenCalled();
    expect(result.tag_map.get("parent/child")).toBe("tok-flat");
  });

  it("folds levels past the depth limit into the last label", async () => {
    const create_tag = creator();

    await resolve_import_tags({
      names: ["a/b/c/d/e/f"],
      existing_tags: [],
      create_tag,
    });

    expect(create_tag.mock.calls.map((call) => call[0])).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e/f",
    ]);
  });
});
