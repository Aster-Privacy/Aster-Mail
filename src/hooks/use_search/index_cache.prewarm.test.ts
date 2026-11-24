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

import { describe, it, expect, beforeEach, vi } from "vitest";

const { store, writes, server } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  writes: {
    chunk: 0,
    on_chunk: null as (() => Promise<void> | void) | null,
  },
  server: { mailbox: [] as MailItem[], envelope_decrypts: 0, list_calls: 0 },
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
    server.list_calls++;
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
const MAILBOX_SIZE = 300;
const MANIFEST_KEY = "search_index_account-1";

type IndexCacheModule = typeof import("./index_cache");

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

async function open_tab(): Promise<IndexCacheModule> {
  vi.resetModules();
  vi.doMock("./constants", async (original) => ({
    ...(await original<typeof import("./constants")>()),
    RECONCILE_INTERVAL_MS: 0,
    RECONCILE_RETRY_MS: 0,
    DEEP_SEGMENT_PAUSE_MS: 0,
  }));

  return import("./index_cache");
}

async function wait_idle(cache: IndexCacheModule): Promise<void> {
  for (let i = 0; i < 400; i++) {
    await cache.index_build_promise?.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (!cache.index_build_promise && !cache.is_deep_index_running()) return;
  }
}

function disk_ids(): string[] {
  const meta = store.get(MANIFEST_KEY) as { chunk_ids: number[] } | undefined;
  const ids: string[] = [];

  for (const chunk_id of meta?.chunk_ids ?? []) {
    const chunk = store.get(`${MANIFEST_KEY}_chunk_${chunk_id}`) as
      { items: { id: string }[] } | undefined;

    for (const item of chunk?.items ?? []) ids.push(item.id);
  }

  return ids;
}

async function searched_before(include_body: boolean): Promise<void> {
  const cache = await open_tab();

  await cache.build_search_index(user_email, include_body);
  await wait_idle(cache);
}

describe("prewarming the search index at startup", () => {
  beforeEach(() => {
    store.clear();
    server.list_calls = 0;
    server.envelope_decrypts = 0;
    server.mailbox = Array.from({ length: MAILBOX_SIZE }, (_, n) =>
      make_item(n),
    );
  });

  it("does not download mail when this device has no index yet", async () => {
    const cache = await open_tab();

    await cache.prewarm_search_index(user_email, true);
    await wait_idle(cache);

    expect(server.list_calls).toBe(0);
    expect(server.envelope_decrypts).toBe(0);
    expect(store.has(MANIFEST_KEY)).toBe(false);
    expect(cache.cached_index).toBeNull();
  });

  it("loads an existing index and clears mail deleted since", async () => {
    await searched_before(false);
    expect(disk_ids()).toContain("msg-7");

    server.mailbox = server.mailbox.filter((item) => item.id !== "msg-7");
    const cache = await open_tab();

    await cache.prewarm_search_index(user_email, false);
    await wait_idle(cache);
    for (let i = 0; i < 200 && disk_ids().includes("msg-7"); i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect(cache.cached_index?.items.length).toBeGreaterThan(0);
    expect(disk_ids()).not.toContain("msg-7");
  });

  it("does not turn an existing index into a content index on its own", async () => {
    await searched_before(false);
    const cache = await open_tab();

    server.list_calls = 0;
    server.envelope_decrypts = 0;
    await cache.prewarm_search_index(user_email, true);
    await wait_idle(cache);

    expect(server.envelope_decrypts).toBe(0);
    expect(cache.cached_index?.include_body).toBe(false);
  });
});
