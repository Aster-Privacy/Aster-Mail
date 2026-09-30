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
import { describe, it, expect, vi } from "vitest";

vi.mock("@/services/api/external_accounts/api", () => ({
  list_oauth_folders: vi.fn(),
  save_folder_mapping: vi.fn(),
}));
vi.mock("@/hooks/use_folders", () => ({
  encrypt_folder_field: vi.fn(),
  generate_folder_token: vi.fn(),
}));
vi.mock("@/services/api/folders", () => ({ create_folder: vi.fn() }));
vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: vi.fn(),
}));
vi.mock("@/services/labels/ensure_defaults", () => ({
  ensure_default_labels: vi.fn(),
}));
vi.mock("@/hooks/mail_events", () => ({ emit_folders_changed: vi.fn() }));

import {
  mirror_folder_tree,
  type ExistingFolder,
} from "@/services/external_folder_mirror";

function folder(name: string, delimiter = "/", excluded = false) {
  return { name, delimiter, excluded };
}

function recorder() {
  const created: { name: string; parent: string | undefined }[] = [];
  let next = 0;
  const create = async (name: string, parent: string | undefined) => {
    next++;
    created.push({ name, parent });

    return `tok_${next}`;
  };

  return { created, create };
}

describe("mirror_folder_tree", () => {
  it("builds nested folders under their parents", async () => {
    const { created, create } = recorder();
    const result = await mirror_folder_tree(
      [
        folder("Finances/Bills/Zen"),
        folder("Finances"),
        folder("Finances/Bills"),
      ],
      [],
      create,
    );

    expect(created).toEqual([
      { name: "Finances", parent: undefined },
      { name: "Bills", parent: "tok_1" },
      { name: "Zen", parent: "tok_2" },
    ]);
    expect(result.mapping).toEqual({
      Finances: "tok_1",
      "Finances/Bills": "tok_2",
      "Finances/Bills/Zen": "tok_3",
    });
    expect(result.failures).toBe(0);
  });

  it("keeps same-named children under different parents apart", async () => {
    const { created, create } = recorder();
    const result = await mirror_folder_tree(
      [
        folder("Finances"),
        folder("Work"),
        folder("Finances/Misc"),
        folder("Work/Misc"),
      ],
      [],
      create,
    );

    expect(created.filter((c) => c.name === "Misc")).toHaveLength(2);
    expect(result.mapping["Finances/Misc"]).not.toBe(
      result.mapping["Work/Misc"],
    );
  });

  it("drops the INBOX prefix and skips inbox and excluded folders", async () => {
    const { created, create } = recorder();
    const result = await mirror_folder_tree(
      [
        folder("INBOX", "."),
        folder("INBOX.Projects", "."),
        folder("INBOX.Sent", ".", true),
      ],
      [],
      create,
    );

    expect(created).toEqual([{ name: "Projects", parent: undefined }]);
    expect(result.mapping).toEqual({ "INBOX.Projects": "tok_1" });
  });

  it("reuses existing folders only under the same parent", async () => {
    const existing: ExistingFolder[] = [
      { folder_token: "old_fin", name: "finances", parent_token: null },
      { folder_token: "old_misc", name: "Misc", parent_token: "old_fin" },
      { folder_token: "sys", name: "Work", is_system: true },
    ];
    const { created, create } = recorder();
    const result = await mirror_folder_tree(
      [
        folder("Finances"),
        folder("Finances/Misc"),
        folder("Work"),
        folder("Work/Misc"),
      ],
      existing,
      create,
    );

    expect(result.mapping.Finances).toBe("old_fin");
    expect(result.mapping["Finances/Misc"]).toBe("old_misc");
    expect(created).toEqual([
      { name: "Work", parent: undefined },
      { name: "Misc", parent: "tok_1" },
    ]);
  });

  it("skips a branch whose parent could not be created", async () => {
    const create = async (name: string) =>
      name === "Broken" ? null : `t_${name}`;
    const result = await mirror_folder_tree(
      [folder("Broken"), folder("Broken/Child"), folder("Fine")],
      [],
      create,
    );

    expect(result.mapping).toEqual({ Fine: "t_Fine" });
    expect(result.failures).toBe(2);
  });
});
