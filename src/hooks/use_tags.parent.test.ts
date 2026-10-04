//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

interface ServerSeed {
  name: string;
  parent?: string;
}

const mocks = vi.hoisted(() => ({
  server_seeds: [] as { name: string; parent?: string }[],
  list_tags: vi.fn(),
  create_tag: vi.fn(),
  update_tag: vi.fn(),
  delete_tag: vi.fn(),
}));

vi.mock("@/services/api/tags", () => ({
  list_tags: mocks.list_tags,
  create_tag: mocks.create_tag,
  update_tag: mocks.update_tag,
  delete_tag: mocks.delete_tag,
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

import {
  use_tags,
  clear_tags_cache,
  type DecryptedTag,
} from "@/hooks/use_tags";
import { MAIL_EVENTS } from "@/hooks/mail_events";

const REFETCH_SETTLE_MS = 400;

async function wait_for_refetch(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, REFETCH_SETTLE_MS));
  });
}

function server_tag(seed: ServerSeed, index: number) {
  return {
    id: `id-${seed.name}`,
    tag_token: `token-${seed.name}`,
    encrypted_name: Buffer.from(seed.name).toString("base64"),
    name_nonce: "AAAAAAAAAAAAAAAA",
    sort_order: index,
    item_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...(seed.parent && {
      parent_token: `token-${seed.parent}`,
      parent_id: `id-${seed.parent}`,
    }),
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  });
}

