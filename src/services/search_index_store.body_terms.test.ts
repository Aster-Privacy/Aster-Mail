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
  write_hook: {
    calls: 0,
    fail_after: Number.POSITIVE_INFINITY,
    keyed: new Map<string, boolean>(),
  },
}));

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_set: async (key: string, value: unknown, crypto_key?: unknown) => {
    write_hook.calls++;
    write_hook.keyed.set(key, crypto_key !== undefined && crypto_key !== null);

    if (write_hook.calls > write_hook.fail_after) {
      throw new Error("QuotaExceededError");
    }

    store.set(key, JSON.parse(JSON.stringify(value)));
  },
  encrypted_set_plaintext: async (key: string, plaintext: Uint8Array) => {
    write_hook.calls++;

    if (write_hook.calls > write_hook.fail_after) {
      throw new Error("QuotaExceededError");
    }

    store.set(key, JSON.parse(new TextDecoder().decode(plaintext)));
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
  open_snapshot_writer,
  open_snapshot_reader,
  invalidate_snapshot_caches,
  metadata_fingerprint,
  purge_snapshot_entries,
  clear_search_snapshots,
  MAX_INDEX_BODY_CHARS,
  MAX_INDEX_INLINE_BODY_CHARS,
  SNAPSHOT_CHUNK_SIZE,
  type PersistableEntry,
} from "@/services/search_index_store";
import { build_body_terms } from "@/services/search_body_terms";

const user_email = "user@example.com";
const deep_word = "quetzalcoatl";

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

function long_body(id: string): string {
  return `${"filler ".repeat(4000)} ${deep_word} ${id.replace("-", "")}`;
}

function make_entry(id: string, body: string): PersistableEntry {
  return {
    envelope: {
      subject: `subject ${id}`,
      body_text: body,
      from: { name: "Alice", email: "alice@example.com" },
      to: [],
      cc: [],
      bcc: [],
      sent_at: "2026-01-01T00:00:00Z",
    } as DecryptedEnvelope,
    metadata: { is_read: true } as MailItemMetadata,
    search_body_text: body.slice(0, MAX_INDEX_INLINE_BODY_CHARS).toLowerCase(),
    meta_fp: metadata_fingerprint(make_item(id)),
    has_body: true,
    index_terms: build_body_terms(body, [`report-${id}.pdf`]),
  };
}

async function write_snapshot(ids: string[], bodies?: Map<string, string>) {
  const writer = await open_snapshot_writer(user_email);
  const items = ids.map(make_item);
  const entries = new Map(
    ids.map((id) => [id, make_entry(id, bodies?.get(id) ?? long_body(id))]),
  );

  await writer!.add_page(items, entries);
  await writer!.finish({ complete: true, include_body: true });

  return entries;
}

async function body_hits(word: string): Promise<Set<string>> {
  invalidate_snapshot_caches();

  const reader = await open_snapshot_reader(user_email);
  const found = new Set<string>();

  for (const chunk_id of reader!.meta.chunk_ids) {
    const hits = await reader!.read_body_hits(chunk_id, [word]);

    for (const id of hits?.get(word) ?? []) found.add(id);
  }

  return found;
}

function term_keys(): string[] {
  return [...store.keys()]
    .filter((k) => k.includes("_tid_") || k.includes("_tp_"))
    .sort();
}

