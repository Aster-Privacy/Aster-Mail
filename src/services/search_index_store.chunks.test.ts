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

const { store, write_hook } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  write_hook: { calls: 0, fail_after: Number.POSITIVE_INFINITY },
}));

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_set: async (key: string, value: unknown) => {
    write_hook.calls++;

    if (write_hook.calls > write_hook.fail_after) {
      throw new Error("QuotaExceededError");
    }

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

import {
  bound_index_body,
  open_snapshot_writer,
  open_snapshot_reader,
  index_storage_ceiling,
  invalidate_snapshot_caches,
  metadata_fingerprint,
  slim_envelope_for_index,
  MAX_INDEX_BODY_CHARS,
  MAX_INDEX_PREVIEW_CHARS,
  SNAPSHOT_CHUNK_SIZE,
  type PersistableEntry,
} from "@/services/search_index_store";
import {
  build_chunk_skip_plan,
  FLAG_READ,
  FLAG_UNREAD,
} from "@/services/search_chunk_filter";

const user_email = "user@example.com";

function make_item(id: string): MailItem {
  return {
    id,
    item_type: "received",
    encrypted_envelope: "ciphertext-envelope",
    envelope_nonce: "nonce",
    folder_token: "inbox",
    is_external: false,
    created_at: "2026-01-01T00:00:00Z",
    encrypted_metadata: "abcdefghijklmnopqrstuvwxyz0123456789",
    metadata_nonce: "meta-nonce",
  } as MailItem;
}

function make_entry(id: string): PersistableEntry {
  return {
    envelope: {
      subject: `subject ${id}`,
      body_text: `body ${id}`,
      body_html: "<p>huge html</p>",
      html_body: "<p>huge html</p>",
      from: { name: "Alice", email: "alice@example.com" },
      to: [],
      cc: [],
      bcc: [],
      sent_at: "2026-01-01T00:00:00Z",
    } as DecryptedEnvelope,
    metadata: { is_read: true } as MailItemMetadata,
    search_body_text: `body ${id}`,
    meta_fp: metadata_fingerprint(make_item(id)),
    has_body: true,
  };
}

function make_page(
  start: number,
  count: number,
): {
  items: MailItem[];
  entries: Map<string, PersistableEntry>;
} {
  const items: MailItem[] = [];
  const entries = new Map<string, PersistableEntry>();

  for (let i = start; i < start + count; i++) {
    const id = `msg-${i}`;

    items.push(make_item(id));
    entries.set(id, make_entry(id));
  }

  return { items, entries };
}

function chunk_keys(): string[] {
  return [...store.keys()].filter((k) => k.includes("_chunk_")).sort();
}

function keys_with(fragment: string): string[] {
  return [...store.keys()].filter((k) => k.includes(fragment)).sort();
}

describe("chunked snapshot writer", () => {
  beforeEach(() => {
    store.clear();
    write_hook.calls = 0;
    write_hook.fail_after = Number.POSITIVE_INFINITY;
    invalidate_snapshot_caches();
  });

  it("splits written pages into fixed-size chunks", async () => {
    const writer = await open_snapshot_writer(user_email);
    const page = make_page(0, SNAPSHOT_CHUNK_SIZE + 5);

    await writer!.add_page(page.items, page.entries);
    const meta = await writer!.finish({ complete: true, include_body: true });

    expect(meta).not.toBeNull();
    expect(meta!.chunk_ids).toEqual([0, 1]);
    expect(meta!.total).toBe(SNAPSHOT_CHUNK_SIZE + 5);
    expect(chunk_keys()).toHaveLength(2);
  });

  it("round-trips items and entries through the reader with ciphertext stripped", async () => {
    const writer = await open_snapshot_writer(user_email);
    const page = make_page(0, 3);

    await writer!.add_page(page.items, page.entries);
    await writer!.finish({ complete: true, include_body: true });

    const reader = await open_snapshot_reader(user_email);

    expect(reader).not.toBeNull();
    expect(reader!.meta.complete).toBe(true);
    expect(reader!.meta.include_body).toBe(true);

    const chunk = await reader!.read(reader!.meta.chunk_ids[0]);

    expect(chunk!.items).toHaveLength(3);
    expect(chunk!.items[0].encrypted_envelope).toBe("");
    expect(chunk!.items[0].encrypted_metadata).toBe("");
    expect(chunk!.entries[0].envelope?.body_html).toBe("");
    expect(chunk!.entries[0].envelope?.body_text).toBe("body msg-0");
    expect(chunk!.entries[0].search_body_text).toBe("body msg-0");
  });

  it("refuses a snapshot written for another account email", async () => {
    const writer = await open_snapshot_writer(user_email);
    const page = make_page(0, 2);

    await writer!.add_page(page.items, page.entries);
    await writer!.finish({ complete: true, include_body: false });

    expect(await open_snapshot_reader("someone_else@example.com")).toBeNull();
  });

  it("records include_body false so a body search cannot reuse a header-only index", async () => {
    const writer = await open_snapshot_writer(user_email);
    const page = make_page(0, 2);

    await writer!.add_page(page.items, page.entries);
    await writer!.finish({
      complete: false,
      next_cursor: "cursor-1",
      include_body: false,
    });

    const reader = await open_snapshot_reader(user_email);

    expect(reader!.meta.include_body).toBe(false);
    expect(reader!.meta.complete).toBe(false);
    expect(reader!.meta.next_cursor).toBe("cursor-1");
  });

  it("appends deeper chunks after the kept ones with keep_first", async () => {
    const first = await open_snapshot_writer(user_email);
    const newest = make_page(0, 2);

    await first!.add_page(newest.items, newest.entries);
    const base = await first!.finish({ complete: false, include_body: true });

    const deeper = await open_snapshot_writer(user_email, base);
    const page = make_page(2, 2);

    await deeper!.add_page(page.items, page.entries);
    const meta = await deeper!.finish({
      complete: true,
      include_body: true,
      keep_chunk_ids: base!.chunk_ids,
      kept_total: base!.total,
      keep_first: true,
    });

    expect(meta!.chunk_ids).toEqual([0, 1]);
    expect(meta!.total).toBe(4);

    const reader = await open_snapshot_reader(user_email);
    const older = await reader!.read(1);

    expect(older!.items.map((i) => i.id)).toEqual(["msg-2", "msg-3"]);
  });

  it("prepends refreshed front chunks before the kept tail", async () => {
    const first = await open_snapshot_writer(user_email);
    const original = make_page(0, 3);

    await first!.add_page(original.items, original.entries);
    const base = await first!.finish({ complete: true, include_body: true });

    const front = await open_snapshot_writer(user_email, base);
    const fresh = make_page(100, 2);

    await front!.add_page(fresh.items, fresh.entries);
    const meta = await front!.finish({
      complete: true,
      include_body: true,
      keep_chunk_ids: base!.chunk_ids,
      kept_total: base!.total,
    });

    expect(meta!.chunk_ids).toEqual([1, 0]);

    const reader = await open_snapshot_reader(user_email);
    const newest = await reader!.read(meta!.chunk_ids[0]);

    expect(newest!.items.map((i) => i.id)).toEqual(["msg-100", "msg-101"]);
  });

  it("sweeps chunk records that the new manifest no longer references", async () => {
    const first = await open_snapshot_writer(user_email);
    const page = make_page(0, 2);

    await first!.add_page(page.items, page.entries);
    const base = await first!.finish({ complete: true, include_body: true });

    expect(chunk_keys()).toHaveLength(1);

    const rebuild = await open_snapshot_writer(user_email, base);
    const replacement = make_page(50, 2);

    await rebuild!.add_page(replacement.items, replacement.entries);
    const meta = await rebuild!.finish({ complete: true, include_body: true });

    expect(meta!.chunk_ids).toEqual([1]);
    expect(chunk_keys()).toHaveLength(1);
    expect(chunk_keys()[0].endsWith("_chunk_1")).toBe(true);
  });

  it("deletes its own chunks when discarded", async () => {
    const writer = await open_snapshot_writer(user_email);
    const page = make_page(0, SNAPSHOT_CHUNK_SIZE + 1);

    await writer!.add_page(page.items, page.entries);

    expect(chunk_keys()).toHaveLength(1);

    await writer!.discard();

    expect(chunk_keys()).toHaveLength(0);
    expect(await open_snapshot_reader(user_email)).toBeNull();
  });

  it("counts buffered items that have not been flushed yet", async () => {
    const writer = await open_snapshot_writer(user_email);
    const page = make_page(0, 7);

    await writer!.add_page(page.items, page.entries);

    expect(writer!.written_count()).toBe(7);
  });

  it("skips items with no decrypted entry", async () => {
    const writer = await open_snapshot_writer(user_email);
    const page = make_page(0, 3);

    page.entries.delete("msg-1");

    await writer!.add_page(page.items, page.entries);
    const meta = await writer!.finish({ complete: true, include_body: true });

    expect(meta!.total).toBe(2);

    const reader = await open_snapshot_reader(user_email);
    const chunk = await reader!.read(0);

    expect(chunk!.items.map((i) => i.id)).toEqual(["msg-0", "msg-2"]);
  });
});

describe("chunk digests", () => {
  beforeEach(() => {
    store.clear();
    write_hook.calls = 0;
    write_hook.fail_after = Number.POSITIVE_INFINITY;
    invalidate_snapshot_caches();
  });

  it("writes one gram record per chunk and groups the summaries", async () => {
    const writer = await open_snapshot_writer(user_email);
    const page = make_page(0, SNAPSHOT_CHUNK_SIZE + 5);

    await writer!.add_page(page.items, page.entries);
    await writer!.finish({ complete: true, include_body: true });

    expect(keys_with("_grams_")).toHaveLength(2);
    expect(keys_with("_sumg_")).toHaveLength(1);
  });

  it("summarizes the flags and grams the chunk actually holds", async () => {
    const writer = await open_snapshot_writer(user_email);
    const page = make_page(0, 3);

    await writer!.add_page(page.items, page.entries);
    await writer!.finish({ complete: true, include_body: true });

    const reader = await open_snapshot_reader(user_email);
    const summaries = await reader!.read_summaries([0]);
    const summary = summaries.get(0);

    expect(summary).toBeDefined();
    expect(summary!.flags & FLAG_READ).toBe(FLAG_READ);
    expect(summary!.flags & FLAG_UNREAD).toBe(0);
    expect(summary!.item_types).toEqual(["received"]);

    const filter = await reader!.read_grams(0);

    expect(filter).not.toBeNull();

    const present = build_chunk_skip_plan({
      terms: ["alice"],
      operators: [],
      probe_terms: true,
    });
    const absent = build_chunk_skip_plan({
      terms: ["zzzzqqqq"],
      operators: [],
      probe_terms: true,
    });

    expect(present.skip_by_grams(filter!)).toBe(false);
    expect(absent.skip_by_grams(filter!)).toBe(true);
  });

  it("sweeps gram records for chunks the new manifest dropped", async () => {
    const first = await open_snapshot_writer(user_email);
    const page = make_page(0, 2);

    await first!.add_page(page.items, page.entries);
    const base = await first!.finish({ complete: true, include_body: true });

    const rebuild = await open_snapshot_writer(user_email, base);
    const replacement = make_page(50, 2);

    await rebuild!.add_page(replacement.items, replacement.entries);
    await rebuild!.finish({ complete: true, include_body: true });

    expect(keys_with("_grams_")).toHaveLength(1);
    expect(keys_with("_grams_")[0].endsWith("_grams_1")).toBe(true);
  });

  it("prunes summaries of dropped chunks while keeping the live ones", async () => {
    const first = await open_snapshot_writer(user_email);
    const page = make_page(0, 2);

    await first!.add_page(page.items, page.entries);
    const base = await first!.finish({ complete: true, include_body: true });

    const front = await open_snapshot_writer(user_email, base);
    const fresh = make_page(100, 2);

    await front!.add_page(fresh.items, fresh.entries);
    const kept = await front!.finish({
      complete: true,
      include_body: true,
      keep_chunk_ids: base!.chunk_ids,
      kept_total: base!.total,
    });

    expect(kept!.chunk_ids).toEqual([1, 0]);

    const kept_reader = await open_snapshot_reader(user_email);
    const both = await kept_reader!.read_summaries([0, 1]);

    expect([...both.keys()].sort()).toEqual([0, 1]);

    const rebuild = await open_snapshot_writer(user_email, kept);
    const replacement = make_page(200, 2);

    await rebuild!.add_page(replacement.items, replacement.entries);
    await rebuild!.finish({ complete: true, include_body: true });

    const reader = await open_snapshot_reader(user_email);
    const summaries = await reader!.read_summaries([0, 1, 2]);

    expect([...summaries.keys()]).toEqual([2]);
  });

  it("deletes a summary group once none of its chunks survive", async () => {
    const first = await open_snapshot_writer(user_email);
    const page = make_page(0, 2);

    await first!.add_page(page.items, page.entries);
    const base = await first!.finish({ complete: true, include_body: true });

    const empty = await open_snapshot_writer(user_email, base);

    await empty!.finish({ complete: true, include_body: true });

    expect(keys_with("_sumg_")).toHaveLength(0);
    expect(keys_with("_grams_")).toHaveLength(0);
    expect(chunk_keys()).toHaveLength(0);
  });

  it("reports no summary or gram record for an unknown chunk", async () => {
    const writer = await open_snapshot_writer(user_email);
    const page = make_page(0, 2);

    await writer!.add_page(page.items, page.entries);
    await writer!.finish({ complete: true, include_body: true });

    const reader = await open_snapshot_reader(user_email);

    expect((await reader!.read_summaries([77])).size).toBe(0);
    expect(await reader!.read_grams(77)).toBeNull();
    expect(await reader!.read_grams(77)).toBeNull();
  });

  it("serves a repeated chunk read from the decrypted cache", async () => {
    const writer = await open_snapshot_writer(user_email);
    const page = make_page(0, 2);

    await writer!.add_page(page.items, page.entries);
    await writer!.finish({ complete: true, include_body: true });

    const reader = await open_snapshot_reader(user_email);

    expect(await reader!.read(0)).not.toBeNull();

    for (const key of chunk_keys()) {
      store.delete(key);
    }

    const cached = await reader!.read(0);

    expect(cached!.items).toHaveLength(2);

    invalidate_snapshot_caches();

    expect(await reader!.read(0)).toBeNull();
  });

  it("drops its gram records when discarded", async () => {
    const writer = await open_snapshot_writer(user_email);
    const page = make_page(0, SNAPSHOT_CHUNK_SIZE + 1);

    await writer!.add_page(page.items, page.entries);

    expect(keys_with("_grams_")).toHaveLength(1);

    await writer!.discard();

    expect(keys_with("_grams_")).toHaveLength(0);
  });
});

describe("bound_index_body", () => {
  it("keeps a short body whole and lowercases the search copy", () => {
    const bounded = bound_index_body("Quarterly Report");

    expect(bounded.search_text).toBe("quarterly report");
    expect(bounded.preview_text).toBe("Quarterly Report");
  });

  it("caps the search copy at the index body budget", () => {
    const bounded = bound_index_body("a".repeat(MAX_INDEX_BODY_CHARS + 5000));

    expect(bounded.search_text).toHaveLength(MAX_INDEX_BODY_CHARS);
  });

  it("caps the preview copy at the preview budget", () => {
    const bounded = bound_index_body("b".repeat(MAX_INDEX_BODY_CHARS + 5000));

    expect(bounded.preview_text).toHaveLength(MAX_INDEX_PREVIEW_CHARS);
  });

  it("drops text past the budget from the search copy", () => {
    const bounded = bound_index_body(
      `${"c".repeat(MAX_INDEX_BODY_CHARS)} deepterm`,
    );

    expect(bounded.search_text.includes("deepterm")).toBe(false);
  });

  it("handles an empty body", () => {
    expect(bound_index_body("")).toEqual({ search_text: "", preview_text: "" });
  });
});

describe("slim_envelope_for_index", () => {
  it("never keeps html bodies in the index", () => {
    const slim = slim_envelope_for_index({
      subject: "s",
      body_text: "plain",
      body_html: "<p>huge</p>",
      html_body: "<p>huge</p>",
      from: { name: "Alice", email: "alice@example.com" },
      to: [],
      cc: [],
      bcc: [],
      sent_at: "2026-01-01T00:00:00Z",
    } as DecryptedEnvelope);

    expect(slim.body_html).toBe("");
    expect(slim.html_body).toBe("");
    expect(slim.body_text).toBe("plain");
  });
});

describe("index_storage_ceiling", () => {
  it("leaves room below the quota", () => {
    expect(index_storage_ceiling(0, 10 * 1024 * 1024 * 1024)).toBeGreaterThan(0);
  });

  it("reports no headroom once usage passes the ceiling", () => {
    const quota = 10 * 1024 * 1024 * 1024;

    expect(index_storage_ceiling(quota, quota)).toBe(0);
  });

  it("reports no headroom for a quota smaller than the reserve", () => {
    expect(index_storage_ceiling(0, 8 * 1024 * 1024)).toBe(0);
  });

  it("reports no headroom for an unusable estimate", () => {
    expect(index_storage_ceiling(0, 0)).toBe(0);
    expect(index_storage_ceiling(Number.NaN, 1024)).toBe(0);
  });
});

describe("snapshot writer under storage pressure", () => {
  beforeEach(() => {
    store.clear();
    write_hook.calls = 0;
    write_hook.fail_after = Number.POSITIVE_INFINITY;
    invalidate_snapshot_caches();
  });

  it("reports exhaustion and writes nothing when the first chunk fails", async () => {
    const writer = await open_snapshot_writer(user_email);
    const page = make_page(0, SNAPSHOT_CHUNK_SIZE);

    write_hook.fail_after = 0;

    await writer!.add_page(page.items, page.entries);

    expect(writer!.storage_exhausted()).toBe(true);
    expect(chunk_keys()).toHaveLength(0);
  });

  it("keeps the chunks written before the failing one", async () => {
    const writer = await open_snapshot_writer(user_email);
    const page = make_page(0, SNAPSHOT_CHUNK_SIZE * 2);

    write_hook.fail_after = 2;

    await writer!.add_page(page.items, page.entries);

    expect(writer!.storage_exhausted()).toBe(true);
    expect(keys_with("_chunk_")).toEqual([
      `search_index_account-1_chunk_${0}`,
    ]);
  });

  it("removes a chunk whose gram record could not be written", async () => {
    const writer = await open_snapshot_writer(user_email);
    const page = make_page(0, SNAPSHOT_CHUNK_SIZE);

    write_hook.fail_after = 1;

    await writer!.add_page(page.items, page.entries);

    expect(writer!.storage_exhausted()).toBe(true);
    expect(keys_with("_chunk_")).toHaveLength(0);
    expect(keys_with("_grams_")).toHaveLength(0);
  });

  it("finishes a manifest that only references the surviving chunks", async () => {
    const writer = await open_snapshot_writer(user_email);
    const page = make_page(0, SNAPSHOT_CHUNK_SIZE * 2);

    write_hook.fail_after = 2;

    await writer!.add_page(page.items, page.entries);

    write_hook.fail_after = Number.POSITIVE_INFINITY;

    const meta = await writer!.finish({ complete: false, include_body: true });

    expect(meta!.chunk_ids).toEqual([0]);
    expect(meta!.total).toBe(SNAPSHOT_CHUNK_SIZE);

    const reader = await open_snapshot_reader(user_email);

    expect(await reader!.read(0)).not.toBeNull();
  });

  it("stops buffering further pages once exhausted", async () => {
    const writer = await open_snapshot_writer(user_email);
    const first = make_page(0, SNAPSHOT_CHUNK_SIZE);

    write_hook.fail_after = 0;

    await writer!.add_page(first.items, first.entries);

    const second = make_page(SNAPSHOT_CHUNK_SIZE, 10);

    await writer!.add_page(second.items, second.entries);

    expect(writer!.written_count()).toBe(0);
  });

  it("refuses to write when the quota estimate leaves no headroom", async () => {
    const original = navigator.storage;

    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        estimate: async () => ({ usage: 1_000_000_000, quota: 1_000_000_000 }),
      },
    });

    try {
      const writer = await open_snapshot_writer(user_email);
      const page = make_page(0, SNAPSHOT_CHUNK_SIZE);

      await writer!.add_page(page.items, page.entries);

      expect(writer!.storage_exhausted()).toBe(true);
      expect(chunk_keys()).toHaveLength(0);
    } finally {
      Object.defineProperty(navigator, "storage", {
        configurable: true,
        value: original,
      });
    }
  });

  it("writes normally when the quota estimate has headroom", async () => {
    const original = navigator.storage;

    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        estimate: async () => ({ usage: 0, quota: 10 * 1024 * 1024 * 1024 }),
      },
    });

    try {
      const writer = await open_snapshot_writer(user_email);
      const page = make_page(0, SNAPSHOT_CHUNK_SIZE);

      await writer!.add_page(page.items, page.entries);

      expect(writer!.storage_exhausted()).toBe(false);
      expect(chunk_keys()).toHaveLength(1);
    } finally {
      Object.defineProperty(navigator, "storage", {
        configurable: true,
        value: original,
      });
    }
  });
});
