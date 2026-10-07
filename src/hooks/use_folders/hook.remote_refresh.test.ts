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

import { MAIL_EVENTS } from "@/hooks/mail_events";

import type { UseFoldersReturn } from "./types";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ONE_FOLDER = { data: { folders: [{ id: "f1" }], total: 1 } };
const TWO_FOLDERS = {
  data: { folders: [{ id: "f1" }, { id: "f2" }], total: 2 },
};

const REFETCH_SETTLE_MS = 400;

let root: Root;
let container: HTMLDivElement;
let probe: UseFoldersReturn;

function Probe() {
  probe = use_folders();

  return null;
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
}

async function announce(event: string) {
  await act(async () => {
    window.dispatchEvent(new CustomEvent(event));
    await vi.advanceTimersByTimeAsync(REFETCH_SETTLE_MS);
  });
}

describe("use_folders remote refresh", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    mocks.list_folders.mockReset();
    mocks.decrypt_folder.mockReset();
    mocks.decrypt_folder.mockImplementation(async (folder: { id: string }) => ({
      id: folder.id,
      folder_token: `token_${folder.id}`,
      name: `name_${folder.id}`,
    }));
    mocks.list_folders.mockResolvedValue(ONE_FOLDER);
    clear_folders_cache();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(Probe));
    });
    await act(async () => {
      await probe.fetch_folders();
    });
    await settle();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("replaces the cached list when the server reports a change", async () => {
    expect(probe.state.folders).toHaveLength(1);

    const calls = mocks.list_folders.mock.calls.length;

    mocks.list_folders.mockResolvedValue(TWO_FOLDERS);
    await announce(MAIL_EVENTS.FOLDERS_CHANGED);

    expect(mocks.list_folders.mock.calls.length).toBeGreaterThan(calls);
    expect(probe.state.folders).toHaveLength(2);
  });

  it("replaces the cached list when definitions go stale", async () => {
    const calls = mocks.list_folders.mock.calls.length;

    mocks.list_folders.mockResolvedValue(TWO_FOLDERS);
    await announce(MAIL_EVENTS.DEFINITIONS_STALE);

    expect(mocks.list_folders.mock.calls.length).toBeGreaterThan(calls);
    expect(probe.state.folders).toHaveLength(2);
  });

  it("fetches once for a burst of change reports", async () => {
    const calls = mocks.list_folders.mock.calls.length;

    await act(async () => {
      for (let index = 0; index < 5; index += 1) {
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.FOLDERS_CHANGED));
        await vi.advanceTimersByTimeAsync(100);
      }
      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.DEFINITIONS_STALE));
    });

    expect(mocks.list_folders).toHaveBeenCalledTimes(calls);

    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFETCH_SETTLE_MS);
    });

    expect(mocks.list_folders).toHaveBeenCalledTimes(calls + 1);
  });

  it("drops a pending refetch when the hook unmounts", async () => {
    const calls = mocks.list_folders.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.FOLDERS_CHANGED));
    });
    await act(async () => {
      root.render(null);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFETCH_SETTLE_MS);
    });

    expect(mocks.list_folders).toHaveBeenCalledTimes(calls);
  });

  it("stops listening once the hook unmounts", async () => {
    await act(async () => {
      root.render(null);
    });

    const calls = mocks.list_folders.mock.calls.length;

    await announce(MAIL_EVENTS.DEFINITIONS_STALE);
    await announce(MAIL_EVENTS.FOLDERS_CHANGED);

    expect(mocks.list_folders).toHaveBeenCalledTimes(calls);
  });
});
