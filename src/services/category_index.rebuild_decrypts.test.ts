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
import type { CustomCategoryRule } from "@/data/category_catalog";

import { describe, it, expect, beforeEach, vi } from "vitest";

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
    options?: {
      rule_category?: string | null;
      custom_categories?: CustomCategoryRule[];
    },
  ) => {
    if (metadata?.category_pinned && metadata.category) {
      return metadata.category;
    }
    const domain = envelope.from?.email?.split("@")[1] ?? "";
    const custom = options?.custom_categories?.find(
      (rule) => rule.enabled && rule.match_domains.includes(domain),
    );

    if (custom) return custom.id;
    if (domain === "social.example") return "social";

    return options?.rule_category ?? "primary";
  },
  is_locked_to_primary: () => false,
  set_active_custom_categories: () => {},
  CATEGORY_TABS: ["primary", "social", "promotions"],
}));

const decrypt_envelope = vi.fn(async (blob: string, _nonce: string) => ({
  subject: "Subject",
  from: {
    name: "Sender",
    email: blob.endsWith("-S")
      ? "friends@social.example"
      : blob.endsWith("-N")
        ? "digest@news.example"
        : "sender@example.com",
  },
}));

vi.mock("@/hooks/email_list_helpers", () => ({
  decrypt_envelope: (blob: string, nonce: string) =>
    decrypt_envelope(blob, nonce),
}));

import {
  build_index,
  clear_category_index,
  clear_category_index_memory,
  get_index_entries,
  is_build_in_progress,
  is_fully_built,
  set_custom_categories,
} from "@/services/category_index";

const PAGE_SIZE = 150;

function make_item(index: number, overrides: Partial<MailItem> = {}): MailItem {
  const ts = new Date(Date.UTC(2026, 6, 1) + index * 60_000).toISOString();
  const kind = index % 3 === 0 ? "-S" : index % 3 === 1 ? "-N" : "";

  return {
    id: `m${index}`,
    item_type: "received",
    encrypted_envelope: `env-${index}${kind}`,
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
    async (params: { cursor?: string; limit?: number } | undefined) => {
      const start = params?.cursor ? Number(params.cursor) : 0;
      const limit = params?.limit ?? PAGE_SIZE;
      const page = items.slice(start, start + limit);
      const has_more = start + limit < items.length;

      return {
        data: {
          items: page,
          has_more,
          next_cursor: has_more ? String(start + limit) : undefined,
        },
      };
    },
  );
}

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function rebuild(force = true): Promise<void> {
  await build_index({ force });
  await settle();
}

async function wait_for_build(): Promise<void> {
  await settle();
  for (let i = 0; i < 200 && is_build_in_progress(); i += 1) {
    await settle();
  }
}

function decrypt_count(): number {
  return (
    decrypt_envelope.mock.calls.length + decrypt_mail_metadata.mock.calls.length
  );
}

function reset_counts(): void {
  decrypt_envelope.mockClear();
  decrypt_mail_metadata.mockClear();
  list_mail_items.mockClear();
}

