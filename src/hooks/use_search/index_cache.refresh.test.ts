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
import type { MailItem } from "@/services/api/mail";
import type { CachedIndex } from "./types";

import { describe, it, expect, beforeEach, vi } from "vitest";

const { store, writes, server } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  writes: { chunk: 0, total: 0 },
  server: { mailbox: [] as MailItem[], envelope_decrypts: 0 },
}));

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_set: async (key: string, value: unknown) => {
    writes.total++;
    if (key.includes("_chunk_")) writes.chunk++;
    store.set(key, JSON.parse(JSON.stringify(value)));
  },
  encrypted_get: async (key: string) => store.get(key) ?? null,
  encrypted_list_keys: async () => [...store.keys()],
  secure_overwrite_and_delete: async (key: string) => {
    store.delete(key);
  },
}));
vi.mock("@/services/crypto/memory_key_store", () => ({
  has_vault_in_memory: () => true,
  get_derived_encryption_key: () => new Uint8Array(32),
}));
vi.mock("@/services/crypto/secure_memory", () => ({
  zero_uint8_array: () => {},
}));
vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "account-1",
}));
vi.mock("@/services/api/mail", () => ({
  list_encrypted_mail_items: async ({
    cursor,
    limit,
  }: {
    cursor?: string;
    limit: number;
  }) => {
    const start = cursor ? Number(cursor) : 0;
    const end = start + limit;

    return {
      data: {
        items: server.mailbox.slice(start, end),
        next_cursor: end < server.mailbox.length ? String(end) : undefined,
      },
    };
  },
  list_mail_items: async ({ ids }: { ids: string[] }) => ({
    data: { items: server.mailbox.filter((item) => ids.includes(item.id)) },
  }),
}));
vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: async () => null,
  extract_metadata_from_server: (
    _decrypted: unknown,
    server_fields: Record<string, unknown>,
  ) => ({ ...server_fields }),
}));
vi.mock("@/hooks/use_search/envelope", () => ({
  decrypt_envelope_for_search: async (
    _envelope: string,
    _nonce: string,
    id: string,
  ) => {
    server.envelope_decrypts++;

    return {
      subject: `Subject ${id}`,
      body_text: "",
      body_html: "",
      from: { name: "Alice", email: "alice@example.com" },
      to: [],
      cc: [],
      bcc: [],
      sent_at: "2026-01-01T00:00:00Z",
    };
  },
  reset_legacy_migration_state: () => {},
}));
vi.mock("@/services/locked_folders", () => ({
  filter_locked_mail_items: (items: MailItem[]) => items,
}));
vi.mock("@/services/search/index_total", () => ({
  fetch_mailbox_index_total: async () => server.mailbox.length,
  settle_within: <T>(promise: Promise<T>) => promise,
}));

import {
  build_search_index,
  clear_search_index,
  hydrate_snapshot_index,
  mark_search_index_stale,
  reset_index_cache,
} from "./index_cache";
import * as index_cache from "./index_cache";
import { matches_query } from "./matching";

import { SNAPSHOT_CHUNK_SIZE } from "@/services/search_index_store";

const user_email = "user@example.com";
const MAILBOX_SIZE = SNAPSHOT_CHUNK_SIZE * 2 + 500;

function make_item(n: number): MailItem {
  return {
    id: `msg-${n}`,
    item_type: "received",
    encrypted_envelope: "ciphertext-envelope",
    envelope_nonce: "nonce",
    encrypted_metadata: `encrypted-metadata-${n}`,
    metadata_nonce: "meta-nonce",
    folder_token: "inbox",
    is_external: false,
    is_read: true,
    created_at: "2026-01-01T00:00:00Z",
    message_ts: "2026-01-01T00:00:00Z",
  } as MailItem;
}

async function settle(): Promise<CachedIndex> {
  let index = await build_search_index(user_email, false);

  while (index_cache.index_build_promise) {
    index = await index_cache.index_build_promise;
  }

  return index_cache.cached_index ?? index;
}

