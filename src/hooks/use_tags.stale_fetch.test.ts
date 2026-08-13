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

const mocks = vi.hoisted(() => {
  const resolvers: Array<(names: string[]) => void> = [];

  return {
    resolvers,
    list_tags: vi.fn(
      () =>
        new Promise((resolve) => {
          resolvers.push((names: string[]) =>
            resolve({
              data: {
                tags: names.map((name, index) => ({
                  id: name,
                  tag_token: name,
                  encrypted_name: Buffer.from(name).toString("base64"),
                  name_nonce: "AAAAAAAAAAAAAAAA",
                  sort_order: index,
                  created_at: "2026-01-01T00:00:00Z",
                  updated_at: "2026-01-01T00:00:00Z",
                })),
                total: names.length,
              },
              error: null,
            }),
          );
        }),
    ),
  };
});

vi.mock("@/services/api/tags", () => ({
  list_tags: mocks.list_tags,
  create_tag: vi.fn(),
  update_tag: vi.fn(),
  delete_tag: vi.fn(),
  get_tag_counts: vi.fn(async () => ({ data: { counts: {} }, error: null })),
  add_tag_to_item: vi.fn(),
  remove_tag_from_item: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ identity_key: "identity" }),
  has_passphrase_in_memory: () => true,
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: async (
    _key: CryptoKey,
    encrypted: Uint8Array,
  ) => encrypted,
}));

vi.mock("@/contexts/auth_context", () => {
  const auth = { user: { id: "user-1" } };

  return { use_auth_safe: () => auth };
});

vi.mock("@/lib/i18n/context", () => {
  const i18n = { t: (key: string) => key };

  return { use_i18n: () => i18n };
});

import { use_tags, clear_tags_cache } from "@/hooks/use_tags";

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  });
}

describe("use_tags stale fetch", () => {
  let container: HTMLDivElement;
  let root: Root;
  let names: string[];
  let fetch_tags: () => Promise<void>;

  async function settle(value: string[]): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const pending = mocks.resolvers.splice(0);

      if (pending.length > 0) {
        await act(async () => {
          pending.forEach((resolve) => resolve(value));
        });
      }

      await flush();

      if (pending.length === 0 && mocks.resolvers.length === 0) return;
    }
  }

  beforeEach(async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    mocks.list_tags.mockClear();
    mocks.resolvers.length = 0;
    clear_tags_cache();
    names = [];

    function Probe() {
      const result = use_tags();

      names = result.state.tags.map((tag) => tag.name);
      fetch_tags = result.fetch_tags;

      return null;
    }

    container = document.createElement("div");

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(Probe));
    });

    await flush();
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.clearAllMocks();
  });

  it("keeps the newest result when an older request resolves last", async () => {
    mocks.resolvers.length = 0;

    await act(async () => {
      void fetch_tags();
    });
    await act(async () => {
      void fetch_tags();
    });

    expect(mocks.resolvers.length).toBe(2);

    const [resolve_old, resolve_new] = mocks.resolvers;

    await act(async () => {
      resolve_new(["fresh"]);
    });
    await flush();

    expect(names).toEqual(["fresh"]);

    await act(async () => {
      resolve_old(["stale"]);
    });
    await flush();

    expect(names).toEqual(["fresh"]);
  });

  it("does not seed a later mount with the previous account's labels", async () => {
    mocks.resolvers.length = 0;

    await act(async () => {
      void fetch_tags();
    });

    await settle(["private_label"]);

    expect(names).toEqual(["private_label"]);

    act(() => root.unmount());

    clear_tags_cache();

    names = [];
    mocks.resolvers.length = 0;

    function Probe() {
      names = use_tags().state.tags.map((tag) => tag.name);

      return null;
    }

    const next_container = document.createElement("div");
    let next_root!: Root;

    await act(async () => {
      next_root = createRoot(next_container);
      next_root.render(createElement(Probe));
    });

    expect(names).toEqual([]);

    act(() => next_root.unmount());

    root = createRoot(container);
  });
});
