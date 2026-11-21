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
  invalidate_snapshot_caches,
  metadata_fingerprint,
  open_snapshot_reader,
  open_snapshot_writer,
  type PersistableEntry,
} from "@/services/search_index_store";

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
    encrypted_metadata: `metadata-${id}`,
    metadata_nonce: "meta-nonce",
  } as MailItem;
}

function make_page(
  start: number,
  count: number,
): { items: MailItem[]; entries: Map<string, PersistableEntry> } {
  const items: MailItem[] = [];
  const entries = new Map<string, PersistableEntry>();

  for (let i = start; i < start + count; i++) {
    const id = `msg-${i}`;

    items.push(make_item(id));
    entries.set(id, {
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
      metadata: { is_read: true } as MailItemMetadata,
      search_body_text: "",
      meta_fp: metadata_fingerprint(make_item(id)),
      has_body: false,
    });
  }

  return { items, entries };
}

async function write_snapshot(
  start: number,
  count: number,
  complete: boolean,
): Promise<void> {
  const reader = await open_snapshot_reader(user_email);
  const writer = await open_snapshot_writer(user_email, reader?.meta);
  const page = make_page(start, count);

  await writer!.add_page(page.items, page.entries);
  await writer!.finish({
    complete,
    include_body: false,
    next_cursor: complete ? undefined : "next",
  });
}

describe("snapshot commit", () => {
  beforeEach(() => {
    store.clear();
    invalidate_snapshot_caches();
  });

  it("keeps a snapshot another tab saved after this writer opened", async () => {
    await write_snapshot(0, 10, false);

    const reader = await open_snapshot_reader(user_email);
    const stale_writer = await open_snapshot_writer(user_email, reader?.meta);

    await write_snapshot(0, 30, true);

    const page = make_page(0, 5);

    await stale_writer!.add_page(page.items, page.entries);

    const meta = await stale_writer!.finish({
      complete: false,
      include_body: false,
      next_cursor: "next",
    });

    invalidate_snapshot_caches();

    const after = await open_snapshot_reader(user_email);

    expect(meta).toBeNull();
    expect(stale_writer!.conflicted()).toBe(true);
    expect(after?.meta.complete).toBe(true);
    expect(after?.meta.total).toBe(30);

    const chunk = await after!.read(after!.meta.chunk_ids[0]);

    expect(chunk?.items).toHaveLength(30);
  });

  it("commits when nothing changed since the writer opened", async () => {
    await write_snapshot(0, 10, false);

    const reader = await open_snapshot_reader(user_email);
    const writer = await open_snapshot_writer(user_email, reader?.meta);
    const page = make_page(0, 20);

    await writer!.add_page(page.items, page.entries);

    const meta = await writer!.finish({ complete: true, include_body: false });

    expect(meta?.complete).toBe(true);
    expect(meta?.total).toBe(20);
    expect(writer!.conflicted()).toBe(false);
  });

  it("keeps the first snapshot when two writers start on an empty store", async () => {
    const late = await open_snapshot_writer(user_email);

    await write_snapshot(0, 12, true);

    const page = make_page(0, 3);

    await late!.add_page(page.items, page.entries);

    expect(
      await late!.finish({ complete: false, include_body: false }),
    ).toBeNull();
    expect(late!.conflicted()).toBe(true);

    invalidate_snapshot_caches();
    expect((await open_snapshot_reader(user_email))?.meta.total).toBe(12);
  });
});
