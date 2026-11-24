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
import type { CachedIndex, IndexingProgress } from "./types";

import { describe, it, expect, beforeEach, vi } from "vitest";

const { store, writes, server } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  writes: {
    chunk: 0,
    on_chunk: null as (() => Promise<void> | void) | null,
  },
  server: { mailbox: [] as MailItem[], envelope_decrypts: 0 },
}));

async function chunk_written(): Promise<void> {
  writes.chunk++;

  const hook = writes.on_chunk;

  if (hook) {
    writes.on_chunk = null;
    await hook();
  }
}

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_set: async (key: string, value: unknown) => {
    store.set(key, JSON.parse(JSON.stringify(value)));
  },
  encrypted_set_plaintext: async (key: string, plaintext: Uint8Array) => {
    store.set(key, JSON.parse(new TextDecoder().decode(plaintext)));
    if (key.includes("_chunk_")) await chunk_written();
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
  get_all_accounts: async () => [{ id: "account-1" }],
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

const user_email = "user@example.com";
const CHUNK = 2000;
const MAILBOX_SIZE = CHUNK * 2 + 500;
const MANIFEST_KEY = "search_index_account-1";

type IndexCacheModule = typeof import("./index_cache");
type ProgressModule = typeof import("./progress");

interface Tab {
  cache: IndexCacheModule;
  progress: ProgressModule;
  seen: IndexingProgress[];
}

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

async function open_tab(): Promise<Tab> {
  vi.resetModules();
  vi.doMock("./constants", async (original) => ({
    ...(await original<typeof import("./constants")>()),
    HOT_CHUNK_COUNT: 1,
    MAX_RAM_INDEX_ITEMS: CHUNK,
    DEEP_SEGMENT_PAUSE_MS: 0,
  }));

  const cache = await import("./index_cache");
  const progress = await import("./progress");
  const seen: IndexingProgress[] = [];

  progress.subscribe_indexing(() => {
    seen.push({ ...progress.get_indexing_snapshot() });
  });

  return { cache, progress, seen };
}

async function wait_idle(tab: Tab): Promise<void> {
  while (tab.cache.index_build_promise || tab.cache.is_deep_index_running()) {
    await tab.cache.index_build_promise?.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function settle(
  tab: Tab,
  include_body = false,
): Promise<CachedIndex | null> {
  await tab.cache.build_search_index(user_email, include_body);
  await wait_idle(tab);

  return tab.cache.cached_index;
}

async function refresh(
  tab: Tab,
  include_body = false,
): Promise<CachedIndex | null> {
  tab.cache.mark_search_index_stale();

  return settle(tab, include_body);
}

interface DiskManifest {
  chunk_ids: number[];
  complete: boolean;
  total: number;
  include_body: boolean;
  next_cursor?: string;
}

function manifest(): DiskManifest {
  return store.get(MANIFEST_KEY) as DiskManifest;
}

function disk_ids(): string[] {
  const ids: string[] = [];

  for (const chunk_id of manifest().chunk_ids) {
    const chunk = store.get(`${MANIFEST_KEY}_chunk_${chunk_id}`) as
      | { items: { id: string }[] }
      | undefined;

    expect(chunk).toBeDefined();
    for (const item of chunk!.items) ids.push(item.id);
  }

  return ids;
}

function building_snapshots(tab: Tab): IndexingProgress[] {
  return tab.seen.filter((snapshot) => snapshot.building);
}

function reset_counters(tab: Tab): void {
  writes.chunk = 0;
  server.envelope_decrypts = 0;
  tab.seen.length = 0;
}

async function build_paused_after_front(tab: Tab): Promise<void> {
  writes.on_chunk = () => tab.progress.pause_index_download();
  await settle(tab);
}

describe("search index keeps its finished state", () => {
  beforeEach(async () => {
    try {
      localStorage.clear();
    } catch {
      return;
    }
    store.clear();
    writes.on_chunk = null;
    server.mailbox = Array.from({ length: MAILBOX_SIZE }, (_, n) =>
      make_item(n),
    );
  });

  it("does not index again after a reload once the index is complete", async () => {
    const first = await open_tab();

    await settle(first);
    expect(manifest().complete).toBe(true);
    server.mailbox.unshift(make_item(MAILBOX_SIZE));

    const reloaded = await open_tab();

    reset_counters(reloaded);
    await settle(reloaded);

    expect(building_snapshots(reloaded)).toEqual([]);
    expect(server.envelope_decrypts).toBe(1);
    expect(manifest().complete).toBe(true);
    expect(manifest().total).toBe(MAILBOX_SIZE + 1);
    expect(disk_ids()).toEqual(server.mailbox.map((item) => item.id));
  });

  it("indexes new mail incrementally without a full index run", async () => {
    const tab = await open_tab();

    await settle(tab);

    const tail = manifest().chunk_ids.slice(1);

    server.mailbox.unshift(make_item(MAILBOX_SIZE), make_item(MAILBOX_SIZE + 1));
    reset_counters(tab);

    const index = await refresh(tab);

    expect(building_snapshots(tab)).toEqual([]);
    expect(server.envelope_decrypts).toBe(2);
    expect(writes.chunk).toBeLessThanOrEqual(2);
    expect(manifest().chunk_ids.slice(-tail.length)).toEqual(tail);
    expect(manifest().complete).toBe(true);
    expect(index?.complete).toBe(true);
    expect(index?.total_indexed).toBe(MAILBOX_SIZE + 2);
    expect(disk_ids()).toEqual(server.mailbox.map((item) => item.id));
  });

  it("keeps the rest of the index when the first stored message is deleted", async () => {
    const tab = await open_tab();

    await settle(tab);
    server.mailbox.splice(CHUNK, 1);
    reset_counters(tab);

    await refresh(tab);

    expect(building_snapshots(tab)).toEqual([]);
    expect(server.envelope_decrypts).toBe(0);
    expect(manifest().complete).toBe(true);
  });

  it("does not drop message content when a search skips content", async () => {
    const tab = await open_tab();

    await settle(tab, true);
    expect(manifest().include_body).toBe(true);

    await refresh(tab, false);
    expect(manifest().include_body).toBe(true);

    reset_counters(tab);
    await refresh(tab, true);

    expect(building_snapshots(tab)).toEqual([]);
    expect(server.envelope_decrypts).toBe(0);
    expect(manifest().include_body).toBe(true);
    expect(manifest().complete).toBe(true);
  });

  it("resumes progress from the checkpoint instead of zero", async () => {
    const tab = await open_tab();

    await build_paused_after_front(tab);
    expect(manifest().complete).toBe(false);
    expect(manifest().total).toBe(CHUNK);

    reset_counters(tab);
    tab.progress.resume_index_download(user_email, false);
    await wait_idle(tab);

    const active = building_snapshots(tab);

    expect(active.length).toBeGreaterThan(0);
    expect(Math.min(...active.map((snapshot) => snapshot.current))).toBe(
      CHUNK,
    );
    expect(manifest().complete).toBe(true);
    expect(manifest().total).toBe(MAILBOX_SIZE);
  });

  it("resumes progress from the checkpoint after a reload", async () => {
    const first = await open_tab();

    await build_paused_after_front(first);
    writes.on_chunk = null;
    expect(manifest().complete).toBe(false);
    expect(disk_ids()).toHaveLength(CHUNK);
    first.cache.reset_index_cache();

    const reloaded = await open_tab();

    reset_counters(reloaded);
    reloaded.progress.resume_index_download(user_email, false);
    await settle(reloaded);

    const active = building_snapshots(reloaded);

    expect(active.length).toBeGreaterThan(0);
    expect(Math.min(...active.map((snapshot) => snapshot.current))).toBe(
      CHUNK,
    );
    expect(server.envelope_decrypts).toBe(MAILBOX_SIZE - CHUNK);
    expect(manifest().complete).toBe(true);
  });

  it("keeps the finished index when a second tab saves an older copy", async () => {
    const first = await open_tab();

    await build_paused_after_front(first);
    first.cache.reset_index_cache();

    const second = await open_tab();

    second.progress.resume_index_download(user_email, false);
    second.cache.reset_index_cache();
    second.progress.pause_index_download();
    await settle(second);
    expect(manifest().complete).toBe(false);

    second.progress.resume_index_download(user_email, false);
    second.cache.reset_index_cache();

    const third = await open_tab();

    server.mailbox[5] = { ...server.mailbox[5], is_read: false };
    writes.on_chunk = async () => {
      const finisher = await open_tab();

      await settle(finisher);
      expect(manifest().complete).toBe(true);
    };
    reset_counters(third);
    await settle(third);

    expect(manifest().complete).toBe(true);
    expect(manifest().total).toBe(MAILBOX_SIZE);
    expect(disk_ids()).toHaveLength(MAILBOX_SIZE);
    expect(third.cache.cached_index?.complete).toBe(true);
    expect(third.cache.is_deep_index_running()).toBe(false);
  });
});
