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
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const { store, counters, fixture } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  counters: { chunk_reads: 0, force_uncacheable: false },
  fixture: { index: null as unknown },
}));

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_set: async (key: string, value: unknown) => {
    store.set(key, JSON.parse(JSON.stringify(value)));
  },
  encrypted_get: async (key: string) => {
    if (key.includes("_chunk_")) counters.chunk_reads++;

    return store.get(key) ?? null;
  },
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
vi.mock("@/workers/pgp_decrypt_pool", () => ({
  decrypt_pgp_message_parallel: vi.fn(),
}));
vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "user@example.com" } }),
}));
vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { low_network_mode: false } }),
}));
vi.mock("@/hooks/use_search/index_cache", async (import_original) => ({
  ...(await import_original<typeof import("@/hooks/use_search/index_cache")>()),
  acquire_search_index: async () => fixture.index,
}));
vi.mock("@/hooks/use_search/scan_cache", async (import_original) => {
  const actual =
    await import_original<typeof import("@/hooks/use_search/scan_cache")>();

  return {
    ...actual,
    candidates_are_cacheable: (
      candidates: Parameters<typeof actual.candidates_are_cacheable>[0],
    ) =>
      !counters.force_uncacheable &&
      actual.candidates_are_cacheable(candidates),
  };
});

import {
  invalidate_snapshot_caches,
  metadata_fingerprint,
  open_snapshot_writer,
  type PersistableEntry,
  type SnapshotMeta,
} from "@/services/search_index_store";
import {
  options_signature,
  known_empty_chunks,
} from "@/hooks/use_search/scan_cache";
import { parse_search_query } from "@/utils/search_operators";
import {
  use_search,
  type CachedIndex,
  type DecryptedIndexEntry,
} from "@/hooks/use_search";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const user_email = "user@example.com";

interface Message {
  id: string;
  subject?: string;
  from?: string;
  body?: string;
  starred?: boolean;
  trashed?: boolean;
  spam?: boolean;
}

let clock = Date.UTC(2026, 0, 1);

function make_item(message: Message): MailItem {
  clock -= 60_000;

  return {
    id: message.id,
    item_type: "received",
    encrypted_envelope: "",
    envelope_nonce: "",
    folder_token: "inbox",
    is_external: false,
    is_trashed: message.trashed ?? false,
    is_spam: message.spam ?? false,
    created_at: new Date(clock).toISOString(),
    message_ts: new Date(clock).toISOString(),
  } as MailItem;
}

function make_entry(message: Message, item: MailItem): PersistableEntry {
  const from = message.from ?? "dana";
  const body = message.body ?? "weekly report";

  return {
    envelope: {
      subject: message.subject ?? `note ${message.id}`,
      body_text: body.slice(0, 200),
      body_html: "",
      from: { name: from, email: `${from}@example.com` },
      to: [{ name: "User", email: user_email }],
      cc: [],
      bcc: [],
      sent_at: item.created_at,
    } as DecryptedEnvelope,
    metadata: {
      is_read: false,
      is_starred: message.starred ?? false,
      has_attachments: false,
    } as MailItemMetadata,
    search_body_text: body.toLowerCase(),
    meta_fp: metadata_fingerprint(item),
    has_body: true,
  };
}

async function write_snapshot(chunks: Message[][]): Promise<CachedIndex> {
  let meta: SnapshotMeta | null = null;

  for (const chunk of chunks) {
    const writer = await open_snapshot_writer(user_email, meta);
    const items = chunk.map(make_item);
    const entries = new Map<string, PersistableEntry>(
      chunk.map((message, i) => [message.id, make_entry(message, items[i])]),
    );

    await writer!.add_page(items, entries);
    meta = await writer!.finish({
      complete: true,
      include_body: true,
      keep_chunk_ids: meta?.chunk_ids,
      kept_total: meta?.total,
      keep_first: true,
    });
  }

  const final = meta as SnapshotMeta;

  return {
    items: [],
    decrypted: new Map<string, DecryptedIndexEntry>(),
    built_at: final.saved_at,
    include_body: true,
    user_email,
    disk_chunk_ids: final.chunk_ids,
    total_indexed: final.total,
    complete: true,
    meta: final,
  };
}

type HookResult = ReturnType<typeof use_search>;

const hooks: { typing: HookResult | null; fresh: HookResult | null } = {
  typing: null,
  fresh: null,
};

