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
vi.mock("@/hooks/mail_events", () => ({
  emit_folders_changed: vi.fn(),
  emit_tags_changed: vi.fn(),
}));
vi.mock("@/hooks/use_tags", () => ({
  decrypt_tag: vi.fn(async (tag: { tag_token: string; name: string }) => ({
    tag_token: tag.tag_token,
    name: tag.name,
  })),
  encrypt_tag_field: vi.fn(async (name: string) => ({
    encrypted: name,
    nonce: "n",
  })),
  generate_tag_token: vi.fn(),
}));
vi.mock("@/services/api/tags", () => ({
  create_tag: vi.fn(),
  list_tags: vi.fn(),
}));
vi.mock("@/services/api/request_cache", () => ({
  request_cache: { invalidate: vi.fn() },
}));

import { generate_tag_token } from "@/hooks/use_tags";
import { create_tag, list_tags } from "@/services/api/tags";
import {
  decode_modified_utf7,
  mirror_folder_tree,
  mirror_source_labels,
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

  it("creates decoded names but keeps raw names as mapping keys", async () => {
    const { created, create } = recorder();
    const result = await mirror_folder_tree(
      [folder("Clientes"), folder("Clientes/Ag&AOo-ncia")],
      [],
      create,
    );

    expect(created).toEqual([
      { name: "Clientes", parent: undefined },
      { name: "Agência", parent: "tok_1" },
    ]);
    expect(result.mapping).toEqual({
      Clientes: "tok_1",
      "Clientes/Ag&AOo-ncia": "tok_2",
    });
  });
});

describe("mirror_folder_tree depth cap", () => {
  it("folds levels past the cap into the deepest allowed name", async () => {
    const { created, create } = recorder();
    const result = await mirror_folder_tree(
      [folder("A/B/C/D/E")],
      [],
      create,
      () => false,
      4,
    );

    expect(created.map((c) => c.name)).toEqual(["A", "B", "C", "D/E"]);
    expect(result.mapping).toEqual({ "A/B/C/D/E": "tok_4" });
  });
});

describe("mirror_source_labels", () => {
  it("reuses existing labels and creates the missing ones", async () => {
    let next = 0;

    vi.mocked(generate_tag_token).mockImplementation(() => `tag_${++next}`);
    vi.mocked(list_tags).mockResolvedValue({
      data: {
        tags: [{ tag_token: "old_work", name: "Work" }],
        total: 1,
        has_more: false,
      },
    } as never);
    vi.mocked(create_tag).mockResolvedValue({ data: {} } as never);

    const mapping = await mirror_source_labels(
      [folder("Work"), folder("Work/Clients"), folder("Receipts")],
      "key",
    );

    expect(mapping).toEqual({
      Work: "old_work",
      Receipts: "tag_1",
      "Work/Clients": "tag_2",
    });
    expect(vi.mocked(create_tag).mock.calls[1][0]).toMatchObject({
      tag_token: "tag_2",
      parent_token: "old_work",
    });
  });

  it("stops creating labels once the plan limit is reached", async () => {
    vi.mocked(create_tag).mockClear();
    vi.mocked(list_tags).mockResolvedValue({
      data: { tags: [], total: 0, has_more: false },
    } as never);
    vi.mocked(create_tag).mockResolvedValue({
      error: "limit",
      server_code: "PLAN_LIMIT_EXCEEDED",
    } as never);

    const mapping = await mirror_source_labels(
      [folder("One"), folder("Two"), folder("Three")],
      "key",
    );

    expect(mapping).toEqual({});
    expect(create_tag).toHaveBeenCalledTimes(1);
  });
});

describe("decode_modified_utf7", () => {
  it("decodes accented names", () => {
    expect(decode_modified_utf7("Ag&AOo-ncia")).toBe("Agência");
    expect(decode_modified_utf7("Associa&AOcA4w-o")).toBe("Associação");
    expect(decode_modified_utf7("BALC&AMM-O AUTOM&ANM-VEL")).toBe(
      "BALCÃO AUTOMÓVEL",
    );
  });

  it("decodes characters outside the basic plane and the escaped ampersand", () => {
    expect(decode_modified_utf7("&2D3eAQ-")).toBe("\u{1F601}");
    expect(decode_modified_utf7("R&-D")).toBe("R&D");
  });

  it("leaves plain and malformed names unchanged", () => {
    expect(decode_modified_utf7("Finances")).toBe("Finances");
    expect(decode_modified_utf7("Bad&AOo")).toBe("Bad&AOo");
  });
});
