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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mocks = vi.hoisted(() => ({
  list_folders: vi.fn(),
  decrypt_folder: vi.fn(),
}));

vi.mock("@/services/api/folders", () => ({
  list_folders: mocks.list_folders,
  list_all_folders: mocks.list_folders,
  create_folder: vi.fn(),
  update_folder: vi.fn(),
  delete_folder: vi.fn(),
  bulk_reorder_folders: vi.fn(),
  get_folder_counts: vi.fn(async () => ({ data: { counts: [] } })),
}));

vi.mock("@/services/api/mail", () => ({
  add_mail_item_folder: vi.fn(),
  remove_mail_item_folder: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ identity_key: "identity" }),
  has_passphrase_in_memory: () => true,
  on_keys_ready: () => () => {},
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth_safe: () => ({ user: { id: "user_1" } }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("./crypto", () => ({
  build_undecryptable_folder: (folder: { id: string }, name: string) => ({
    id: folder.id,
    folder_token: `token_${folder.id}`,
    name,
  }),
  decrypt_folder: mocks.decrypt_folder,
  encrypt_folder_field: vi.fn(),
  generate_folder_token: vi.fn(),
}));

import { clear_folders_cache } from "./cache";
import { use_folders } from "./hook";

import type { UseFoldersReturn } from "./types";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const FAILED = { error: "failed" };
const EMPTY_LIST = { data: { folders: [], total: 0 } };
const ONE_FOLDER = { data: { folders: [{ id: "f1" }], total: 1 } };

let root: Root;
let container: HTMLDivElement;
let first: UseFoldersReturn;
let second: UseFoldersReturn;

function Probe() {
  first = use_folders();
  second = use_folders();

  return null;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("use_folders load retry", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    mocks.list_folders.mockReset();
    mocks.decrypt_folder.mockReset();
    clear_folders_cache();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(Probe));
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("clears the error when a background retry succeeds", async () => {
    mocks.list_folders
      .mockResolvedValueOnce(FAILED)
      .mockResolvedValueOnce(FAILED)
      .mockResolvedValueOnce(FAILED)
      .mockResolvedValueOnce(FAILED)
      .mockResolvedValue(EMPTY_LIST);

    await act(async () => {
      void first.fetch_folders();
    });
    await advance(4_600);

    expect(first.state.error).toBe("common.failed_to_fetch_folders");
    expect(first.state.is_loading).toBe(false);

    await advance(8_000);

    expect(mocks.list_folders).toHaveBeenCalledTimes(5);
    expect(first.state.error).toBeNull();
    expect(first.state.folders).toEqual([]);
  });

  it("clears another instance's error once any instance loads", async () => {
    mocks.list_folders.mockResolvedValue(FAILED);

    await act(async () => {
      void first.fetch_folders();
    });
    await advance(4_600);

    expect(first.state.error).toBe("common.failed_to_fetch_folders");

    mocks.list_folders.mockResolvedValue(EMPTY_LIST);

    await act(async () => {
      await second.fetch_folders();
    });

    expect(second.state.error).toBeNull();
    expect(first.state.error).toBeNull();
  });

  it("recovers once folders decrypt on a background retry", async () => {
    mocks.list_folders.mockResolvedValue(ONE_FOLDER);
    mocks.decrypt_folder.mockResolvedValue(null);

    await act(async () => {
      void first.fetch_folders();
    });
    await advance(4_600);

    expect(first.state.error).toBeNull();
    expect(first.state.is_loading).toBe(false);
    expect(first.state.folders.map((f) => f.name)).toEqual([
      "common.unable_to_decrypt",
    ]);

    mocks.decrypt_folder.mockResolvedValue({ id: "f1", name: "Work" });
    await advance(8_000);

    expect(first.state.error).toBeNull();
    expect(first.state.folders.map((f) => f.name)).toEqual(["Work"]);
  });

  it("loads at once when only system folder names are unreadable", async () => {
    mocks.list_folders.mockResolvedValue({
      data: {
        folders: [
          { id: "s1", is_system: true, folder_type: "inbox" },
          { id: "s2", is_system: false, folder_type: "trash" },
        ],
        total: 2,
      },
    });
    mocks.decrypt_folder.mockResolvedValue(null);

    await act(async () => {
      await first.fetch_folders();
    });

    expect(mocks.list_folders).toHaveBeenCalledTimes(1);
    expect(first.state.error).toBeNull();
    expect(first.state.is_loading).toBe(false);
    expect(first.state.folders).toHaveLength(2);

    await advance(80_000);

    expect(mocks.list_folders).toHaveBeenCalledTimes(1);
  });

  it("keeps retrying a failed fetch until the list loads", async () => {
    mocks.list_folders.mockResolvedValue(FAILED);

    await act(async () => {
      void first.fetch_folders();
    });
    await advance(4_600 + 73_000);

    expect(mocks.list_folders).toHaveBeenCalledTimes(7);
    expect(first.state.error).toBe("common.failed_to_fetch_folders");

    await advance(60_000);

    expect(mocks.list_folders).toHaveBeenCalledTimes(8);

    mocks.list_folders.mockResolvedValue(ONE_FOLDER);
    mocks.decrypt_folder.mockResolvedValue({ id: "f1", name: "Work" });
    await advance(60_000);

    expect(first.state.error).toBeNull();
    expect(first.state.folders.map((f) => f.name)).toEqual(["Work"]);

    const calls = mocks.list_folders.mock.calls.length;

    await advance(180_000);

    expect(mocks.list_folders).toHaveBeenCalledTimes(calls);
  });

  it("waits for the connection before retrying a failed fetch", async () => {
    mocks.list_folders.mockResolvedValue(FAILED);

    await act(async () => {
      void first.fetch_folders();
    });
    await advance(4_600 + 73_000);

    const calls = mocks.list_folders.mock.calls.length;
    const on_line = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    await advance(180_000);

    expect(mocks.list_folders).toHaveBeenCalledTimes(calls);

    on_line.mockRestore();
    await advance(60_000);

    expect(mocks.list_folders).toHaveBeenCalledTimes(calls + 1);
  });

  it("stops polling once the folders are listed as unreadable", async () => {
    mocks.list_folders.mockResolvedValue(ONE_FOLDER);
    mocks.decrypt_folder.mockResolvedValue(null);

    await act(async () => {
      void first.fetch_folders();
    });
    await advance(4_600 + 73_000);

    const calls = mocks.list_folders.mock.calls.length;

    await advance(300_000);

    expect(mocks.list_folders).toHaveBeenCalledTimes(calls);
    expect(first.state.error).toBeNull();
  });

  it("loads again when the connection returns", async () => {
    mocks.list_folders.mockResolvedValue(FAILED);

    await act(async () => {
      void first.fetch_folders();
    });
    await advance(4_600);

    expect(first.state.error).toBe("common.failed_to_fetch_folders");

    mocks.list_folders.mockResolvedValue(EMPTY_LIST);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await advance(0);

    expect(first.state.error).toBeNull();
    expect(second.state.error).toBeNull();
  });

  it("stops retrying after the hook unmounts", async () => {
    mocks.list_folders.mockResolvedValue(FAILED);

    await act(async () => {
      void first.fetch_folders();
    });
    await advance(4_600);

    const calls = mocks.list_folders.mock.calls.length;

    await act(async () => {
      root.render(null);
    });
    await advance(80_000);

    expect(mocks.list_folders).toHaveBeenCalledTimes(calls);
  });
});