function Probe({ name }: { name: "typing" | "fresh" }) {
  hooks[name] = use_search();

  return null;
}

let container: HTMLDivElement;
let root: Root;

async function type_query(query: string): Promise<number> {
  const before = counters.chunk_reads;

  await act(async () => {
    await hooks.typing!.search(query);
  });

  return counters.chunk_reads - before;
}

async function full_scan(query: string) {
  await act(async () => {
    hooks.fresh!.clear_results();
  });
  await act(async () => {
    await hooks.fresh!.search(query);
  });

  return hooks.fresh!.state;
}

function snapshot_of(state: HookResult["state"]) {
  return {
    ids: state.results.map((result) => result.id),
    total: state.total_results,
    hidden: state.hidden_spam_trash,
    has_more: state.has_more,
  };
}

function filler(words: number): string {
  return "weekly report ".repeat(words);
}

describe("use_search refined queries skip chunks without matches", () => {
  beforeEach(async () => {
    counters.chunk_reads = 0;
    counters.force_uncacheable = false;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        createElement("div", null, [
          createElement(Probe, { key: "typing", name: "typing" }),
          createElement(Probe, { key: "fresh", name: "fresh" }),
        ]),
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      hooks.typing!.clear_index();
      hooks.fresh!.clear_index();
      root.unmount();
    });
    container.remove();
    store.clear();
    invalidate_snapshot_caches();
  });

  it("decrypts only the chunks that matched the previous keystroke", async () => {
    const big = filler(50_000);

    fixture.index = await write_snapshot([
      [{ id: "c0", body: `invoice march ${big}` }],
      [{ id: "c1", body: `invoice april ${big}` }],
      [{ id: "c2", body: `invitation party ${big}` }],
      [{ id: "c3", body: `inside joke ${big}` }],
      [{ id: "c4" }],
      [{ id: "c5" }],
      [{ id: "c6" }],
      [{ id: "c7" }],
    ]);

    const reads: number[] = [];

    for (const query of ["i", "in", "inv", "invoice"]) {
      reads.push(await type_query(query));
    }

    expect(reads).toEqual([0, 8, 4, 3]);
    expect(snapshot_of(hooks.typing!.state)).toEqual(
      snapshot_of(await full_scan("invoice")),
    );
    expect(hooks.typing!.state.results.map((r) => r.id)).toEqual(["c0", "c1"]);
  });

  it("keeps the fully scanned chunks when a search stops at the result limit", async () => {
    const hits = (prefix: string) =>
      Array.from({ length: 300 }, (_, i) => ({
        id: `${prefix}-${i}`,
        body: "invoice due",
      }));

    fixture.index = await write_snapshot([
      [{ id: "e0" }],
      [{ id: "e1" }],
      [{ id: "e2" }],
      [{ id: "e3" }],
      hits("h6"),
      hits("h7"),
      [{ id: "e8", body: "invoice late" }],
    ]);

    expect(await type_query("in")).toBe(6);
    expect(hooks.typing!.state.has_more).toBe(true);

    invalidate_snapshot_caches();

    expect(await type_query("inv")).toBe(2);
    expect(snapshot_of(hooks.typing!.state)).toEqual(
      snapshot_of(await full_scan("inv")),
    );
  });

  it("matches a full scan for every keystroke, operators included", async () => {
    counters.force_uncacheable = true;
    fixture.index = await write_snapshot([
      [
        { id: "a1", from: "alice", body: "invoice for march" },
        { id: "a2", from: "bob", body: "invitation to lunch" },
      ],
      [{ id: "a3", from: "carol", body: "nothing relevant" }],
      [
        { id: "a4", from: "alice", subject: "inside info", starred: true },
        { id: "a5", from: "bob", body: "invoice overdue", trashed: true },
      ],
      [{ id: "a6", from: "dana", body: "café receipts" }],
      [{ id: "a7", from: "erin", body: "cafe invoice -inv", spam: true }],
      [{ id: "a8", from: "bob", body: "or else invoice" }],
      [{ id: "a9", from: "frank" }],
    ]);

    const sequences = [
      ["in", "inv", "invo", "invoice"],
      ["inv", "in"],
      ["invoice", "invoic", "invoice"],
      ["in", "in for", "in for march"],
      ["from:alice in", "from:alice inv", "from:alice invoice"],
      ["-from:alice in", "-from:alice inv", "-from:alice invoice"],
      ["from:alice from:bob in", "from:alice from:bob inv"],
      ["in OR", "inv OR", "invoice OR else"],
      ["NOT in", "NOT inv", "NOT invo"],
      ["in -inv", "invo -inv"],
      ["in is:starred", "ins is:starred"],
      ["in in:anywhere", "inv in:anywhere", "invoice in:anywhere"],
      ["in in:trash", "inv in:trash"],
      ["caf", "cafe", "café", "cafe receipts"],
      ["inv", "inv from:bob", "invoice from:bob"],
    ];

    for (const sequence of sequences) {
      await act(async () => {
        hooks.typing!.clear_results();
      });

      for (const query of sequence) {
        await type_query(query);

        expect(
          snapshot_of(hooks.typing!.state),
          `${sequence.join(" > ")} at "${query}"`,
        ).toEqual(snapshot_of(await full_scan(query)));
      }
    }
  });

  it("forgets the skipped chunks when the snapshot is rewritten", async () => {
    fixture.index = await write_snapshot([
      [{ id: "s0", body: "invoice one" }],
      [{ id: "s1", body: "budget" }],
    ]);

    await type_query("inv");
    store.clear();
    invalidate_snapshot_caches();

    const written_at = Date.now();

    while (Date.now() === written_at) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    fixture.index = await write_snapshot([
      [{ id: "t0", body: "budget" }],
      [{ id: "t1", body: "invoice two" }],
    ]);

    expect(await type_query("invoice")).toBe(2);
    expect(hooks.typing!.state.results.map((r) => r.id)).toEqual(["t1"]);
  });

  it("forgets the skipped chunks when the index is cleared", async () => {
    counters.force_uncacheable = true;
    fixture.index = await write_snapshot([
      [{ id: "s0", body: "invoice one" }],
      [{ id: "s1", body: "budget" }],
    ]);

    await type_query("inv");
    await act(async () => {
      hooks.typing!.clear_index();
    });
    invalidate_snapshot_caches();

    expect(await type_query("invoice")).toBe(2);
  });
});

