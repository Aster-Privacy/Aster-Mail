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
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const hoisted = vi.hoisted(() => ({
  list_folders: vi.fn(async (..._args: unknown[]) => ({
    data: null,
    error: "offline",
  })),
  create_folder: vi.fn(async (..._args: unknown[]) => ({
    data: { id: "created_id", folder_token: "created_token", success: true },
    error: null,
  })),
  update_folder: vi.fn(async (..._args: unknown[]) => ({
    data: { status: "updated" },
    error: null,
  })),
  bulk_reorder_folders: vi.fn(async (..._args: unknown[]) => ({
    data: { updated: 2 },
    error: null,
  })),
  get_folder_counts: vi.fn(async () => ({
    data: { counts: [] },
    error: null,
  })),
}));

vi.mock("@/services/api/folders", () => ({
  list_folders: (...args: unknown[]) => hoisted.list_folders(...args),
  create_folder: (...args: unknown[]) => hoisted.create_folder(...args),
  update_folder: (...args: unknown[]) => hoisted.update_folder(...args),
  delete_folder: vi.fn(),
  bulk_reorder_folders: (...args: unknown[]) =>
    hoisted.bulk_reorder_folders(...args),
  get_folder_counts: () => hoisted.get_folder_counts(),
}));

vi.mock("@/services/api/mail", () => ({
  add_mail_item_folder: vi.fn(),
  remove_mail_item_folder: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ identity_key: "test-identity-key" }),
  has_passphrase_in_memory: () => true,
  on_keys_ready: (callback: () => void) => {
    callback();

    return () => {};
  },
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth_safe: () => ({ user: { id: "u1" } }),
}));

vi.mock("@/lib/i18n/context", () => {
  const stable_t = (k: string) => k;
  const i18n = { t: stable_t };

  return {
    use_i18n: () => i18n,
  };
});

import {
  use_folders,
  build_folder_tree,
  clear_folders_cache,
} from "./use_folders";

type HookReturn = ReturnType<typeof use_folders>;

let latest: HookReturn | null = null;

function Harness() {
  latest = use_folders();

  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root!.render(createElement(Harness));
  });
}

describe("folder create and reorder flows", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clear_folders_cache();
    let creation = 0;

    hoisted.create_folder.mockImplementation(async () => ({
      data: {
        id: `created_id_${creation}`,
        folder_token: `created_token_${creation++}`,
        success: true,
      },
      error: null,
    }));
    await mount();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    latest = null;
  });

  it("creates a subfolder with an encrypted name and the parent token", async () => {
    let result:
      | Awaited<ReturnType<HookReturn["create_new_folder"]>>
      | undefined;

    await act(async () => {
      result = await latest!.create_new_folder(
        "Receipts",
        "#3b82f6",
        "parent_tok",
      );
    });

    expect(result?.folder).not.toBeNull();
    expect(hoisted.create_folder).toHaveBeenCalledTimes(1);

    const request = hoisted.create_folder.mock.calls[0][0] as unknown as {
      parent_token?: string;
      encrypted_name: string;
      name_nonce: string;
      folder_token: string;
    };

    expect(request.parent_token).toBe("parent_tok");
    expect(request.folder_token.length).toBeGreaterThan(0);
    expect(request.encrypted_name.length).toBeGreaterThan(0);
    expect(request.name_nonce.length).toBeGreaterThan(0);
    expect(request.encrypted_name).not.toContain("Receipts");

    const created = latest!.state.folders.find((f) => f.name === "Receipts");

    expect(created?.parent_token).toBe("parent_tok");
  });

  it("rejects duplicate names under the same parent but allows them under different parents", async () => {
    await act(async () => {
      await latest!.create_new_folder("Work", undefined, "parent_a");
    });

    let duplicate:
      | Awaited<ReturnType<HookReturn["create_new_folder"]>>
      | undefined;
    let sibling_ok:
      | Awaited<ReturnType<HookReturn["create_new_folder"]>>
      | undefined;

    await act(async () => {
      duplicate = await latest!.create_new_folder(
        "Work",
        undefined,
        "parent_a",
      );
      sibling_ok = await latest!.create_new_folder(
        "Work",
        undefined,
        "parent_b",
      );
    });

    expect(duplicate?.code).toBe("DUPLICATE");
    expect(duplicate?.folder).toBeNull();
    expect(sibling_ok?.folder).not.toBeNull();
  });

  it("persists a reorder and re-sorts the folder tree", async () => {
    await act(async () => {
      await latest!.create_new_folder("First");
      await latest!.create_new_folder("Second");
    });

    const first = latest!.state.folders.find((f) => f.name === "First")!;
    const second = latest!.state.folders.find((f) => f.name === "Second")!;
    const entries = [
      { id: second.id, sort_order: 0 },
      { id: first.id, sort_order: 1 },
    ];
    let ok: boolean | undefined;

    await act(async () => {
      ok = await latest!.reorder_folders(entries);
    });

    expect(ok).toBe(true);
    expect(hoisted.bulk_reorder_folders).toHaveBeenCalledWith(entries);

    const tree = build_folder_tree(latest!.state.folders);

    expect(tree.map((n) => n.folder.name)).toEqual(["Second", "First"]);
  });

  it("rolls the order back when the reorder request fails", async () => {
    await act(async () => {
      await latest!.create_new_folder("First");
      await latest!.create_new_folder("Second");
    });

    hoisted.bulk_reorder_folders.mockResolvedValueOnce({
      data: null,
      error: "boom",
    } as never);

    const first = latest!.state.folders.find((f) => f.name === "First")!;
    const second = latest!.state.folders.find((f) => f.name === "Second")!;
    let ok: boolean | undefined;

    await act(async () => {
      ok = await latest!.reorder_folders([
        { id: second.id, sort_order: 0 },
        { id: first.id, sort_order: 1 },
      ]);
    });

    expect(ok).toBe(false);

    const tree = build_folder_tree(latest!.state.folders);

    expect(tree.map((n) => n.folder.name)).toEqual(["First", "Second"]);
  });
});