async function refresh(): Promise<CachedIndex> {
  writes.chunk = 0;
  writes.total = 0;
  server.envelope_decrypts = 0;
  mark_search_index_stale();

  return settle();
}

async function search(
  index: CachedIndex,
  terms: string[],
  operators: { type: "is"; value: string }[] = [],
): Promise<string[]> {
  const found: string[] = [];
  const parsed = operators.map((op) => ({
    ...op,
    raw: `is:${op.value}`,
    negated: false,
  }));

  for (const item of index.items) {
    const entry = index.decrypted.get(item.id);

    if (
      entry &&
      matches_query(
        terms,
        parsed,
        entry.envelope,
        entry.metadata,
        item,
        undefined,
        undefined,
        false,
        entry.search_body_text,
        entry.haystack,
      )
    ) {
      found.push(item.id);
    }
  }

  return found;
}

async function reload(): Promise<CachedIndex> {
  reset_index_cache();
  const hydrated = await hydrate_snapshot_index(user_email);

  expect(hydrated).not.toBeNull();

  return hydrated as CachedIndex;
}

describe("search index refresh writes", () => {
  beforeEach(async () => {
    clear_search_index();
    store.clear();
    server.mailbox = Array.from({ length: MAILBOX_SIZE }, (_, n) =>
      make_item(n),
    );
    writes.chunk = 0;
    writes.total = 0;

    const index = await settle();

    expect(index.items).toHaveLength(MAILBOX_SIZE);
    expect(writes.chunk).toBe(3);
  });

  it("writes nothing when nothing changed", async () => {
    const index = await refresh();

    expect(writes.chunk).toBe(0);
    expect(writes.total).toBe(0);
    expect(server.envelope_decrypts).toBe(0);
    expect(index.built_at).toBeGreaterThan(0);
    expect(index.items).toHaveLength(MAILBOX_SIZE);
    expect(await search(await reload(), ["msg-4321"])).toEqual(["msg-4321"]);
  });

  it("writes nothing when an index loaded from disk is refreshed unchanged", async () => {
    reset_index_cache();
    await settle();

    const index = await refresh();

    expect(writes.chunk).toBe(0);
    expect(writes.total).toBe(0);
    expect(index.items).toHaveLength(MAILBOX_SIZE);
  });

  it("rewrites only the chunk holding a message whose read flag changed", async () => {
    const changed = SNAPSHOT_CHUNK_SIZE + 10;

    server.mailbox[changed] = { ...server.mailbox[changed], is_read: false };

    const index = await refresh();

    expect(writes.chunk).toBe(1);
    expect(await search(index, [], [{ type: "is", value: "unread" }])).toEqual([
      `msg-${changed}`,
    ]);

    const reloaded = await reload();

    expect(
      await search(reloaded, [], [{ type: "is", value: "unread" }]),
    ).toEqual([`msg-${changed}`]);
    expect(
      reloaded.items.find((item) => item.id === `msg-${changed}`)?.is_read,
    ).toBe(false);

    writes.chunk = 0;
    await refresh();
    expect(writes.chunk).toBe(0);
  });

  it("indexes a new message and keeps it after a reload", async () => {
    server.mailbox.unshift(make_item(MAILBOX_SIZE));

    const index = await refresh();

    expect(writes.chunk).toBeLessThanOrEqual(3);
    expect(index.items).toHaveLength(MAILBOX_SIZE + 1);
    expect(await search(index, [`msg-${MAILBOX_SIZE}`])).toEqual([
      `msg-${MAILBOX_SIZE}`,
    ]);

    const reloaded = await reload();

    expect(reloaded.items.map((item) => item.id)).toEqual(
      server.mailbox.map((item) => item.id),
    );
  });

  it("drops a deleted message and rewrites only from its chunk on", async () => {
    const deleted = SNAPSHOT_CHUNK_SIZE * 2 + 100;

    server.mailbox.splice(deleted, 1);

    const index = await refresh();

    expect(writes.chunk).toBe(1);
    expect(index.items).toHaveLength(MAILBOX_SIZE - 1);
    expect(await search(index, [`msg-${deleted}`])).toEqual([]);

    const reloaded = await reload();

    expect(reloaded.items.map((item) => item.id)).toEqual(
      server.mailbox.map((item) => item.id),
    );
    expect(await search(reloaded, [`msg-${deleted}`])).toEqual([]);
  });

  it("rebuilds from scratch after the index is cleared", async () => {
    clear_search_index();
    store.clear();
    writes.chunk = 0;

    const index = await settle();

    expect(writes.chunk).toBe(3);
    expect(index.items).toHaveLength(MAILBOX_SIZE);
  });
});

