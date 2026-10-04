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

const UNREADABLE_PREFIX = "unreadable";

const mocks = vi.hoisted(() => ({
  server_names: [] as string[],
  list_tags: vi.fn(),
  create_tag: vi.fn(),
  update_tag: vi.fn(),
}));

vi.mock("@/services/api/tags", () => ({
  list_tags: mocks.list_tags,
  create_tag: mocks.create_tag,
  update_tag: mocks.update_tag,
  delete_tag: vi.fn(),
  get_tag_counts: vi.fn(async () => ({ data: { counts: [] }, error: null })),
  add_tag_to_item: vi.fn(),
  remove_tag_from_item: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ identity_key: "identity" }),
  has_passphrase_in_memory: () => true,
  on_keys_ready: () => () => {},
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: async (
    _key: CryptoKey,
    encrypted: Uint8Array,
  ) => {
    if (new TextDecoder().decode(encrypted).startsWith("unreadable")) {
      throw new Error("decrypt failed");
    }

    return encrypted;
  },
}));

vi.mock("@/contexts/auth_context", () => {
  const auth = { user: { id: "user-1" } };

  return { use_auth_safe: () => auth };
});

vi.mock("@/lib/i18n/context", () => {
  const i18n = { t: (key: string) => key };

  return { use_i18n: () => i18n };
});

import {
  use_tags,
  clear_tags_cache,
  build_undecryptable_tag,
  type DecryptedTag,
} from "@/hooks/use_tags";

function server_tag(name: string, index: number) {
  return {
    id: `id-${name}`,
    tag_token: `token-${name}`,
    encrypted_name: Buffer.from(name).toString("base64"),
    name_nonce: "AAAAAAAAAAAAAAAA",
    sort_order: index,
    item_count: index + 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  });
}

describe("use_tags undecryptable labels", () => {
  let container: HTMLDivElement;
  let root: Root;
  let tags: DecryptedTag[];
  let fetch_tags: () => Promise<void>;
  let create_new_tag: (name: string) => Promise<DecryptedTag | null>;
  let update_existing_tag: ReturnType<typeof use_tags>["update_existing_tag"];

  async function load(names: string[]): Promise<void> {
    mocks.server_names = names;

    await act(async () => {
      await fetch_tags();
    });
    await flush();
  }

  beforeEach(async () => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    clear_tags_cache();
    tags = [];
    mocks.server_names = [];
    mocks.list_tags.mockImplementation(async () => ({
      data: {
        tags: mocks.server_names.map(server_tag),
        total: mocks.server_names.length,
        has_more: false,
      },
      error: null,
    }));
    mocks.create_tag.mockImplementation(
      async (request: { tag_token: string }) => ({
        data: { id: "created", tag_token: request.tag_token, success: true },
        error: null,
      }),
    );
    mocks.update_tag.mockImplementation(async () => ({
      data: { success: true },
      error: null,
    }));

    function Probe() {
      const result = use_tags();

      tags = result.state.tags;
      fetch_tags = result.fetch_tags;
      create_new_tag = result.create_new_tag;
      update_existing_tag = result.update_existing_tag;

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

  it("keeps a label whose name cannot be decrypted and marks it", async () => {
    await load(["work", `${UNREADABLE_PREFIX}-one`, "travel"]);

    expect(tags.map((tag) => tag.name)).toEqual([
      "work",
      "common.label_unable_to_decrypt",
      "travel",
    ]);
    expect(tags.map((tag) => tag.is_undecryptable === true)).toEqual([
      false,
      true,
      false,
    ]);
    expect(tags[1].tag_token).toBe(`token-${UNREADABLE_PREFIX}-one`);
    expect(tags[1].item_count).toBe(2);
  });

  it("shows every label as unreadable when none decrypt and nothing is cached", async () => {
    await load([`${UNREADABLE_PREFIX}-one`, `${UNREADABLE_PREFIX}-two`]);

    expect(tags).toHaveLength(2);
    expect(tags.every((tag) => tag.is_undecryptable)).toBe(true);
  });

  it("does not let an unreadable label block a new label with the placeholder name", async () => {
    await load([`${UNREADABLE_PREFIX}-one`]);

    let created: DecryptedTag | null = null;

    await act(async () => {
      created = await create_new_tag("common.label_unable_to_decrypt");
    });

    expect(created).not.toBeNull();
    expect(mocks.create_tag).toHaveBeenCalledTimes(1);
  });

  it("refuses to rename an unreadable label without calling the server", async () => {
    await load([`${UNREADABLE_PREFIX}-one`]);

    let renamed = true;

    await act(async () => {
      renamed = await update_existing_tag(
        `id-${UNREADABLE_PREFIX}-one`,
        "common.label_unable_to_decrypt",
        "#ff0000",
      );
    });

    expect(renamed).toBe(false);
    expect(mocks.update_tag).not.toHaveBeenCalled();
    expect(tags[0].is_undecryptable).toBe(true);
  });

  it("still changes the color and icon of an unreadable label", async () => {
    await load([`${UNREADABLE_PREFIX}-one`]);

    let updated = false;

    await act(async () => {
      updated = await update_existing_tag(
        `id-${UNREADABLE_PREFIX}-one`,
        undefined,
        "#ff0000",
        "star",
      );
    });

    expect(updated).toBe(true);
    expect(mocks.update_tag).toHaveBeenCalledTimes(1);

    const request = mocks.update_tag.mock.calls[0][1];

    expect("encrypted_name" in request).toBe(false);
    expect("name_nonce" in request).toBe(false);
    expect(request.encrypted_color).toBeTruthy();
    expect(tags[0].is_undecryptable).toBe(true);
    expect(tags[0].color).toBe("#ff0000");
  });

  it("still moves an unreadable label", async () => {
    await load(["work", `${UNREADABLE_PREFIX}-one`]);

    let moved = false;

    await act(async () => {
      moved = await update_existing_tag(
        `id-${UNREADABLE_PREFIX}-one`,
        undefined,
        undefined,
        undefined,
        undefined,
        "token-work",
      );
    });

    expect(moved).toBe(true);
    expect(mocks.update_tag).toHaveBeenCalledWith(
      `id-${UNREADABLE_PREFIX}-one`,
      { parent_token: "token-work" },
    );
  });

  it("builds a placeholder that keeps the server identity of the label", () => {
    const placeholder = build_undecryptable_tag(
      server_tag("anything", 4),
      "fallback",
    );

    expect(placeholder).toEqual({
      id: "id-anything",
      tag_token: "token-anything",
      name: "fallback",
      color: undefined,
      icon: undefined,
      sort_order: 4,
      item_count: 5,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      is_undecryptable: true,
    });
  });
});
