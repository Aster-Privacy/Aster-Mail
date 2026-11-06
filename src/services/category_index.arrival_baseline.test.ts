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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/services/crypto/secure_storage", () => ({
  secure_encrypt: async (s: string) => s,
  secure_decrypt: async (s: string) => s,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_vault_in_memory: () => true,
  on_vault_cleared: () => {},
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "acct1",
}));

const list_mail_items = vi.fn();

vi.mock("@/services/api/mail", () => ({
  list_mail_items: (...args: unknown[]) => list_mail_items(...args),
}));

const decrypt_mail_metadata = vi.fn(async (blob: string) =>
  blob.startsWith("pinned:")
    ? { category: blob.slice("pinned:".length), category_pinned: true }
    : null,
);

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: (blob: string) => decrypt_mail_metadata(blob),
  update_item_metadata: async () => ({ success: true }),
}));

vi.mock("@/services/mail_categorizer", () => ({
  CLASSIFIER_VERSION: 2,
  classify: (
    envelope: { from?: { email?: string } },
    metadata: { category?: string; category_pinned?: boolean } | null,
    options?: { rule_category?: string | null },
  ) =>
    metadata?.category_pinned && metadata.category
      ? metadata.category
      : envelope.from?.email === "friends@social.example"
        ? "social"
        : (options?.rule_category ?? "primary"),
  is_locked_to_primary: () => false,
  CATEGORY_TABS: ["primary", "social", "promotions"],
}));

const decrypt_envelope = vi.fn(async (blob: string, _nonce: string) => ({
  subject: "Subject",
  from: {
    name: "Sender",
    email: blob.endsWith("-S")
      ? "friends@social.example"
      : "sender@example.com",
  },
}));

vi.mock("@/hooks/email_list_helpers", () => ({
  decrypt_envelope: (blob: string, nonce: string) =>
    decrypt_envelope(blob, nonce),
}));

import {
  sync_recent,
  build_index,
  start_event_listeners,
  clear_category_index,
  clear_category_index_memory,
  get_index_entries,
  is_fully_built,
} from "@/services/category_index";
import { MAIL_EVENTS } from "@/hooks/mail_events";

function make_item(index: number, overrides: Partial<MailItem> = {}): MailItem {
  const ts = `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`;

  return {
    id: `m${index}`,
    item_type: "received",
    encrypted_envelope: `env-${index}`,
    envelope_nonce: `nonce-${index}`,
    encrypted_metadata: "plain",
    metadata_nonce: `meta-nonce-${index}`,
    folder_token: "",
    is_external: false,
    is_archived: false,
    is_trashed: false,
    is_spam: false,
    is_read: false,
    is_pinned: false,
    created_at: ts,
    message_ts: ts,
    ...overrides,
  } as MailItem;
}

