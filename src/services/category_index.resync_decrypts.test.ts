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
  start_event_listeners,
  clear_category_index,
  clear_entry_previews,
  get_index_entries,
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

describe("category_index resync decrypt work", () => {
  beforeEach(async () => {
    install_fake_idb();
    idb_data.clear();
    list_mail_items.mockReset();
    serve([]);
    await clear_category_index();
    start_event_listeners();
    await sync_recent();
    await settle();
    reset_counts();
  });

  it("does not decrypt anything when an identical page is resynced", async () => {
    const page = Array.from({ length: 25 }, (_, i) => make_item(i));

    serve(page);
    await sync_recent();
    await settle();

    expect(decrypt_envelope).toHaveBeenCalledTimes(25);
    expect(get_index_entries(page.map((item) => item.id))).toHaveLength(25);

    reset_counts();
    await sync_recent();
    await settle();
    await sync_recent(true);
    await settle();

    expect(decrypt_count()).toBe(0);
    expect(list_mail_items).toHaveBeenCalledTimes(2);
  });

  it("decrypts each new message once and does not fetch it again by id", async () => {
    const anchor = make_item(0);

    serve([anchor]);
    await sync_recent();
    await settle();

    const fresh = Array.from({ length: 5 }, (_, i) => make_item(i + 1));
    const received: string[] = [];
    const on_received = (event: Event) => {
      received.push(
        (event as CustomEvent<{ email_id: string }>).detail.email_id,
      );
    };

    window.addEventListener(MAIL_EVENTS.EMAIL_RECEIVED, on_received);
    try {
      serve([...fresh, anchor]);
      reset_counts();
      await sync_recent(true);
      await settle();
    } finally {
      window.removeEventListener(MAIL_EVENTS.EMAIL_RECEIVED, on_received);
    }

    expect(decrypt_envelope).toHaveBeenCalledTimes(5);
    expect(list_mail_items).toHaveBeenCalledTimes(1);
    expect(received.sort()).toEqual(fresh.map((item) => item.id).sort());
    expect(get_index_entries(fresh.map((item) => item.id))).toHaveLength(5);
  });

  it("still fetches a message announced on its own, outside a resync", async () => {
    const item = make_item(3);

    serve([item]);
    window.dispatchEvent(
      new CustomEvent(MAIL_EVENTS.EMAIL_RECEIVED, {
        detail: { email_id: item.id },
      }),
    );
    await settle();

    expect(list_mail_items).toHaveBeenCalledWith({ ids: [item.id] });
    expect(get_index_entries([item.id])).toHaveLength(1);
  });

  it("applies read, pin and folder changes on indexed messages without decrypting", async () => {
    const page = [make_item(0), make_item(1), make_item(2)];

    serve(page);
    await sync_recent();
    await settle();
    reset_counts();

    serve([
      make_item(0, { is_read: true }),
      make_item(1, { is_pinned: true }),
      make_item(2, { folders: [{ token: "f", name: "Work", color: "" }] }),
    ]);
    await sync_recent();
    await settle();

    expect(decrypt_count()).toBe(0);
    expect(get_index_entries(["m0"])[0]?.is_read).toBe(true);
    expect(get_index_entries(["m1"])[0]?.is_pinned).toBe(true);
    expect(get_index_entries(["m2"])).toHaveLength(0);
  });

  it("re-decrypts when the metadata or the server rule category changes", async () => {
    serve([make_item(0), make_item(1)]);
    await sync_recent();
    await settle();
    reset_counts();

    serve([
      make_item(0, {
        encrypted_metadata: "pinned:social",
        metadata_nonce: "meta-nonce-0b",
      }),
      make_item(1, { rule_category: "promotions" }),
    ]);
    await sync_recent();
    await settle();

    expect(decrypt_envelope).toHaveBeenCalledTimes(2);
    expect(get_index_entries(["m0"])[0]).toMatchObject({
      category: "social",
      category_pinned: true,
    });
    expect(get_index_entries(["m1"])[0]?.category).toBe("promotions");
  });

  for (const nonce of ["", "AQ=="]) {
    it(`re-decrypts a replaced envelope of the same length with fixed nonce "${nonce}"`, async () => {
      serve([
        make_item(0, { encrypted_envelope: "env-A", envelope_nonce: nonce }),
      ]);
      await sync_recent();
      await settle();

      expect(get_index_entries(["m0"])[0]?.category).toBe("primary");
      reset_counts();

      serve([
        make_item(0, { encrypted_envelope: "env-S", envelope_nonce: nonce }),
      ]);
      await sync_recent();
      await settle();

      expect(decrypt_envelope).toHaveBeenCalledTimes(1);
      expect(get_index_entries(["m0"])[0]?.category).toBe("social");
    });
  }

  it("decrypts again once the previews are cleared", async () => {
    serve([make_item(0)]);
    await sync_recent();
    await settle();
    reset_counts();

    clear_entry_previews();
    await sync_recent();
    await settle();

    expect(decrypt_envelope).toHaveBeenCalledTimes(1);
  });
});
