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
  MAX_IMPORT_CREATED_TAGS,
  MAX_TAG_NAME_LENGTH,
  find_import_tag,
  resolve_import_tags,
} from "./import_tags";

function creator() {
  return vi.fn(async (name: string, parent_token?: string) => ({
    name,
    tag_token: (parent_token ? parent_token + "/" : "new-") + name,
    parent_token,
  }));
}

describe("find_import_tag", () => {
  const tags = [
    { name: "Work", tag_token: "tok-work" },
    { name: "Invoices", tag_token: "tok-invoices", parent_token: "tok-work" },
  ];

  it("matches the name case-insensitively under the same parent", () => {
    expect(find_import_tag(tags, " work ")?.tag_token).toBe("tok-work");
    expect(find_import_tag(tags, "invoices", "tok-work")?.tag_token).toBe(
      "tok-invoices",
    );
  });

  it("does not match a label under another parent", () => {
    expect(find_import_tag(tags, "invoices")).toBeUndefined();
    expect(find_import_tag(tags, "work", "tok-work")).toBeUndefined();
  });
});

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

  it("stops creating labels at the import limit and still reuses existing ones", async () => {
    const create_tag = creator();
    const names = Array.from(
      { length: MAX_IMPORT_CREATED_TAGS + 25 },
      (_, index) => `Label ${index}`,
    );
    const result = await resolve_import_tags({
      names: [...names, "Existing"],
      existing_tags: [{ name: "existing", tag_token: "tok-existing" }],
      create_tag,
    });

    expect(create_tag).toHaveBeenCalledTimes(MAX_IMPORT_CREATED_TAGS);
    expect(result.created).toBe(MAX_IMPORT_CREATED_TAGS);
    expect(result.skipped).toBe(25);
    expect(result.tag_map.size).toBe(MAX_IMPORT_CREATED_TAGS + 1);
    expect(result.tag_map.get("existing")).toBe("tok-existing");
    expect(result.tag_map.has(`label ${MAX_IMPORT_CREATED_TAGS}`)).toBe(false);
  });

  it("counts every level of a nested label toward the import limit", async () => {
    const create_tag = creator();
    const names = Array.from(
      { length: MAX_IMPORT_CREATED_TAGS },
      (_, index) => `Parent ${index}/Child ${index}`,
    );
    const result = await resolve_import_tags({
      names,
      existing_tags: [],
      create_tag,
    });

    expect(create_tag).toHaveBeenCalledTimes(MAX_IMPORT_CREATED_TAGS);
    expect(result.created).toBe(MAX_IMPORT_CREATED_TAGS);
    expect(result.skipped).toBe(MAX_IMPORT_CREATED_TAGS / 2);
  });

  it("keeps the deepest label it reached when a sublabel can't be created", async () => {
    const create_tag = vi.fn(async (name: string, parent_token?: string) =>
      name === "Blocked"
        ? null
        : {
            name,
            tag_token: (parent_token ? parent_token + "/" : "new-") + name,
            parent_token,
          },
    );
    const result = await resolve_import_tags({
      names: ["Clients/Acme/Blocked", "Clients/Acme"],
      existing_tags: [],
      create_tag,
    });

    expect(result.tag_map.get("clients/acme/blocked")).toBe("new-Clients/Acme");
    expect(result.tag_map.get("clients/acme")).toBe("new-Clients/Acme");
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(1);
  });

  it("keeps an existing ancestor when a sublabel can't be created", async () => {
    const create_tag = vi.fn(async () => null);
    const result = await resolve_import_tags({
      names: ["Clients/Blocked"],
      existing_tags: [{ name: "Clients", tag_token: "tok-clients" }],
      create_tag,
    });

    expect(result.tag_map.get("clients/blocked")).toBe("tok-clients");
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("uses a label that already exists when creating it fails", async () => {
    const create_tag = vi.fn(async () => null);
    const find_existing = vi.fn(async (name: string, parent_token?: string) =>
      name === "Work" && !parent_token
        ? { name: "Work", tag_token: "tok-work" }
        : null,
    );
    const names = Array.from({ length: 5 }, (_, index) => `Work/Sub ${index}`);
    const result = await resolve_import_tags({
      names: ["Work", ...names],
      existing_tags: [],
      create_tag,
      find_existing,
    });

    expect(find_existing).toHaveBeenCalledWith("Work", undefined);
    expect(result.tag_map.get("work")).toBe("tok-work");
    expect(result.tag_map.get("work/sub 0")).toBe("tok-work");
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(5);
  });

  it("counts a failure when the lookup finds nothing or rejects", async () => {
    const create_tag = vi.fn(async () => null);
    const find_existing = vi.fn(async () => {
      throw new Error("offline");
    });
    const result = await resolve_import_tags({
      names: ["Work"],
      existing_tags: [],
      create_tag,
      find_existing,
    });

    expect(result.tag_map.size).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("folds levels past the depth limit into the last label", async () => {
    const create_tag = creator();

    await resolve_import_tags({
      names: ["a/b/c/d/e/f/g/h/i/j/k"],
      existing_tags: [],
      create_tag,
    });

    expect(create_tag.mock.calls.map((call) => call[0])).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j/k",
    ]);
  });

  it("keeps ten levels as ten nested labels", async () => {
    const create_tag = creator();

    await resolve_import_tags({
      names: ["a/b/c/d/e/f/g/h/i/j"],
      existing_tags: [],
      create_tag,
    });

    expect(create_tag.mock.calls.map((call) => call[0])).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
    ]);
  });
});