function categories(ids: string[]): Record<string, string> {
  return Object.fromEntries(
    get_index_entries(ids).map((entry) => [entry.id, entry.category]),
  );
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
        delete: (key: string) => {
          idb_store(n).delete(key);
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

function news_rule(enabled = true): CustomCategoryRule {
  return {
    id: "custom:news",
    name: "News",
    icon: "tag",
    match_domains: ["news.example"],
    match_keywords: [],
    enabled,
  } as CustomCategoryRule;
}

const N = 400;

describe("category_index forced rebuild decrypt work", () => {
  let mailbox: MailItem[];
  let ids: string[];

  beforeEach(async () => {
    install_fake_idb();
    idb_data.clear();
    list_mail_items.mockReset();
    serve([]);
    await clear_category_index();
    set_custom_categories([]);
    await wait_for_build();

    mailbox = Array.from({ length: N }, (_, i) => make_item(N - 1 - i));
    ids = mailbox.map((item) => item.id);
    serve(mailbox);
    await rebuild();
    expect(get_index_entries(ids)).toHaveLength(N);
    reset_counts();
  });

  it("decrypts nothing when every indexed message is unchanged", async () => {
    const before = categories(ids);

    await rebuild();

    expect(decrypt_count()).toBe(0);
    expect(list_mail_items).toHaveBeenCalledTimes(Math.ceil(N / PAGE_SIZE));
    expect(categories(ids)).toEqual(before);
  });

  it("decrypts nothing after the index is reloaded from disk", async () => {
    const before = categories(ids);

    clear_category_index_memory();
    await rebuild();

    expect(decrypt_count()).toBe(0);
    expect(categories(ids)).toEqual(before);
  });

  it("reclassifies only the messages whose envelope or metadata changed", async () => {
    mailbox[0] = make_item(N - 1, {
      encrypted_envelope: `env-${N - 1}-new-S`,
      envelope_nonce: `nonce-${N - 1}-new`,
    });
    mailbox[1] = make_item(N - 2, {
      encrypted_envelope: `env-${N - 2}-S`,
    });
    mailbox[2] = make_item(N - 3, {
      encrypted_metadata: "pinned:promotions",
      metadata_nonce: "meta-nonce-pinned",
    });
    mailbox[3] = make_item(N - 4, { is_read: true, is_pinned: true });
    mailbox[4] = make_item(N - 5, { rule_category: "promotions" });
    serve(mailbox);

    await rebuild();

    expect(decrypt_envelope).toHaveBeenCalledTimes(4);
    expect(decrypt_mail_metadata).toHaveBeenCalledTimes(4);
    expect(get_index_entries([`m${N - 1}`])[0]?.category).toBe("social");
    expect(get_index_entries([`m${N - 2}`])[0]?.category).toBe("social");
    expect(get_index_entries([`m${N - 3}`])[0]).toMatchObject({
      category: "promotions",
      category_pinned: true,
    });
    expect(get_index_entries([`m${N - 4}`])[0]).toMatchObject({
      is_read: true,
      is_pinned: true,
    });
    expect(get_index_entries([`m${N - 5}`])[0]?.category).toBe("promotions");

    reset_counts();
    await rebuild();
    expect(decrypt_count()).toBe(0);
  });

  it("re-decrypts a replaced envelope that keeps its length and nonce", async () => {
    expect(mailbox[1].encrypted_envelope).toBe("env-398");
    expect(get_index_entries(["m398"])[0]?.category).toBe("primary");

    mailbox[1] = make_item(398, { encrypted_envelope: "env-3-S" });
    serve(mailbox);

    await rebuild();

    expect(decrypt_envelope).toHaveBeenCalledTimes(1);
    expect(get_index_entries(["m398"])[0]?.category).toBe("social");
  });

  it("decrypts everything again after the index is cleared", async () => {
    await clear_category_index();
    await rebuild();

    expect(decrypt_count()).toBe(2 * N);
  });

  it("reclassifies every message when the category rules change", async () => {
    const news_ids = mailbox
      .filter((item) => item.encrypted_envelope.endsWith("-N"))
      .map((item) => item.id);

    expect(new Set(Object.values(categories(news_ids)))).toEqual(
      new Set(["primary"]),
    );

    set_custom_categories([news_rule()]);
    await wait_for_build();

    expect(decrypt_envelope).toHaveBeenCalledTimes(N);
    expect(new Set(Object.values(categories(news_ids)))).toEqual(
      new Set(["custom:news"]),
    );

    reset_counts();
    await rebuild();
    expect(decrypt_count()).toBe(0);
    expect(new Set(Object.values(categories(news_ids)))).toEqual(
      new Set(["custom:news"]),
    );

    set_custom_categories([news_rule(false)]);
    await wait_for_build();

    expect(new Set(Object.values(categories(news_ids)))).toEqual(
      new Set(["primary"]),
    );
  });

  it("keeps an index saved before fingerprints and fills them on the next rebuild", async () => {
    clear_category_index_memory();
    await rebuild();
    reset_counts();

    const store = idb_store("indexes");

    for (const [key, value] of store) {
      const parsed = JSON.parse(value as string);

      if (Array.isArray(parsed)) {
        store.set(
          key,
          JSON.stringify(
            parsed.map((entry: Record<string, unknown>) => {
              delete entry.source;

              return entry;
            }),
          ),
        );
      } else if (parsed && parsed.chunked === true) {
        store.set(key, JSON.stringify({ ...parsed, entry_schema: 2 }));
      }
    }
    const before = categories(ids);

    clear_category_index_memory();
    await rebuild(false);

    expect(is_fully_built()).toBe(true);
    expect(list_mail_items).not.toHaveBeenCalled();
    expect(categories(ids)).toEqual(before);

    await rebuild();
    expect(decrypt_envelope).toHaveBeenCalledTimes(N);

    reset_counts();
    await rebuild();
    expect(decrypt_count()).toBe(0);
  });
});