describe("body term postings in the snapshot store", () => {
  beforeEach(() => {
    store.clear();
    write_hook.calls = 0;
    write_hook.fail_after = Number.POSITIVE_INFINITY;
    write_hook.keyed.clear();
    invalidate_snapshot_caches();
  });

  it("indexes body text up to 32 KB while keeping the inline copy small", async () => {
    expect(MAX_INDEX_BODY_CHARS).toBe(32768);
    expect(long_body("msg-1").length).toBeGreaterThan(
      MAX_INDEX_INLINE_BODY_CHARS,
    );

    await write_snapshot(["msg-1", "msg-2"]);

    const reader = await open_snapshot_reader(user_email);
    const chunk = await reader!.read(reader!.meta.chunk_ids[0]);

    expect(chunk!.entries[0].search_body_text.length).toBeLessThanOrEqual(
      MAX_INDEX_INLINE_BODY_CHARS,
    );
    expect(chunk!.entries[0].search_body_text).not.toContain(deep_word);
    expect(JSON.stringify(chunk)).not.toContain("index_terms");
    expect(await body_hits(deep_word)).toEqual(new Set(["msg-1", "msg-2"]));
  });

  it("matches word prefixes, unique words, and attachment file names", async () => {
    await write_snapshot(["msg-1", "msg-2"]);

    expect(await body_hits("quetz")).toEqual(new Set(["msg-1", "msg-2"]));
    expect(await body_hits("msg2")).toEqual(new Set(["msg-2"]));
    expect(await body_hits("report")).toEqual(new Set(["msg-1", "msg-2"]));
    expect(await body_hits("absentword")).toEqual(new Set());
  });

  it("matches accented body text with a plain query", async () => {
    await write_snapshot(
      ["msg-1"],
      new Map([["msg-1", "Réunion au café de la gare, très bientôt"]]),
    );

    expect(await body_hits("reunion")).toEqual(new Set(["msg-1"]));
    expect(await body_hits("cafe")).toEqual(new Set(["msg-1"]));
  });

  it("reports no postings for a chunk holding a body without terms", async () => {
    const writer = await open_snapshot_writer(user_email);
    const items = ["msg-1", "msg-2"].map(make_item);
    const untermed = make_entry("msg-2", long_body("msg-2"));

    delete untermed.index_terms;

    await writer!.add_page(
      items,
      new Map([
        ["msg-1", make_entry("msg-1", long_body("msg-1"))],
        ["msg-2", untermed],
      ]),
    );
    await writer!.finish({ complete: true, include_body: true });
    invalidate_snapshot_caches();

    const reader = await open_snapshot_reader(user_email);

    expect(
      await reader!.read_body_hits(reader!.meta.chunk_ids[0], [deep_word]),
    ).toBeNull();
  });

  it("serves postings for flushed chunks before the build finishes", async () => {
    const ids = Array.from(
      { length: SNAPSHOT_CHUNK_SIZE + 1 },
      (_, i) => `msg-${i}`,
    );
    const writer = await open_snapshot_writer(user_email);
    const entries = new Map(
      ids.map((id) => [
        id,
        make_entry(id, id === "msg-7" ? long_body(id) : `short ${id}`),
      ]),
    );

    await writer!.add_page(ids.map(make_item), entries);

    const flushed = writer!.written_chunk_ids();

    expect(flushed).toHaveLength(1);
    expect(entries.get("msg-7")!.index_terms).toBeUndefined();

    const hits = await writer!.read_body_hits(flushed[0], [deep_word]);

    expect(hits?.get(deep_word)).toEqual(new Set(["msg-7"]));

    await writer!.discard();
  });

  it("removes deleted mail from the postings", async () => {
    await write_snapshot(["msg-1", "msg-2", "msg-3"]);

    const dropped = await purge_snapshot_entries((item) => item.id === "msg-2");

    expect(dropped).toEqual(["msg-2"]);
    expect(await body_hits(deep_word)).toEqual(new Set(["msg-1", "msg-3"]));
    expect(await body_hits("msg2")).toEqual(new Set());
  });

  it("wipes every postings record on sign-out", async () => {
    await write_snapshot(["msg-1", "msg-2"]);

    expect(term_keys().length).toBeGreaterThan(0);

    await clear_search_snapshots("all");

    expect(term_keys()).toEqual([]);
    expect(
      [...store.keys()].filter((k) => k.startsWith("search_index_")),
    ).toEqual([]);
  });

  it("writes postings only through the encrypted store with a key", async () => {
    await write_snapshot(["msg-1"]);

    const keys = term_keys();

    expect(keys.length).toBeGreaterThan(0);

    for (const key of keys) {
      expect(write_hook.keyed.get(key)).toBe(true);
    }
  });

  it("ignores a snapshot written by the previous index format", async () => {
    await write_snapshot(["msg-1"]);

    const manifest_key = [...store.keys()].find(
      (k) => k === "search_index_account-1",
    )!;
    const manifest = store.get(manifest_key) as { version: number };

    store.set(manifest_key, { ...manifest, version: 7 });
    invalidate_snapshot_caches();

    expect(await open_snapshot_reader(user_email)).toBeNull();
  });
});