describe("folder sort A to Z flows", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clear_folders_cache();
    let creation = 0;

    hoisted.create_folder.mockImplementation(async () => ({
      data: {
        id: `created_id_${creation}`,
        folder_token: `created_token_${creation++}`,
        success: true,
      },
      error: null,
    }));
    await mount();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    latest = null;
  });

  function by_name(name: string) {
    return latest!.state.folders.find((f) => f.name === name)!;
  }

  function root_names(): string[] {
    return build_folder_tree(latest!.state.folders).map((n) => n.folder.name);
  }

  function create_request(index: number) {
    return hoisted.create_folder.mock.calls[index][0] as unknown as {
      sort_order?: number;
    };
  }

  async function create_all(...names: string[]) {
    await act(async () => {
      for (const name of names) {
        await latest!.create_new_folder(name);
      }
    });
  }

  async function hand_order(...names: string[]) {
    await act(async () => {
      await latest!.reorder_folders(
        names.map((name, index) => ({ id: by_name(name).id, sort_order: index })),
      );
    });
    hoisted.bulk_reorder_folders.mockClear();
  }

  it("places a new folder alphabetically when the list is sorted", async () => {
    await create_all("Charlie", "Alpha", "Bravo");

    expect(create_request(0).sort_order).toBe(0);
    expect(create_request(1).sort_order).toBe(0);
    expect(create_request(2).sort_order).toBe(1);
    expect(hoisted.bulk_reorder_folders).toHaveBeenNthCalledWith(1, [
      { id: by_name("Charlie").id, sort_order: 1 },
    ]);
    expect(hoisted.bulk_reorder_folders).toHaveBeenNthCalledWith(2, [
      { id: by_name("Charlie").id, sort_order: 2 },
    ]);
    expect(root_names()).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("appends a new folder to a hand-ordered list without reordering", async () => {
    await create_all("Alpha", "Bravo");
    await hand_order("Bravo", "Alpha");
    await create_all("Charlie");

    expect(create_request(2).sort_order).toBe(2);
    expect(hoisted.bulk_reorder_folders).not.toHaveBeenCalled();
    expect(root_names()).toEqual(["Bravo", "Alpha", "Charlie"]);
  });

  it("appends imported folders without sending a reorder per folder", async () => {
    await create_all("Bravo");
    hoisted.bulk_reorder_folders.mockClear();

    await act(async () => {
      await latest!.create_new_folder("Alpha", undefined, undefined, {
        append: true,
      });
    });

    expect(create_request(1).sort_order).toBe(1);
    expect(hoisted.bulk_reorder_folders).not.toHaveBeenCalled();
  });

  it("gives back-to-back imported folders increasing positions", async () => {
    await act(async () => {
      for (const name of ["Zulu", "Mike", "Alpha"]) {
        await latest!.create_new_folder(name, undefined, undefined, {
          append: true,
        });
      }
    });

    expect([0, 1, 2].map((i) => create_request(i).sort_order)).toEqual([
      0, 1, 2,
    ]);
    expect(root_names()).toEqual(["Zulu", "Mike", "Alpha"]);
  });

  it("sorts the whole tree A to Z in one request", async () => {
    await create_all("Alpha", "Bravo", "Charlie");
    await hand_order("Charlie", "Alpha", "Bravo");

    let ok: boolean | undefined;

    await act(async () => {
      ok = await latest!.sort_folders_a_z();
    });

    expect(ok).toBe(true);
    expect(hoisted.bulk_reorder_folders).toHaveBeenCalledTimes(1);
    expect(hoisted.bulk_reorder_folders).toHaveBeenCalledWith([
      { id: by_name("Alpha").id, sort_order: 0 },
      { id: by_name("Bravo").id, sort_order: 1 },
      { id: by_name("Charlie").id, sort_order: 2 },
    ]);
    expect(root_names()).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("does not call the server when the tree is already sorted", async () => {
    await create_all("Alpha", "Bravo");
    hoisted.bulk_reorder_folders.mockClear();

    let ok: boolean | undefined;

    await act(async () => {
      ok = await latest!.sort_folders_a_z();
    });

    expect(ok).toBe(true);
    expect(hoisted.bulk_reorder_folders).not.toHaveBeenCalled();
  });

  it("restores only the touched folders when sorting fails", async () => {
    await create_all("Alpha", "Bravo", "Charlie");
    await hand_order("Charlie", "Alpha", "Bravo");

    hoisted.bulk_reorder_folders.mockResolvedValueOnce({
      data: null,
      error: "boom",
    } as never);

    let ok: boolean | undefined;

    await act(async () => {
      ok = await latest!.sort_folders_a_z();
    });

    expect(ok).toBe(false);
    expect(root_names()).toEqual(["Charlie", "Alpha", "Bravo"]);
    expect(latest!.state.folders).toHaveLength(3);
  });

  it("restores the order when the reorder request throws", async () => {
    await create_all("Alpha", "Bravo");
    await hand_order("Bravo", "Alpha");

    hoisted.bulk_reorder_folders.mockRejectedValueOnce(new Error("offline"));

    let ok: boolean | undefined;

    await act(async () => {
      ok = await latest!.sort_folders_a_z();
    });

    expect(ok).toBe(false);
    expect(root_names()).toEqual(["Bravo", "Alpha"]);
  });

  it("keeps a sorted list sorted after a rename", async () => {
    await create_all("Alpha", "Bravo", "Charlie");
    hoisted.bulk_reorder_folders.mockClear();

    await act(async () => {
      await latest!.update_existing_folder(by_name("Alpha").id, "Delta");
    });

    expect(hoisted.bulk_reorder_folders).toHaveBeenCalledTimes(1);
    expect(root_names()).toEqual(["Bravo", "Charlie", "Delta"]);
  });

  it("leaves a hand-ordered list alone after a rename", async () => {
    await create_all("Alpha", "Bravo");
    await hand_order("Bravo", "Alpha");

    await act(async () => {
      await latest!.update_existing_folder(by_name("Bravo").id, "Zulu");
    });

    expect(hoisted.bulk_reorder_folders).not.toHaveBeenCalled();
    expect(root_names()).toEqual(["Zulu", "Alpha"]);
  });

  it("does not reorder when only the color changes", async () => {
    await create_all("Alpha", "Bravo");
    hoisted.bulk_reorder_folders.mockClear();

    await act(async () => {
      await latest!.update_existing_folder(
        by_name("Alpha").id,
        undefined,
        "#ff0000",
      );
    });

    expect(hoisted.bulk_reorder_folders).not.toHaveBeenCalled();
  });

  it("places a moved folder alphabetically among its new siblings", async () => {
    await create_all("Parent", "Alpha", "Zed");

    const parent_token = by_name("Parent").folder_token;

    await act(async () => {
      await latest!.create_new_folder("Mike", undefined, parent_token);
    });
    hoisted.bulk_reorder_folders.mockClear();

    await act(async () => {
      await latest!.update_existing_folder(
        by_name("Zed").id,
        undefined,
        undefined,
        undefined,
        parent_token,
      );
    });
    await act(async () => {
      await latest!.update_existing_folder(
        by_name("Alpha").id,
        undefined,
        undefined,
        undefined,
        parent_token,
      );
    });

    const tree = build_folder_tree(latest!.state.folders);

    expect(tree.map((n) => n.folder.name)).toEqual(["Parent"]);
    expect(tree[0].children.map((n) => n.folder.name)).toEqual([
      "Alpha",
      "Mike",
      "Zed",
    ]);
  });
});
