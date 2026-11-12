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

const { store, writes, reads, server, roster } = vi.hoisted(() => ({
  roster: {
    account_ids: ["account-1"] as string[],
    current: "account-1" as string | null,
    unreadable: false,
  },
  store: new Map<string, unknown>(),
  writes: {
    chunk: 0,
    total: 0,
    on_chunk: null as (() => void) | null,
  },
  reads: {
    chunk: 0,
    after_chunk: null as ((key: string) => Promise<void>) | null,
  },
  server: { mailbox: [] as MailItem[], envelope_decrypts: 0 },
}));

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_set: async (key: string, value: unknown) => {
    writes.total++;
    if (key.includes("_chunk_")) {
      writes.chunk++;
      writes.on_chunk?.();
    }
    store.set(key, JSON.parse(JSON.stringify(value)));
  },
  encrypted_set_plaintext: async (key: string, plaintext: Uint8Array) => {
    writes.total++;
    if (key.includes("_chunk_")) {
      writes.chunk++;
      writes.on_chunk?.();
    }
    store.set(key, JSON.parse(new TextDecoder().decode(plaintext)));
  },
  encrypted_get: async (key: string) => {
    const value = store.get(key) ?? null;

    if (key.includes("_chunk_")) {
      reads.chunk++;
      await reads.after_chunk?.(key);
    }

    return value;
  },
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
  get_current_account_id: async () => roster.current,
  get_all_accounts: async () => {
    if (roster.unreadable) throw new Error("roster unreadable");

    return roster.account_ids.map((id) => ({ id }));
  },
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
  filter_locked_mail_items: (items: MailItem[]) =>
    items.filter((item) => item.folder_token !== "locked"),
}));
vi.mock("@/services/search/index_total", () => ({
  fetch_mailbox_index_total: async () => server.mailbox.length,
  settle_within: <T>(promise: Promise<T>) => promise,
}));

vi.mock("./constants", async (original) => ({
  ...(await original<typeof import("./constants")>()),
  PURGE_FLUSH_MS: 0,
}));

import {
  build_search_index,
  clear_search_index,
  hydrate_snapshot_index,
  is_index_reconcile_due,
  mark_search_index_stale,
  patch_indexed_flags,
  purge_search_index,
  reconcile_search_index,
  request_index_reconcile,
  reset_index_cache,
} from "./index_cache";
import { scan_search_index } from "./scan";
import * as index_cache from "./index_cache";
import { RECONCILE_INTERVAL_MS, RECONCILE_REQUEST_MIN_MS } from "./constants";

import {
  forget_purged_ids,
  is_purged_id,
  open_snapshot_reader,
  SNAPSHOT_CHUNK_SIZE,
} from "@/services/search_index_store";

const user_email = "user@example.com";
const MAILBOX_SIZE = SNAPSHOT_CHUNK_SIZE * 2 + 500;

function make_item(n: number, flags: Partial<MailItem> = {}): MailItem {
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
    ...flags,
  } as MailItem;
}

async function settle(): Promise<CachedIndex> {
  let index = await build_search_index(user_email, false);

  while (index_cache.index_build_promise) {
    index = (await index_cache.index_build_promise.catch(() => null)) ?? index;
  }

  return index_cache.cached_index ?? index;
}

async function disk_ids(): Promise<string[]> {
  const reader = await open_snapshot_reader(user_email);
  const ids: string[] = [];

  for (const chunk_id of reader?.meta.chunk_ids ?? []) {
    const chunk = await reader!.read(chunk_id);

    for (const item of chunk?.items ?? []) ids.push(item.id);
  }

  return ids;
}

function chunk_keys(): string[] {
  return [...store.keys()].filter((key) => key.includes("_chunk_"));
}

function manifest(): { chunk_ids: number[]; total: number } {
  const key = [...store.keys()].find((k) => /^search_index_[^_]+$/.test(k));

  return store.get(key as string) as { chunk_ids: number[]; total: number };
}

function strip_id_filters(): void {
  for (const [key, value] of store) {
    if (!key.includes("_sumg_")) continue;

    const record = value as { summaries: Record<string, { ids?: unknown }> };

    for (const summary of Object.values(record.summaries)) delete summary.ids;
  }
}