describe("known_empty_chunks", () => {
  const index = {
    built_at: 10,
    meta: { saved_at: 20 } as SnapshotMeta,
    user_email,
  };

  function memory(query: string, overrides = {}) {
    const parsed = parse_search_query(query);

    return {
      user_email,
      terms: parsed.text_query.toLowerCase().split(" ").filter(Boolean),
      operators: parsed.operators,
      options_key: options_signature(),
      built_at: 10,
      saved_at: 20,
      empty_chunks: new Set([1, 2]),
      ...overrides,
    };
  }

  function lookup(
    saved: ReturnType<typeof memory>,
    query: string,
    options_key = options_signature(),
    target = index,
  ) {
    const parsed = parse_search_query(query);

    return known_empty_chunks(
      saved,
      parsed.text_query.toLowerCase().split(" ").filter(Boolean),
      parsed.operators,
      options_key,
      target,
    );
  }

  it("reuses the chunks for a longer query", () => {
    expect(lookup(memory("inv"), "invoice")).toEqual(new Set([1, 2]));
    expect(lookup(memory("inv"), "march invoice")).toEqual(new Set([1, 2]));
  });

  it("never reuses them for a broader or different query", () => {
    expect(lookup(memory("invoice"), "inv")).toBeNull();
    expect(lookup(memory("inv march"), "invoice")).toBeNull();
    expect(lookup(memory("from:alice inv"), "from:bob invoice")).toBeNull();
    expect(lookup(memory("-from:alice inv"), "from:alice invoice")).toBeNull();
    expect(lookup(memory("inv"), "invoice from:alice")).toBeNull();
    expect(lookup(memory("NOT inv"), "NOT invoice")).toBeNull();
  });

  it("never reuses them across snapshots, options or accounts", () => {
    expect(lookup(memory("inv", { saved_at: 19 }), "invoice")).toBeNull();
    expect(lookup(memory("inv", { built_at: 9 }), "invoice")).toBeNull();
    expect(
      lookup(
        memory("inv"),
        "invoice",
        options_signature({ filters: { is_starred: true } }),
      ),
    ).toBeNull();
    expect(
      lookup(memory("inv", { user_email: "other@example.com" }), "invoice"),
    ).toBeNull();
  });

  it("compares accent-folded terms the way matching does", () => {
    expect(lookup(memory("cafe"), "café")).toEqual(new Set([1, 2]));
    expect(lookup(memory("\u0301\u0301"), "e\u0301\u0301")).toBeNull();
  });
});
