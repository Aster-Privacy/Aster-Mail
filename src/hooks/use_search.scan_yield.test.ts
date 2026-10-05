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
import type { DecryptedEnvelope, MailItemMetadata } from "@/types/email";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_set: async (key: string, value: unknown) => {
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
  get_passphrase_bytes: vi.fn(),
  get_passphrase_from_memory: vi.fn(),
  get_vault_from_memory: vi.fn(),
}));
vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "account-1",
}));
vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(),
}));
vi.mock("@/services/api/mail", () => ({
  list_encrypted_mail_items: vi.fn(),
  list_mail_items: vi.fn(),
  reencrypt_mail_item_envelope: vi.fn(),
}));
vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(),
}));
vi.mock("@/services/crypto/envelope", () => ({
  decrypt_envelope_with_bytes: vi.fn(),
  encrypt_envelope_with_identity_key: vi.fn(),
  base64_to_array: vi.fn(),
  normalize_envelope_from: vi.fn(),
}));
vi.mock("@/workers/pgp_decrypt_pool", () => ({
  decrypt_pgp_message_parallel: vi.fn(),
}));

import {
  open_snapshot_writer,
  invalidate_snapshot_caches,
  metadata_fingerprint,
  type PersistableEntry,
  type SnapshotMeta,
} from "@/services/search_index_store";
import {
  scan_search_index,
  type CachedIndex,
  type DecryptedIndexEntry,
} from "@/hooks/use_search";
import { SCAN_YIELD_MS } from "@/hooks/use_search/constants";

const user_email = "user@example.com";

function make_item(id: string): MailItem {
  return {
    id,
    item_type: "received",
    encrypted_envelope: "",
    envelope_nonce: "",
    folder_token: "inbox",
    is_external: false,
    created_at: "2026-01-01T00:00:00Z",
  } as MailItem;
}

function make_entry(id: string): PersistableEntry {
  return {
    envelope: {
      subject: `subject ${id}`,
      body_text: "",
      body_html: "",
      from: { name: "Alice", email: "alice@example.com" },
      to: [],
      cc: [],
      bcc: [],
      sent_at: "2026-01-01T00:00:00Z",
    } as DecryptedEnvelope,
    metadata: { is_read: false, is_starred: false } as MailItemMetadata,
    search_body_text: "",
    meta_fp: metadata_fingerprint(make_item(id)),
    has_body: false,
  };
}

function chunk_ids(chunk: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `c${chunk}-${i}`);
}

async function write_chunks(groups: string[][]): Promise<SnapshotMeta> {
  let meta: SnapshotMeta | null = null;

  for (const group of groups) {
    const writer = await open_snapshot_writer(user_email, meta);
    const items = group.map(make_item);
    const entries = new Map<string, PersistableEntry>(
      group.map((id) => [id, make_entry(id)]),
    );

    await writer!.add_page(items, entries);
    meta = await writer!.finish({
      complete: true,
      include_body: false,
      keep_chunk_ids: meta?.chunk_ids,
      kept_total: meta?.total,
      keep_first: true,
    });
  }

  return meta as SnapshotMeta;
}

function make_index(
  hot_ids: string[],
  meta: SnapshotMeta | null,
  disk_chunk_ids: number[],
): CachedIndex {
  return {
    items: hot_ids.map(make_item),
    decrypted: new Map<string, DecryptedIndexEntry>(
      hot_ids.map((id) => [id, make_entry(id) as DecryptedIndexEntry]),
    ),
    built_at: Date.now(),
    include_body: false,
    user_email,
    disk_chunk_ids,
    total_indexed: hot_ids.length + disk_chunk_ids.length,
    complete: true,
    meta,
  };
}

let clock = 0;

function spend(ms: number): void {
  clock += ms;
}

describe("scan_search_index disk chunk slicing", () => {
  beforeEach(() => {
    store.clear();
    invalidate_snapshot_caches();
    clock = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets a pending abort through once the budget is spent inside a chunk", async () => {
    const meta = await write_chunks([chunk_ids(0, 40)]);
    const index = make_index([], meta, meta.chunk_ids);
    const seen: string[] = [];
    let aborted = false;

    const stopped = await scan_search_index(
      index,
      (item) => {
        if (seen.length === 0) {
          setTimeout(() => {
            aborted = true;
          }, 0);
        }

        seen.push(item.id);
        spend(SCAN_YIELD_MS + 2);

        return true;
      },
      () => aborted,
    );

    expect(stopped).toBe(true);
    expect(seen.length).toBe(1);
  });

  it("releases the main thread between a chunk read and its matching", async () => {
    const meta = await write_chunks([chunk_ids(0, 3)]);
    const index = make_index([], meta, meta.chunk_ids);
    const seen: string[] = [];
    let aborted = false;

    await scan_search_index(
      index,
      (item) => {
        seen.push(item.id);

        return true;
      },
      () => aborted,
      {
        on_chunk: () => {
          if (seen.length === 0) {
            spend(SCAN_YIELD_MS + 2);
            setTimeout(() => {
              aborted = true;
            }, 0);
          }
        },
      },
    );

    expect(seen.length).toBe(0);
  });

  it("visits every entry of every chunk in order while yielding", async () => {
    const groups = [chunk_ids(0, 37), chunk_ids(1, 41), chunk_ids(2, 23)];
    const meta = await write_chunks(groups);
    const hot = ["hot-0", "hot-1", "hot-2"];
    const index = make_index(hot, meta, meta.chunk_ids);
    const seen: string[] = [];
    let yields = 0;
    const timer = setTimeout;
    const timer_spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: () => void,
      ms?: number,
    ) => {
      yields++;

      return timer(fn, ms);
    }) as typeof setTimeout);

    const stopped = await scan_search_index(
      index,
      (item) => {
        seen.push(item.id);
        spend(3);

        return true;
      },
      () => false,
    );

    timer_spy.mockRestore();

    expect(stopped).toBe(false);
    expect(seen).toEqual([...hot, ...groups.flat()]);
    expect(yields).toBeGreaterThanOrEqual(Math.floor(seen.length / 4));
  });

  it("stops at the same entry as an unsliced scan would", async () => {
    const groups = [chunk_ids(0, 30), chunk_ids(1, 30)];
    const meta = await write_chunks(groups);
    const index = make_index([], meta, meta.chunk_ids);
    const seen: string[] = [];

    const stopped = await scan_search_index(
      index,
      (item) => {
        seen.push(item.id);
        spend(5);

        return seen.length < 45;
      },
      () => false,
    );

    expect(stopped).toBe(true);
    expect(seen).toEqual(groups.flat().slice(0, 45));
  });
});
