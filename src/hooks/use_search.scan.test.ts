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

import { describe, it, expect, beforeEach, vi } from "vitest";

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
  SNAPSHOT_CHUNK_SIZE,
  type PersistableEntry,
  type SnapshotMeta,
} from "@/services/search_index_store";
import {
  build_chunk_skip_plan,
  type ChunkSkipPlan,
} from "@/services/search_chunk_filter";
import {
  disk_ids_after_hot,
  scan_search_index,
  type CachedIndex,
  type DecryptedIndexEntry,
} from "@/hooks/use_search";

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

function make_entry(
  id: string,
  overrides?: { subject?: string; is_starred?: boolean },
): PersistableEntry {
  return {
    envelope: {
      subject: overrides?.subject ?? `subject ${id}`,
      body_text: "",
      body_html: "",
      from: { name: "Alice", email: "alice@example.com" },
      to: [],
      cc: [],
      bcc: [],
      sent_at: "2026-01-01T00:00:00Z",
    } as DecryptedEnvelope,
    metadata: {
      is_read: false,
      is_starred: overrides?.is_starred ?? false,
    } as MailItemMetadata,
    search_body_text: "",
    meta_fp: metadata_fingerprint(make_item(id)),
    has_body: false,
  };
}

async function write_chunks(
  ids: string[][],
  base?: SnapshotMeta | null,
): Promise<SnapshotMeta> {
  let meta = base ?? null;

  for (const group of ids) {
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
  const decrypted = new Map<string, DecryptedIndexEntry>(
    hot_ids.map((id) => [id, make_entry(id) as DecryptedIndexEntry]),
  );

  return {
    items: hot_ids.map(make_item),
    decrypted,
    built_at: Date.now(),
    include_body: false,
    user_email,
    disk_chunk_ids,
    total_indexed: hot_ids.length + disk_chunk_ids.length,
    complete: true,
    meta,
  };
}

describe("disk_ids_after_hot", () => {
  it("drops exactly the chunks the hot window already holds", () => {
    expect(disk_ids_after_hot([0, 1, 2, 3], SNAPSHOT_CHUNK_SIZE * 2)).toEqual([
      2, 3,
    ]);
  });

  it("keeps every chunk on disk when the hot window is empty", () => {
    expect(disk_ids_after_hot([4, 5], 0)).toEqual([4, 5]);
  });

  it("treats a partial hot chunk as a whole consumed chunk", () => {
    expect(disk_ids_after_hot([0, 1, 2], 5)).toEqual([1, 2]);
  });

  it("returns nothing when the hot window covers every chunk", () => {
    expect(disk_ids_after_hot([0, 1], SNAPSHOT_CHUNK_SIZE * 2)).toEqual([]);
  });
});

describe("scan_search_index", () => {
  beforeEach(() => {
    store.clear();
    invalidate_snapshot_caches();
  });

  it("visits the hot window before streaming any disk chunk", async () => {
    const meta = await write_chunks([["disk-a"], ["disk-b"]]);
    const index = make_index(["hot-1", "hot-2"], meta, meta.chunk_ids);
    const seen: string[] = [];

    const stopped = await scan_search_index(
      index,
      (item) => {
        seen.push(item.id);

        return true;
      },
      () => false,
    );

    expect(stopped).toBe(false);
    expect(seen).toEqual(["hot-1", "hot-2", "disk-a", "disk-b"]);
  });

  it("never touches disk when the index has no disk chunks", async () => {
    const index = make_index(["hot-1"], null, []);
    const seen: string[] = [];

    await scan_search_index(
      index,
      (item) => {
        seen.push(item.id);

        return true;
      },
      () => false,
    );

    expect(seen).toEqual(["hot-1"]);
  });

  it("reports an early stop inside the hot window without reading disk", async () => {
    const meta = await write_chunks([["disk-a"]]);
    const index = make_index(["hot-1", "hot-2"], meta, meta.chunk_ids);
    const seen: string[] = [];

    const stopped = await scan_search_index(
      index,
      (item) => {
        seen.push(item.id);

        return false;
      },
      () => false,
    );

    expect(stopped).toBe(true);
    expect(seen).toEqual(["hot-1"]);
  });

  it("stops streaming further chunks once the visitor is satisfied", async () => {
    const meta = await write_chunks([["disk-a"], ["disk-b"], ["disk-c"]]);
    const index = make_index([], meta, meta.chunk_ids);
    const seen: string[] = [];

    const stopped = await scan_search_index(
      index,
      (item) => {
        seen.push(item.id);

        return seen.length < 2;
      },
      () => false,
    );

    expect(stopped).toBe(true);
    expect(seen).toEqual(["disk-a", "disk-b"]);
  });

  it("stops when aborted between chunks", async () => {
    const meta = await write_chunks([["disk-a"], ["disk-b"]]);
    const index = make_index([], meta, meta.chunk_ids);
    const seen: string[] = [];
    let aborted = false;

    const stopped = await scan_search_index(
      index,
      (item) => {
        seen.push(item.id);
        aborted = true;

        return true;
      },
      () => aborted,
    );

    expect(stopped).toBe(true);
    expect(seen).toEqual(["disk-a"]);
  });

  it("skips a chunk whose record is gone instead of aborting the scan", async () => {
    const meta = await write_chunks([["disk-a"], ["disk-b"]]);
    const index = make_index([], meta, [...meta.chunk_ids, 99]);
    const seen: string[] = [];

    const stopped = await scan_search_index(
      index,
      (item) => {
        seen.push(item.id);

        return true;
      },
      () => false,
    );

    expect(stopped).toBe(false);
    expect(seen).toEqual(["disk-a", "disk-b"]);
  });

  it("reports an unreadable chunk so results can be flagged incomplete", async () => {
    const meta = await write_chunks([["disk-a"]]);
    const index = make_index([], meta, [...meta.chunk_ids, 99]);
    const seen: string[] = [];
    let unreadable = 0;

    await scan_search_index(
      index,
      (item) => {
        seen.push(item.id);

        return true;
      },
      () => false,
      {
        on_unreadable_chunk: () => {
          unreadable++;
        },
      },
    );

    expect(seen).toEqual(["disk-a"]);
    expect(unreadable).toBe(1);
  });

  it("leaves the unreadable report untouched when every chunk loads", async () => {
    const meta = await write_chunks([["disk-a"], ["disk-b"]]);
    const index = make_index([], meta, meta.chunk_ids);
    let unreadable = 0;

    await scan_search_index(
      index,
      () => true,
      () => false,
      {
        on_unreadable_chunk: () => {
          unreadable++;
        },
      },
    );

    expect(unreadable).toBe(0);
  });

  it("scans nothing from disk when the manifest belongs to another account", async () => {
    const meta = await write_chunks([["disk-a"]]);
    const index = make_index(["hot-1"], meta, meta.chunk_ids);
    const seen: string[] = [];

    index.user_email = "other@example.com";

    await scan_search_index(
      index,
      (item) => {
        seen.push(item.id);

        return true;
      },
      () => false,
    );

    expect(seen).toEqual(["hot-1"]);
  });
});

describe("scan_search_index chunk skipping", () => {
  beforeEach(() => {
    store.clear();
    invalidate_snapshot_caches();
  });

  async function write_tagged_chunks(
    groups: { id: string; subject?: string; is_starred?: boolean }[][],
  ): Promise<SnapshotMeta> {
    let meta: SnapshotMeta | null = null;

    for (const group of groups) {
      const writer = await open_snapshot_writer(user_email, meta);
      const items = group.map((entry) => make_item(entry.id));
      const entries = new Map<string, PersistableEntry>(
        group.map((entry) => [
          entry.id,
          make_entry(entry.id, {
            subject: entry.subject,
            is_starred: entry.is_starred,
          }),
        ]),
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

  async function collect(
    index: CachedIndex,
    plan: ChunkSkipPlan,
  ): Promise<string[]> {
    const seen: string[] = [];

    await scan_search_index(
      index,
      (item) => {
        seen.push(item.id);

        return true;
      },
      () => false,
      { skip: plan },
    );

    return seen;
  }

  it("skips a chunk whose gram filter cannot hold the term", async () => {
    const meta = await write_tagged_chunks([
      [{ id: "quarterly-1", subject: "Quarterly report" }],
      [{ id: "holiday-1", subject: "Holiday photos" }],
    ]);
    const index = make_index([], meta, meta.chunk_ids);

    expect(
      await collect(
        index,
        build_chunk_skip_plan({
          terms: ["quarterly"],
          operators: [],
          probe_terms: true,
        }),
      ),
    ).toEqual(["quarterly-1"]);
  });

  it("visits every chunk when the term cannot be probed", async () => {
    const meta = await write_tagged_chunks([
      [{ id: "quarterly-1", subject: "Quarterly report" }],
      [{ id: "holiday-1", subject: "Holiday photos" }],
    ]);
    const index = make_index([], meta, meta.chunk_ids);

    expect(
      await collect(
        index,
        build_chunk_skip_plan({
          terms: ["quarterly"],
          operators: [],
          probe_terms: false,
        }),
      ),
    ).toEqual(["quarterly-1", "holiday-1"]);
  });

  it("skips a chunk that no item can satisfy structurally", async () => {
    const meta = await write_tagged_chunks([
      [{ id: "starred-1", is_starred: true }],
      [{ id: "plain-1" }],
    ]);
    const index = make_index([], meta, meta.chunk_ids);

    expect(
      await collect(
        index,
        build_chunk_skip_plan({
          terms: [],
          operators: [],
          filters: { is_starred: true },
          probe_terms: false,
        }),
      ),
    ).toEqual(["starred-1"]);
  });

  it("still scans the hot window when every disk chunk is skipped", async () => {
    const meta = await write_tagged_chunks([[{ id: "plain-1" }]]);
    const index = make_index(["hot-1"], meta, meta.chunk_ids);

    expect(
      await collect(
        index,
        build_chunk_skip_plan({
          terms: [],
          operators: [],
          filters: { is_starred: true },
          probe_terms: false,
        }),
      ),
    ).toEqual(["hot-1"]);
  });

  it("reports progress after the hot window and after every streamed chunk", async () => {
    const meta = await write_tagged_chunks([
      [{ id: "disk-a" }],
      [{ id: "disk-b" }],
    ]);
    const index = make_index(["hot-1"], meta, meta.chunk_ids);
    const events: string[] = [];

    await scan_search_index(
      index,
      (item) => {
        events.push(item.id);

        return true;
      },
      () => false,
      { on_chunk: () => events.push("flush") },
    );

    expect(events).toEqual([
      "hot-1",
      "flush",
      "disk-a",
      "flush",
      "disk-b",
      "flush",
    ]);
  });
});
