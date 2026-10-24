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

import { afterEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
}));

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_set: async (key: string, value: unknown) => {
    store.set(key, JSON.parse(JSON.stringify(value)));
  },
  encrypted_set_plaintext: async (key: string, plaintext: Uint8Array) => {
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
  open_snapshot_reader,
  open_snapshot_writer,
  serialize_chunk,
  SNAPSHOT_CHUNK_SIZE,
  to_persisted_entry,
  type PersistableEntry,
} from "@/services/search_index_store";
import { summarize_chunk } from "@/services/search_chunk_filter";

const user_email = "user@example.com";

function make_item(index: number): MailItem {
  return {
    id: `msg-${index}`,
    item_type: index % 3 === 0 ? "sent" : "received",
    folder_token: "inbox",
    created_at: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    labels: [{ token: `label-${index % 4}`, name: `Label ${index % 4}` }],
    is_trashed: index % 7 === 0,
  } as MailItem;
}

function make_entry(index: number): PersistableEntry {
  return {
    envelope: {
      subject: `Quarterly report ${index}`,
      body_text: `Preview ${index}`,
      body_html: "",
      html_body: "",
      from: {
        name: `Sender ${index % 9}`,
        email: `sender${index % 9}@example.com`,
      },
      to: [{ name: "Recipient", email: "recipient@example.com" }],
      cc: [],
      bcc: [],
      sent_at: "2026-01-01T00:00:00Z",
    } as DecryptedEnvelope,
    metadata: {
      is_read: index % 2 === 0,
      size_bytes: 1000 + index,
    } as MailItemMetadata,
    search_body_text: `searchable body text ${index}`,
    meta_fp: `fp-${index}`,
    has_body: true,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  store.clear();
});

describe("serialize_chunk", () => {
  it("produces the same JSON and digest as serialising the chunk in one go", async () => {
    const items = Array.from({ length: 50 }, (_, i) => make_item(i));
    const entries = items.map((item, i) =>
      to_persisted_entry(item.id, make_entry(i)),
    );

    const { plaintext, digest } = await serialize_chunk(items, entries);

    expect(new TextDecoder().decode(plaintext)).toBe(
      JSON.stringify({ items, entries }),
    );
    expect(digest).toEqual(summarize_chunk(items, entries));
  });
});

describe("snapshot writer flush", () => {
  it("yields to the event loop while serialising a full chunk", async () => {
    let clock = 0;

    vi.spyOn(performance, "now").mockImplementation(() => (clock += 1));

    const writer = await open_snapshot_writer(user_email);

    expect(writer).not.toBeNull();

    const items = Array.from({ length: SNAPSHOT_CHUNK_SIZE }, (_, i) =>
      make_item(i),
    );
    const entries = new Map(items.map((item, i) => [item.id, make_entry(i)]));

    let ticks = 0;
    let ticking = true;
    const tick = () => {
      ticks++;
      if (ticking) setTimeout(tick, 0);
    };

    setTimeout(tick, 0);
    await writer!.add_page(items, entries);
    ticking = false;

    expect(writer!.layout()).toHaveLength(1);
    expect(ticks).toBeGreaterThan(10);

    const meta = await writer!.finish({ complete: true, include_body: true });

    expect(meta?.total).toBe(SNAPSHOT_CHUNK_SIZE);

    const reader = await open_snapshot_reader(user_email);
    const chunk = await reader!.read(meta!.chunk_ids[0]);

    expect(chunk?.items.map((item) => item.id)).toEqual(
      items.map((item) => item.id),
    );
    expect(chunk?.entries[5]).toEqual(
      to_persisted_entry("msg-5", make_entry(5)),
    );
  });

  it("drops a chunk whose build was superseded while it was being serialised", async () => {
    let clock = 0;
    let current = true;

    vi.spyOn(performance, "now").mockImplementation(() => (clock += 1));

    const writer = await open_snapshot_writer(
      user_email,
      undefined,
      undefined,
      () => current,
    );
    const items = Array.from({ length: SNAPSHOT_CHUNK_SIZE + 10 }, (_, i) =>
      make_item(i),
    );
    const entries = new Map(items.map((item, i) => [item.id, make_entry(i)]));

    setTimeout(() => {
      current = false;
    }, 0);
    await writer!.add_page(items, entries);

    expect([...store.keys()].filter((k) => k.includes("_chunk_"))).toEqual([]);
    expect(writer!.layout()).toEqual([]);
    expect(
      await writer!.finish({ complete: true, include_body: true }),
    ).toBeNull();
    expect([...store.keys()]).toEqual([]);
  });
});