function serve(items: MailItem[]): void {
  list_mail_items.mockImplementation(
    async (params: { ids?: string[] } | undefined) => ({
      data: {
        items: params?.ids
          ? items.filter((item) => params.ids!.includes(item.id))
          : items,
        has_more: false,
      },
    }),
  );
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const idb_data = new Map<string, Map<string, unknown>>();

function idb_store(name: string): Map<string, unknown> {
  if (!idb_data.has(name)) idb_data.set(name, new Map());

  return idb_data.get(name)!;
}

function install_fake_idb(): void {
  const known = new Set<string>();

  const make_db = () => ({
    objectStoreNames: { contains: (n: string) => known.has(n) },
    createObjectStore: (n: string) => {
      known.add(n);

      return {};
    },
    transaction: (store_name: string) => {
      const tx: Record<string, unknown> = {
        oncomplete: null,
        onerror: null,
        error: null,
      };

      tx.objectStore = (n: string) => ({
        put: (value: unknown, key: string) => {
          idb_store(n).set(key, value);
          setTimeout(() => (tx.oncomplete as (() => void) | null)?.(), 0);

          return {};
        },
        get: (key: string) => {
          const req: Record<string, unknown> = {
            onsuccess: null,
            onerror: null,
            result: idb_store(n).get(key),
          };

          setTimeout(
            () =>
              (req.onsuccess as ((e: unknown) => void) | null)?.({
                target: req,
              }),
            0,
          );

          return req;
        },
        clear: () => {
          idb_store(store_name).clear();
          setTimeout(() => (tx.oncomplete as (() => void) | null)?.(), 0);

          return {};
        },
      });

      return tx;
    },
    close: () => {},
  });

  const open = () => {
    const db = make_db();
    const req: Record<string, unknown> = {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      result: db,
    };

    setTimeout(() => {
      (req.onupgradeneeded as ((e: unknown) => void) | null)?.({
        target: { result: db },
      });
      (req.onsuccess as ((e: unknown) => void) | null)?.({ target: req });
    }, 0);

    return req;
  };

  (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
    open,
    deleteDatabase: () => ({}),
    cmp: () => 0,
    databases: async () => [],
  };
}

const received: string[] = [];

function on_received(event: Event): void {
  received.push((event as CustomEvent<{ email_id: string }>).detail.email_id);
}

function minute_item(index: number, overrides: Partial<MailItem> = {}): MailItem {
  const ts = new Date(Date.UTC(2026, 6, 1) + index * 60_000).toISOString();

  return make_item(index, { created_at: ts, message_ts: ts, ...overrides });
}

function page_of(count: number, start = 0): MailItem[] {
  return Array.from({ length: count }, (_, i) => make_item(start + i));
}

describe("category_index catch-up arrival announcements", () => {
  beforeEach(async () => {
    install_fake_idb();
    idb_data.clear();
    list_mail_items.mockReset();
    serve([]);
    await clear_category_index();
    start_event_listeners();
    received.length = 0;
    window.addEventListener(MAIL_EVENTS.EMAIL_RECEIVED, on_received);
  });

  afterEach(() => {
    window.removeEventListener(MAIL_EVENTS.EMAIL_RECEIVED, on_received);
  });

  it("announces nothing when a catch-up runs on an empty, unbuilt index", async () => {
    serve(
      page_of(21).map((item, i) =>
        i === 20 ? item : { ...item, is_read: true },
      ),
    );

    await sync_recent(true);
    await settle();

    expect(received).toEqual([]);
    expect(get_index_entries(page_of(21).map((item) => item.id))).toHaveLength(
      21,
    );
  });

  it("announces nothing when a catch-up races the first build after sign-in", async () => {
    serve(page_of(21));

    await Promise.all([sync_recent(true), build_index()]);
    await settle();

    expect(received).toEqual([]);
    expect(is_fully_built()).toBe(true);
  });

  it("announces exactly one new unread message once the index is built", async () => {
    const existing = page_of(10);

    serve(existing);
    await build_index();
    await settle();
    expect(is_fully_built()).toBe(true);

    const fresh = make_item(10);

    serve([fresh, ...existing]);
    await sync_recent(true);
    await settle();

    expect(received).toEqual([fresh.id]);
  });

  it("does not announce a new message that is already read", async () => {
    const existing = page_of(10);

    serve(existing);
    await build_index();
    await settle();

    serve([make_item(10, { is_read: true }), ...existing]);
    await sync_recent(true);
    await settle();

    expect(received).toEqual([]);
    expect(get_index_entries(["m10"])).toHaveLength(1);
  });

  it("still announces unread mail that arrived while offline after the build", async () => {
    const existing = page_of(10);

    serve(existing);
    await build_index();
    await settle();
    await sync_recent();
    await settle();

    const offline = [
      make_item(10),
      make_item(11, { is_read: true }),
      make_item(12),
    ];

    serve([...offline, ...existing]);
    await sync_recent(true);
    await settle();

    expect(received.sort()).toEqual(["m10", "m12"]);
  });

  it("announces the first message of a brand-new empty mailbox", async () => {
    serve([]);
    await build_index();
    await settle();
    expect(is_fully_built()).toBe(true);

    const first = make_item(0);

    serve([first]);
    await sync_recent(true);
    await settle();

    expect(received).toEqual([first.id]);
  });

  it("waits for an in-session reconcile before announcing after a reload from disk", async () => {
    const existing = Array.from({ length: 1600 }, (_, i) => minute_item(i));

    serve(existing);
    await build_index();
    await settle();
    await vi.waitFor(
      () => {
        const store = idb_store("indexes");
        const meta = store.get("acct1");

        expect(typeof meta === "string" && JSON.parse(meta).fully_built).toBe(
          true,
        );
        for (let chunk = 0; chunk < 32; chunk += 1) {
          expect(store.has(`acct1:c${chunk}`)).toBe(true);
        }
      },
      { timeout: 10_000, interval: 50 },
    );

    clear_category_index_memory();

    const while_away = [minute_item(1600), minute_item(1601)];

    serve([...while_away, ...existing]);
    await sync_recent(true);
    await settle();

    expect(is_fully_built()).toBe(true);
    expect(received).toEqual([]);

    const later = minute_item(1602);

    serve([later, ...while_away, ...existing]);
    await sync_recent(true);
    await settle();

    expect(received).toEqual([later.id]);
  }, 20_000);
});
