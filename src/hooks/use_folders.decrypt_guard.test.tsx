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
    data: {
      folders: [
        {
          id: "f1",
          folder_token: "tok1",
          encrypted_name: "AAAA",
          name_nonce: "BBBB",
          is_system: false,
          folder_type: "custom",
          sort_order: 0,
        },
      ],
      total: 1,
    },
    error: null,
  })),
  get_folder_counts: vi.fn(async () => ({ data: { counts: [] }, error: null })),
}));

vi.mock("@/services/api/folders", () => ({
  list_folders: (...args: unknown[]) => hoisted.list_folders(...args),
  create_folder: vi.fn(),
  update_folder: vi.fn(),
  delete_folder: vi.fn(),
  bulk_reorder_folders: vi.fn(),
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
  decrypt_aes_gcm_with_fallback: vi.fn(async () => {
    throw new Error("bad key");
  }),
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

import { use_folders, clear_folders_cache } from "./use_folders";

type HookReturn = ReturnType<typeof use_folders>;

let latest: HookReturn | null = null;

function Harness() {
  latest = use_folders();

  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("folder decryption failure on a cold cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clear_folders_cache();
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

  it("reports an error instead of an empty folder list", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(createElement(Harness));
    });

    await act(async () => {
      await latest!.fetch_folders();
    });

    expect(latest!.state.error).toBe("common.failed_to_fetch_folders");
    expect(latest!.state.folders).toHaveLength(0);
  });
});