function tick(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stored_text(): string {
  return JSON.stringify([...store.values()]);
}

function hot_ids(): string[] {
  return (index_cache.cached_index?.items ?? []).map((item) => item.id);
}

function evict_from_memory(count: number): string[] {
  const index = index_cache.cached_index as CachedIndex;
  const evicted = index.items.splice(index.items.length - count, count);

  for (const item of evicted) index.decrypted.delete(item.id);

  return evicted.map((item) => item.id);
}

describe("search index removals", () => {
  beforeEach(async () => {
    await clear_search_index("all");
    forget_purged_ids();
    store.clear();
    server.mailbox = Array.from({ length: MAILBOX_SIZE }, (_, n) =>
      make_item(n),
    );
    await settle();
  });

  it("drops a permanently deleted message from memory and from disk", async () => {
    expect(hot_ids()).toContain("msg-2100");
    expect(await disk_ids()).toContain("msg-2100");
    expect(stored_text()).toContain("Subject msg-2100");

    await purge_search_index({ ids: ["msg-2100"] });

    expect(hot_ids()).not.toContain("msg-2100");
    expect(index_cache.cached_index?.decrypted.has("msg-2100")).toBe(false);
    expect(await disk_ids()).not.toContain("msg-2100");
    expect(stored_text()).not.toContain("Subject msg-2100");
    expect(stored_text()).not.toContain('"msg-2100"');
    expect(await disk_ids()).toHaveLength(MAILBOX_SIZE - 1);
  });

  it("remembers a removed message until the account changes", async () => {
    await purge_search_index({ ids: ["msg-11"] });
    expect(is_purged_id("msg-11")).toBe(true);

    await clear_search_index("all");
    expect(is_purged_id("msg-11")).toBe(true);

    await clear_search_index("all", { account_changed: true });
    expect(is_purged_id("msg-11")).toBe(false);
  });

  it("drops the message from memory before the disk pass runs", () => {
    void purge_search_index({ ids: ["msg-7"] });

    expect(hot_ids()).not.toContain("msg-7");
  });

  it("rewrites the disk chunks when no index is loaded in memory", async () => {
    reset_index_cache();

    await purge_search_index({ ids: ["msg-3", "msg-4400"] });

    const ids = await disk_ids();

    expect(ids).not.toContain("msg-3");
    expect(ids).not.toContain("msg-4400");
    expect(ids).toHaveLength(MAILBOX_SIZE - 2);

    const hydrated = await hydrate_snapshot_index(user_email);

    expect(hydrated?.decrypted.has("msg-3")).toBe(false);
    expect(hydrated?.total_indexed).toBe(MAILBOX_SIZE - 2);
  });

  it("does not index a deleted message again from a listing that still has it", async () => {
    await purge_search_index({ ids: ["msg-10"] });

    mark_search_index_stale();
    await settle();

    expect(hot_ids()).not.toContain("msg-10");
    expect(await disk_ids()).not.toContain("msg-10");
  });

  it("keeps a message that moves to Trash searchable", async () => {
    patch_indexed_flags(["msg-5"], { is_trashed: true });

    expect(hot_ids()).toContain("msg-5");
    expect(await disk_ids()).toContain("msg-5");
  });

  it("drops every trashed message when Trash is emptied", async () => {
    await clear_search_index("all");
    store.clear();
    server.mailbox = Array.from({ length: MAILBOX_SIZE }, (_, n) =>
      make_item(n, { is_trashed: n % 500 === 0, is_spam: n === 1 }),
    );
    await settle();

    await purge_search_index({ scope: "trash" });

    const ids = await disk_ids();

    expect(ids).not.toContain("msg-0");
    expect(ids).not.toContain("msg-4000");
    expect(ids).toContain("msg-1");
    expect(hot_ids()).not.toContain("msg-2500");
    expect(ids).toHaveLength(
      MAILBOX_SIZE - Math.ceil(MAILBOX_SIZE / 500),
    );
  });

  it("counts a message held in memory and on disk once", async () => {
    evict_from_memory(100);

    expect(index_cache.cached_index?.total_indexed).toBe(MAILBOX_SIZE);

    await purge_search_index({ ids: ["msg-5"] });

    expect(hot_ids()).not.toContain("msg-5");
    expect(await disk_ids()).not.toContain("msg-5");
    expect(index_cache.cached_index?.total_indexed).toBe(MAILBOX_SIZE - 1);
    expect(index_cache.cached_index?.meta?.total).toBe(MAILBOX_SIZE - 1);
  });

  it("counts a message held only on disk once", async () => {
    const evicted = evict_from_memory(100);

    await purge_search_index({ ids: [evicted[0]] });

    expect(await disk_ids()).not.toContain(evicted[0]);
    expect(index_cache.cached_index?.total_indexed).toBe(MAILBOX_SIZE - 1);
    expect(index_cache.cached_index?.meta?.total).toBe(MAILBOX_SIZE - 1);
  });

  it("counts a message held only in memory once", async () => {
    const index = index_cache.cached_index as CachedIndex;
    const extra = make_item(MAILBOX_SIZE + 7);

    evict_from_memory(100);
    index.items.push(extra);
    index.total_indexed = MAILBOX_SIZE + 1;

    await purge_search_index({ ids: [extra.id] });

    expect(hot_ids()).not.toContain(extra.id);
    expect(index_cache.cached_index?.total_indexed).toBe(MAILBOX_SIZE);
    expect(index_cache.cached_index?.meta?.total).toBe(MAILBOX_SIZE);
  });

  it("counts a mixed removal once per message", async () => {
    const evicted = evict_from_memory(100);

    await purge_search_index({ ids: ["msg-5", "msg-6", evicted[3]] });

    expect(index_cache.cached_index?.total_indexed).toBe(MAILBOX_SIZE - 3);
    expect(await disk_ids()).toHaveLength(MAILBOX_SIZE - 3);
  });

  it("counts a message once when two removals share one disk pass", async () => {
    evict_from_memory(100);

    const first = purge_search_index({ ids: ["msg-5"] });
    const second = purge_search_index({ ids: ["msg-6"] });

    await Promise.all([first, second]);

    expect(index_cache.cached_index?.total_indexed).toBe(MAILBOX_SIZE - 2);
  });

  it("keeps emptied Trash out of an index build already in flight", async () => {
    await clear_search_index("all");
    store.clear();
    server.mailbox = Array.from({ length: MAILBOX_SIZE }, (_, n) =>
      make_item(n, { is_trashed: n < 2000 && n % 500 === 0 }),
    );

    let emptied = false;

    writes.on_chunk = () => {
      if (emptied) return;

      emptied = true;
      void purge_search_index({ scope: "trash" });
    };

    try {
      await settle();
      await purge_search_index({});
    } finally {
      writes.on_chunk = null;
    }

    const ids = await disk_ids();

    expect(emptied).toBe(true);

    for (const id of ["msg-0", "msg-500", "msg-1000", "msg-1500"]) {
      expect(hot_ids()).not.toContain(id);
      expect(ids).not.toContain(id);
      expect(stored_text()).not.toContain(`"${id}"`);
      expect(is_purged_id(id)).toBe(true);
    }

    expect(ids).toContain("msg-1");
    expect(ids).toContain("msg-2001");
    expect(ids).toHaveLength(MAILBOX_SIZE - 4);
    expect(index_cache.cached_index?.total_indexed).toBe(MAILBOX_SIZE - 4);
  });

  it("drops messages the server no longer lists", async () => {
    server.mailbox = server.mailbox.filter(
      (item) => item.id !== "msg-42" && item.id !== "msg-4321",
    );

    const removed = await reconcile_search_index(user_email);

    expect(removed).toBe(2);
    expect(hot_ids()).not.toContain("msg-42");
    expect(await disk_ids()).not.toContain("msg-42");
    expect(await disk_ids()).not.toContain("msg-4321");
    expect(stored_text()).not.toContain("Subject msg-4321");
    expect(await disk_ids()).toHaveLength(MAILBOX_SIZE - 2);
  });

  it("drops messages whose expiry has passed", async () => {
    const index = index_cache.cached_index as CachedIndex;
    const past = new Date(Date.now() - 60_000).toISOString();
    const later = new Date(Date.now() + 3_600_000).toISOString();

    for (const item of index.items) {
      if (item.id === "msg-7") item.expires_at = past;
      if (item.id === "msg-8") item.expires_at = later;
    }

    const removed = await reconcile_search_index(user_email);

    expect(removed).toBe(1);
    expect(hot_ids()).not.toContain("msg-7");
    expect(hot_ids()).toContain("msg-8");
  });

  it("leaves expired messages out of a scan and erases them", async () => {
    const index = index_cache.cached_index as CachedIndex;
    const past = new Date(Date.now() - 60_000).toISOString();

    for (const item of index.items) {
      if (item.id === "msg-9") item.expires_at = past;
    }

    const seen: string[] = [];

    await scan_search_index(
      index,
      (item) => {
        seen.push(item.id);

        return true;
      },
      () => false,
    );

    expect(seen).not.toContain("msg-9");
    expect(seen).toContain("msg-10");

    await vi.waitFor(() => expect(hot_ids()).not.toContain("msg-9"));
    await purge_search_index({});

    expect(await disk_ids()).not.toContain("msg-9");
  });

  it("checks the index on request, at most once per window", async () => {
    const mail = await import("@/services/api/mail");
    const spy = vi.spyOn(mail, "list_encrypted_mail_items");

    await reconcile_search_index(user_email);
    spy.mockClear();

    request_index_reconcile();

    expect(spy).not.toHaveBeenCalled();

    server.mailbox = server.mailbox.filter((item) => item.id !== "msg-11");
    request_index_reconcile(Date.now() + RECONCILE_REQUEST_MIN_MS + 1);
    await reconcile_search_index(user_email);

    spy.mockRestore();

    expect(hot_ids()).not.toContain("msg-11");
  });

  it("leaves the index alone when the listing fails", async () => {
    const mail = await import("@/services/api/mail");
    const spy = vi
      .spyOn(mail, "list_encrypted_mail_items")
      .mockResolvedValue({ error: "offline" } as never);

    const removed = await reconcile_search_index(user_email);

    spy.mockRestore();

    expect(removed).toBe(0);
    expect(await disk_ids()).toHaveLength(MAILBOX_SIZE);
    expect(hot_ids()).toHaveLength(MAILBOX_SIZE);
  });

  it("asks for a reconciliation once the last one is old", async () => {
    const index = index_cache.cached_index as CachedIndex;
    const now = Date.now();

    expect(is_index_reconcile_due(index, now)).toBe(false);
    expect(is_index_reconcile_due(index, now + RECONCILE_INTERVAL_MS + 1)).toBe(
      true,
    );

    await reconcile_search_index(user_email);

    const reader = await open_snapshot_reader(user_email);

    expect(reader?.meta.verified_at).toBeGreaterThan(0);
  });

  it("reads no chunk for an id the index does not hold", async () => {
    reads.chunk = 0;
    writes.total = 0;

    await purge_search_index({ ids: ["draft-7f3a", "scheduled-91bc"] });

    expect(reads.chunk).toBe(0);
    expect(writes.total).toBe(0);
    expect(await disk_ids()).toHaveLength(MAILBOX_SIZE);
    expect(index_cache.cached_index?.total_indexed).toBe(MAILBOX_SIZE);
  });

  it("reads no chunk for an unindexed id when no index is in memory", async () => {
    reset_index_cache();
    reads.chunk = 0;
    writes.total = 0;

    await purge_search_index({ ids: ["draft-7f3a"] });

    expect(reads.chunk).toBe(0);
    expect(writes.total).toBe(0);
  });

  it("reads only the chunk that holds the removed message", async () => {
    reads.chunk = 0;
    writes.chunk = 0;

    await purge_search_index({ ids: ["msg-2100"] });

    expect(reads.chunk).toBe(1);
    expect(writes.chunk).toBe(1);
    expect(await disk_ids()).not.toContain("msg-2100");
  });

  it("learns the ids of older chunks on the first pass and skips them after", async () => {
    strip_id_filters();
    reads.chunk = 0;

    await purge_search_index({ ids: ["draft-7f3a"] });

    expect(reads.chunk).toBe(manifest().chunk_ids.length);
    expect(await disk_ids()).toHaveLength(MAILBOX_SIZE);

    reads.chunk = 0;
    writes.total = 0;

    await purge_search_index({ ids: ["scheduled-91bc"] });

    expect(reads.chunk).toBe(0);
    expect(writes.total).toBe(0);

    await purge_search_index({ ids: ["msg-4400"] });

    expect(await disk_ids()).not.toContain("msg-4400");
    expect(await disk_ids()).toHaveLength(MAILBOX_SIZE - 1);
  });

  it("keeps mail indexed while the server listing was in flight", async () => {
    const mail = await import("@/services/api/mail");
    const original = mail.list_encrypted_mail_items;
    let uncursored = 0;
    let reached: () => void = () => {};
    let release: () => void = () => {};
    const at_head = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi
      .spyOn(mail, "list_encrypted_mail_items")
      .mockImplementation(async (params) => {
        const response = await original(params);

        if (!params?.cursor) uncursored += 1;

        if (uncursored === 2 && !params?.cursor) {
          reached();
          await held;
        }

        return response;
      });

    try {
      const reconciling = reconcile_search_index(user_email);

      await at_head;

      server.mailbox = [make_item(MAILBOX_SIZE + 1), ...server.mailbox];
      mark_search_index_stale();
      await settle();

      expect(hot_ids()).toContain(`msg-${MAILBOX_SIZE + 1}`);

      release();

      expect(await reconciling).toBe(0);
    } finally {
      release();
      spy.mockRestore();
    }

    expect(hot_ids()).toContain(`msg-${MAILBOX_SIZE + 1}`);
    expect(await disk_ids()).toContain(`msg-${MAILBOX_SIZE + 1}`);
    expect(await disk_ids()).toHaveLength(MAILBOX_SIZE + 1);
  });

  it("still drops deleted mail while newer mail is being indexed", async () => {
    const mail = await import("@/services/api/mail");
    const original = mail.list_encrypted_mail_items;
    let uncursored = 0;
    let reached: () => void = () => {};
    let release: () => void = () => {};
    const at_head = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    server.mailbox = server.mailbox.filter((item) => item.id !== "msg-42");

    const spy = vi
      .spyOn(mail, "list_encrypted_mail_items")
      .mockImplementation(async (params) => {
        const response = await original(params);

        if (!params?.cursor) uncursored += 1;

        if (uncursored === 2 && !params?.cursor) {
          reached();
          await held;
        }

        return response;
      });

    try {
      const reconciling = reconcile_search_index(user_email);

      await at_head;
      release();

      expect(await reconciling).toBe(1);
    } finally {
      release();
      spy.mockRestore();
    }

    expect(hot_ids()).not.toContain("msg-42");
    expect(await disk_ids()).not.toContain("msg-42");
  });

  it("finishes a removal before a rebuild replaces the stored chunks", async () => {
    const old_chunks = new Set(chunk_keys());
    let hit = false;
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    reads.after_chunk = async () => {
      if (hit) return;

      hit = true;
      await held;
    };

    try {
      const purging = purge_search_index({ ids: ["msg-4400"] });

      while (!hit) await tick();

      server.mailbox = server.mailbox.filter((item) => item.id !== "msg-0");
      writes.chunk = 0;
      mark_search_index_stale();

      const rebuilding = settle();

      while (writes.chunk < 3) await tick();
      await tick(50);

      release();
      await purging;
      await rebuilding;
    } finally {
      release();
      reads.after_chunk = null;
    }

    const live = new Set(manifest().chunk_ids);
    const stored = chunk_keys();

    expect(hit).toBe(true);
    expect(stored).toHaveLength(live.size);
    for (const key of stored) {
      expect(live.has(Number(key.slice(key.lastIndexOf("_") + 1)))).toBe(true);
      expect(old_chunks.has(key)).toBe(false);
    }

    const ids = await disk_ids();

    expect(ids).not.toContain("msg-4400");
    expect(ids).not.toContain("msg-0");
    expect(ids).toHaveLength(MAILBOX_SIZE - 2);
    expect(manifest().total).toBe(MAILBOX_SIZE - 2);
  });

  it("treats a snapshot with no reconciliation stamp as due", async () => {
    const index = index_cache.cached_index as CachedIndex;

    expect(index.meta).toBeTruthy();
    index.meta!.verified_at = undefined;

    expect(is_index_reconcile_due(index)).toBe(true);
  });
});
