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
      duplicate = await latest!.create_new_folder("Work", undefined, "parent_a");
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