describe("use_tags parent label mapping", () => {
  let container: HTMLDivElement;
  let root: Root;
  let tags: DecryptedTag[];
  let hook: ReturnType<typeof use_tags>;

  function parent_of(name: string): string | undefined {
    return tags.find((tag) => tag.name === name)?.parent_token;
  }

  async function load(seeds: ServerSeed[]): Promise<void> {
    mocks.server_seeds = seeds;

    await act(async () => {
      await hook.fetch_tags();
    });
    await flush();
  }

  beforeEach(async () => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    clear_tags_cache();
    tags = [];
    mocks.server_seeds = [];
    mocks.list_tags.mockImplementation(async () => ({
      data: {
        tags: mocks.server_seeds.map(server_tag),
        total: mocks.server_seeds.length,
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
    mocks.update_tag.mockImplementation(
      async (tag_id: string, request: { parent_token?: string }) => {
        if (request.parent_token !== undefined) {
          mocks.server_seeds = mocks.server_seeds.map((seed) =>
            `id-${seed.name}` === tag_id
              ? {
                  name: seed.name,
                  parent: request.parent_token
                    ? request.parent_token.replace("token-", "")
                    : undefined,
                }
              : seed,
          );
        }

        return { data: { success: true }, error: null };
      },
    );
    mocks.delete_tag.mockImplementation(async (tag_id: string) => {
      const removed = mocks.server_seeds.find(
        (seed) => `id-${seed.name}` === tag_id,
      );

      mocks.server_seeds = mocks.server_seeds
        .filter((seed) => seed !== removed)
        .map((seed) =>
          removed && seed.parent === removed.name
            ? { name: seed.name, parent: removed.parent }
            : seed,
        );

      return { data: { success: true }, error: null };
    });

    function Probe() {
      hook = use_tags();
      tags = hook.state.tags;

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

  it("reads the parent of each label from the list response", async () => {
    await load([
      { name: "work" },
      { name: "invoices", parent: "work" },
      { name: "travel" },
    ]);

    expect(parent_of("work")).toBeUndefined();
    expect(parent_of("invoices")).toBe("token-work");
    expect(parent_of("travel")).toBeUndefined();
  });

  it("sends the parent when creating a sublabel", async () => {
    await load([{ name: "work" }]);

    let created: DecryptedTag | null = null;

    await act(async () => {
      created = await hook.create_new_tag(
        "invoices",
        undefined,
        undefined,
        "token-work",
      );
    });

    expect(created).not.toBeNull();
    expect(mocks.create_tag).toHaveBeenCalledTimes(1);
    expect(mocks.create_tag.mock.calls[0][0].parent_token).toBe("token-work");
    expect((created as DecryptedTag | null)?.parent_token).toBe("token-work");
  });

  it("omits the parent when creating a top-level label", async () => {
    await load([{ name: "work" }]);

    await act(async () => {
      await hook.create_new_tag("travel");
    });

    expect(mocks.create_tag).toHaveBeenCalledTimes(1);
    expect("parent_token" in mocks.create_tag.mock.calls[0][0]).toBe(false);
  });

  it("allows the same name under different parents only", async () => {
    await load([{ name: "work" }, { name: "invoices" }]);

    let nested: DecryptedTag | null = null;
    let duplicate: DecryptedTag | null = null;

    await act(async () => {
      nested = await hook.create_new_tag(
        "invoices",
        undefined,
        undefined,
        "token-work",
      );
    });
    await act(async () => {
      duplicate = await hook.create_new_tag("invoices");
    });

    expect(nested).not.toBeNull();
    expect(duplicate).toBeNull();
    expect(mocks.create_tag).toHaveBeenCalledTimes(1);
  });

  it("sends the new parent when moving a label", async () => {
    await load([{ name: "work" }, { name: "travel" }, { name: "invoices" }]);

    let moved = false;

    await act(async () => {
      moved = await hook.update_existing_tag(
        "id-invoices",
        undefined,
        undefined,
        undefined,
        undefined,
        "token-work",
      );
    });

    expect(moved).toBe(true);
    expect(mocks.update_tag).toHaveBeenCalledWith("id-invoices", {
      parent_token: "token-work",
    });
    expect(parent_of("invoices")).toBe("token-work");
  });

  it("sends an empty parent to move a label to the top level", async () => {
    await load([{ name: "work" }, { name: "invoices", parent: "work" }]);

    await act(async () => {
      await hook.update_existing_tag(
        "id-invoices",
        undefined,
        undefined,
        undefined,
        undefined,
        null,
      );
    });

    expect(mocks.update_tag).toHaveBeenCalledWith("id-invoices", {
      parent_token: "",
    });
    expect(parent_of("invoices")).toBeUndefined();
  });

  it("leaves the parent out of updates that do not move the label", async () => {
    await load([{ name: "work" }, { name: "invoices", parent: "work" }]);

    await act(async () => {
      await hook.update_existing_tag(
        "id-invoices",
        undefined,
        undefined,
        undefined,
        7,
      );
    });

    expect(mocks.update_tag).toHaveBeenCalledWith("id-invoices", {
      sort_order: 7,
    });
    expect(parent_of("invoices")).toBe("token-work");
  });

  it("keeps the parent when the server rejects the move", async () => {
    await load([{ name: "work" }, { name: "invoices" }]);
    mocks.update_tag.mockImplementationOnce(async () => ({
      data: null,
      error: "TAG_PARENT_CYCLE",
    }));

    let moved = true;

    await act(async () => {
      moved = await hook.update_existing_tag(
        "id-invoices",
        undefined,
        undefined,
        undefined,
        undefined,
        "token-work",
      );
    });

    expect(moved).toBe(false);
    expect(parent_of("invoices")).toBeUndefined();
  });

  it("reloads labels when the server rejects the parent of a move", async () => {
    await load([{ name: "work" }, { name: "invoices" }]);
    mocks.update_tag.mockImplementationOnce(async () => ({
      data: null,
      error: "Bad request",
      server_code: "TAG_PARENT_NOT_FOUND",
    }));
    mocks.server_seeds = [{ name: "invoices" }];

    const calls = mocks.list_tags.mock.calls.length;
    let moved = true;

    await act(async () => {
      moved = await hook.update_existing_tag(
        "id-invoices",
        undefined,
        undefined,
        undefined,
        undefined,
        "token-work",
      );
    });
    await flush();

    expect(moved).toBe(false);
    expect(mocks.list_tags.mock.calls.length).toBe(calls + 1);
    expect(tags.map((tag) => tag.name)).toEqual(["invoices"]);
  });

  it("reloads labels when the server rejects the parent of a new label", async () => {
    await load([{ name: "work" }]);
    mocks.create_tag.mockImplementationOnce(async () => ({
      data: null,
      error: "TAG_PARENT_TOO_DEEP",
    }));
    mocks.server_seeds = [];

    const calls = mocks.list_tags.mock.calls.length;
    let created: DecryptedTag | null = null;

    await act(async () => {
      created = await hook.create_new_tag(
        "invoices",
        undefined,
        undefined,
        "token-work",
      );
    });
    await flush();

    expect(created).toBeNull();
    expect(mocks.list_tags.mock.calls.length).toBe(calls + 1);
    expect(tags).toEqual([]);
  });

  it("does not reload labels for an unrelated server error", async () => {
    await load([{ name: "work" }, { name: "invoices" }]);
    mocks.update_tag.mockImplementationOnce(async () => ({
      data: null,
      error: "Server error",
      server_code: "INTERNAL",
    }));

    const calls = mocks.list_tags.mock.calls.length;

    await act(async () => {
      await hook.update_existing_tag(
        "id-invoices",
        undefined,
        undefined,
        undefined,
        undefined,
        "token-work",
      );
    });
    await flush();

    expect(mocks.list_tags.mock.calls.length).toBe(calls);
  });

  it("treats a label with a missing parent as top-level for duplicates", async () => {
    await load([{ name: "invoices", parent: "gone" }]);

    let duplicate: DecryptedTag | null = null;

    await act(async () => {
      duplicate = await hook.create_new_tag("Invoices");
    });

    expect(duplicate).toBeNull();
    expect(mocks.create_tag).not.toHaveBeenCalled();
  });

  it("fetches once for a burst of change reports", async () => {
    await load([{ name: "work" }]);

    const calls = mocks.list_tags.mock.calls.length;

    await act(async () => {
      for (let index = 0; index < 5; index += 1) {
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.TAGS_CHANGED));
      }
      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.DEFINITIONS_STALE));
    });

    expect(mocks.list_tags.mock.calls.length).toBe(calls);

    mocks.server_seeds = [{ name: "work" }, { name: "travel" }];
    await wait_for_refetch();

    expect(mocks.list_tags.mock.calls.length).toBe(calls + 1);
    expect(tags.map((tag) => tag.name)).toEqual(["work", "travel"]);
  });

  it("drops a pending refetch when the hook unmounts", async () => {
    await load([{ name: "work" }]);

    const calls = mocks.list_tags.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.TAGS_CHANGED));
    });
    await act(async () => {
      root.render(null);
    });
    await wait_for_refetch();

    expect(mocks.list_tags.mock.calls.length).toBe(calls);
  });

  it("returns the fetched labels from refresh", async () => {
    mocks.server_seeds = [{ name: "work" }, { name: "travel" }];

    let refreshed: DecryptedTag[] = [];

    await act(async () => {
      refreshed = await hook.refresh();
    });

    expect(refreshed.map((tag) => tag.name)).toEqual(["work", "travel"]);
  });

  it("moves sublabels up one level when their parent is deleted", async () => {
    await load([
      { name: "work" },
      { name: "invoices", parent: "work" },
      { name: "y2026", parent: "invoices" },
    ]);

    await act(async () => {
      await hook.delete_existing_tag("id-invoices");
    });

    expect(tags.map((tag) => tag.name)).toEqual(["work", "y2026"]);
    expect(parent_of("y2026")).toBe("token-work");

    await act(async () => {
      await hook.delete_existing_tag("id-work");
    });

    expect(tags.map((tag) => tag.name)).toEqual(["y2026"]);
    expect(parent_of("y2026")).toBeUndefined();
  });
});