describe("search index front refresh writes", () => {
  type IndexCacheModule = typeof import("./index_cache");
  let windowed: IndexCacheModule;

  async function settle_windowed(): Promise<CachedIndex> {
    await windowed.build_search_index(user_email, false);

    while (windowed.index_build_promise || windowed.is_deep_index_running()) {
      await windowed.index_build_promise?.catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    return windowed.cached_index as CachedIndex;
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("./constants", async (original) => ({
      ...(await original<typeof import("./constants")>()),
      HOT_CHUNK_COUNT: 1,
      MAX_RAM_INDEX_ITEMS: SNAPSHOT_CHUNK_SIZE,
      DEEP_SEGMENT_PAUSE_MS: 0,
    }));
    windowed = await import("./index_cache");
    windowed.clear_search_index();
    store.clear();
    server.mailbox = Array.from({ length: MAILBOX_SIZE }, (_, n) =>
      make_item(n),
    );
    writes.chunk = 0;

    const index = await settle_windowed();

    expect(index.items).toHaveLength(SNAPSHOT_CHUNK_SIZE);
    expect(index.meta?.complete).toBe(true);
    expect(writes.chunk).toBe(3);
  });

  it("writes nothing when the front of the mailbox is unchanged", async () => {
    writes.chunk = 0;
    writes.total = 0;
    windowed.mark_search_index_stale();

    const index = await settle_windowed();

    expect(writes.chunk).toBe(0);
    expect(writes.total).toBe(0);
    expect(index.meta?.total).toBe(MAILBOX_SIZE);
  });

  it("rewrites only the front chunk when a read flag changes there", async () => {
    server.mailbox[7] = { ...server.mailbox[7], is_read: false };
    writes.chunk = 0;
    windowed.mark_search_index_stale();

    const index = await settle_windowed();

    expect(writes.chunk).toBe(1);
    expect(await search(index, [], [{ type: "is", value: "unread" }])).toEqual([
      "msg-7",
    ]);
    expect(index.meta?.total).toBe(MAILBOX_SIZE);
    expect(index.meta?.chunk_ids).toHaveLength(3);
  });
  it("drops a message deleted from the front and keeps the rest on disk", async () => {
    server.mailbox.splice(7, 1);
    writes.chunk = 0;
    windowed.mark_search_index_stale();

    const index = await settle_windowed();

    expect(writes.chunk).toBe(1);
    expect(await search(index, ["msg-7"])).not.toContain("msg-7");
    expect(index.items.some((item) => item.id === "msg-7")).toBe(false);
    expect(index.meta?.total).toBe(MAILBOX_SIZE - 1);

    windowed.reset_index_cache();
    const reloaded = await windowed.hydrate_snapshot_index(user_email);
    const reader_ids: string[] = [...(reloaded as CachedIndex).items].map(
      (item) => item.id,
    );

    expect(reader_ids).toEqual(
      server.mailbox.slice(0, reader_ids.length).map((item) => item.id),
    );
  });

  it("indexes a new message that pushes the front past the window", async () => {
    server.mailbox.unshift(make_item(MAILBOX_SIZE));
    windowed.mark_search_index_stale();

    const index = await settle_windowed();

    expect(await search(index, [`msg-${MAILBOX_SIZE}`])).toEqual([
      `msg-${MAILBOX_SIZE}`,
    ]);
    expect(index.meta?.total).toBe(MAILBOX_SIZE + 1);
  });
});
