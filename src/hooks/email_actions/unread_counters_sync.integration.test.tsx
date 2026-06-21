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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hoisted = vi.hoisted(() => ({
  update_pwa_badge: vi.fn(),
  update_item_metadata: vi.fn(),
  bulk_update_items_metadata: vi.fn(),
  list_mail_items: vi.fn(),
  get_mail_stats: vi.fn(),
}));

vi.mock("@/services/crypto/secure_storage", () => ({
  secure_encrypt: async (s: string) => s,
  secure_decrypt: async (s: string) => s,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_vault_in_memory: () => true,
  on_vault_cleared: () => () => {},
  has_passphrase_in_memory: () => true,
  on_keys_ready: () => () => {},
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "acct1",
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: (...a: unknown[]) => hoisted.list_mail_items(...a),
  get_mail_stats: (...a: unknown[]) => hoisted.get_mail_stats(...a),
  mark_thread_read: async () => ({ data: { ok: true } }),
  add_mail_item_folder: async () => ({ data: {} }),
  remove_mail_item_folder: async () => ({ data: {} }),
  move_mail_item: async () => ({ data: {} }),
  restore_mail_item: async () => ({ data: {} }),
  permanent_delete_mail_item: async () => ({ data: {} }),
  report_spam_sender: async () => ({ data: {} }),
  remove_spam_sender: async () => ({ data: {} }),
}));

vi.mock("@/services/api/contacts", () => ({
  get_contacts_count: async () => ({ data: { count: 0 }, error: null }),
}));

vi.mock("@/services/api/snooze", () => ({
  list_snoozed_emails: async () => ({ data: [], error: null }),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: async () => null,
  update_item_metadata: (...a: unknown[]) => hoisted.update_item_metadata(...a),
  bulk_update_items_metadata: (...a: unknown[]) =>
    hoisted.bulk_update_items_metadata(...a),
}));

vi.mock("@/services/mail_categorizer", () => ({
  classify: () => "primary",
  category_for_tab: (c: string) => c,
  CATEGORY_TABS: ["primary"],
}));

vi.mock("@/hooks/email_list_helpers", () => ({
  decrypt_envelope: async () => ({ subject: "x" }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (k: string) => k }),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: () => {},
  hide_action_toast: () => {},
  update_progress_toast: () => {},
}));

vi.mock("@/hooks/mark_conversation_read", () => ({
  mark_conversation_read: () => {},
}));

vi.mock("@/hooks/email_list_cache", () => ({
  invalidate_mail_cache: () => {},
  remove_email_from_view_cache: () => {},
}));

vi.mock("@/native/capacitor_bridge", () => ({
  get_network_status: async () => ({ connected: true }),
}));

vi.mock("@/native/widget_bridge", () => ({ sync_widget_data: () => {} }));
vi.mock("@/native/pwa_badge", () => ({
  update_pwa_badge: (...a: unknown[]) => hoisted.update_pwa_badge(...a),
}));
vi.mock("@/native/tauri_tray", () => ({ update_tray_badge: () => {} }));
vi.mock("@/services/low_network_state", () => ({ is_low_network: () => false }));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    user: { id: "u1" },
    has_keys: true,
    is_completing_registration: false,
  }),
  use_auth_safe: () => ({
    user: { id: "u1" },
    has_keys: true,
    is_completing_registration: false,
  }),
}));

import { use_email_actions } from "@/hooks/email_actions";
import { clear_mail_stats, prefetch_mail_stats } from "@/hooks/use_mail_stats";
import {
  init_category_index,
  get_counts,
  clear_category_index,
} from "@/services/category_index";
import type { InboxEmail } from "@/types/email";

type Actions = ReturnType<typeof use_email_actions>;

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function server_stats(unread: number) {
  return {
    data: {
      total_items: 3,
      inbox: 3,
      sent: 0,
      drafts: 0,
      scheduled: 0,
      starred: 0,
      archived: 0,
      spam: 0,
      trash: 0,
      unread,
      storage_used_bytes: 0,
      storage_total_bytes: 1073741824,
    },
    error: null,
  };
}

function index_items(
  items: Array<{ id: string; thread: string; is_read: boolean }>,
) {
  return {
    data: {
      items: items.map((i) => ({
        id: i.id,
        thread_token: i.thread,
        message_ts: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        is_read: i.is_read,
        encrypted_envelope: "env",
        envelope_nonce: "nonce",
      })),
      has_more: false,
      next_cursor: null,
    },
  };
}

function email(id: string, thread: string, is_read: boolean): InboxEmail {
  return {
    id,
    thread_token: thread,
    item_type: "received",
    is_read,
    is_starred: false,
    is_pinned: false,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
    sender_email: "a@b.com",
    encrypted_metadata: "em",
    metadata_nonce: "mn",
    metadata_version: 1,
  } as unknown as InboxEmail;
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

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let actions: Actions;
let stop_read_events: (() => void) | null = null;

function Harness() {
  actions = use_email_actions({});

  return null;
}

async function mount_actions(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(<Harness />);
  });
}

function stats_unread(): number | undefined {
  return hoisted.update_pwa_badge.mock.calls.at(-1)?.[0] as number | undefined;
}

function cat_unread(): number {
  return get_counts().primary?.unread ?? -1;
}

const read_events: Array<boolean | undefined> = [];

function listen_read_events(): () => void {
  const handler = (e: Event) => {
    const d = (e as CustomEvent).detail as
      | { is_read?: boolean; encrypted_metadata?: string }
      | undefined;

    if (d && "is_read" in d && !d.encrypted_metadata) {
      read_events.push(d.is_read);
    }
  };

  window.addEventListener("astermail:mail-item-updated", handler);

  return () =>
    window.removeEventListener("astermail:mail-item-updated", handler);
}

async function seed(
  items: Array<{ id: string; thread: string; is_read: boolean }>,
  server_unread: number,
): Promise<void> {
  hoisted.list_mail_items.mockResolvedValue(index_items(items));
  hoisted.get_mail_stats.mockResolvedValue(server_stats(server_unread));

  await init_category_index();
  await flush();

  prefetch_mail_stats();
  await flush();
  await flush();
}

describe("unread counters stay in lockstep on read (integration)", () => {
  beforeEach(async () => {
    install_fake_idb();
    idb_data.clear();
    read_events.length = 0;
    hoisted.update_pwa_badge.mockClear();
    hoisted.update_item_metadata.mockReset();
    hoisted.bulk_update_items_metadata.mockReset();
    hoisted.list_mail_items.mockReset();
    hoisted.get_mail_stats.mockReset();
    clear_mail_stats();
    await clear_category_index();
    await mount_actions();
    stop_read_events = listen_read_events();
  });

  afterEach(async () => {
    stop_read_events?.();
    stop_read_events = null;
    if (root) {
      await act(async () => {
        root!.unmount();
      });
      root = null;
    }
    container?.remove();
    container = null;
  });

  it("seeds both counter sources to the same starting unread", async () => {
    await seed(
      [
        { id: "m1", thread: "t1", is_read: false },
        { id: "m2", thread: "t2", is_read: false },
        { id: "m3", thread: "t3", is_read: false },
      ],
      3,
    );

    expect(cat_unread()).toBe(3);
    expect(stats_unread()).toBe(3);
  });

  it("mark_as_read drops sidebar (stats) and category badge together, optimistically before the server write resolves", async () => {
    await seed(
      [
        { id: "m1", thread: "t1", is_read: false },
        { id: "m2", thread: "t2", is_read: false },
        { id: "m3", thread: "t3", is_read: false },
      ],
      3,
    );

    const write = deferred<{ success: boolean; encrypted?: unknown }>();
    hoisted.update_item_metadata.mockReturnValue(write.promise);

    let action_promise: Promise<boolean>;

    await act(async () => {
      action_promise = actions.mark_as_read(email("m1", "t1", false));
      await flush();
    });

    expect(stats_unread()).toBe(2);
    expect(cat_unread()).toBe(2);
    expect(read_events).toEqual([true]);

    await act(async () => {
      write.resolve({
        success: true,
        encrypted: { encrypted_metadata: "em2", metadata_nonce: "mn2" },
      });
      await action_promise;
      await flush();
    });

    expect(stats_unread()).toBe(2);
    expect(cat_unread()).toBe(2);
  });

  it("reverts both counters together when the server write fails", async () => {
    await seed(
      [
        { id: "m1", thread: "t1", is_read: false },
        { id: "m2", thread: "t2", is_read: false },
        { id: "m3", thread: "t3", is_read: false },
      ],
      3,
    );

    hoisted.update_item_metadata.mockResolvedValue({ success: false });

    await act(async () => {
      await actions.mark_as_read(email("m1", "t1", false));
      await flush();
    });

    expect(stats_unread()).toBe(3);
    expect(cat_unread()).toBe(3);
    expect(read_events).toEqual([true, false]);
  });

  it("mark_as_unread raises both counters together", async () => {
    await seed(
      [
        { id: "m1", thread: "t1", is_read: true },
        { id: "m2", thread: "t2", is_read: false },
        { id: "m3", thread: "t3", is_read: false },
      ],
      2,
    );

    expect(cat_unread()).toBe(2);
    expect(stats_unread()).toBe(2);

    const write = deferred<{ success: boolean }>();
    hoisted.update_item_metadata.mockReturnValue(write.promise);

    let action_promise: Promise<boolean>;

    await act(async () => {
      action_promise = actions.mark_as_unread(email("m1", "t1", true));
      await flush();
    });

    expect(stats_unread()).toBe(3);
    expect(cat_unread()).toBe(3);
    expect(read_events).toEqual([false]);

    await act(async () => {
      write.resolve({ success: true });
      await action_promise;
      await flush();
    });

    expect(stats_unread()).toBe(3);
    expect(cat_unread()).toBe(3);
  });

  it("a repeated mark_as_read is idempotent across both counters", async () => {
    await seed(
      [
        { id: "m1", thread: "t1", is_read: false },
        { id: "m2", thread: "t2", is_read: false },
        { id: "m3", thread: "t3", is_read: false },
      ],
      3,
    );

    hoisted.update_item_metadata.mockResolvedValue({
      success: true,
      encrypted: { encrypted_metadata: "em2", metadata_nonce: "mn2" },
    });

    await act(async () => {
      await actions.mark_as_read(email("m1", "t1", false));
      await flush();
    });

    expect(stats_unread()).toBe(2);
    expect(cat_unread()).toBe(2);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("astermail:mail-item-updated", {
          detail: { id: "m1", is_read: true },
        }),
      );
      await flush();
    });

    expect(cat_unread()).toBe(2);
  });

  it("bulk_mark_read drops both counters by the full batch, optimistically", async () => {
    await seed(
      [
        { id: "m1", thread: "t1", is_read: false },
        { id: "m2", thread: "t2", is_read: false },
        { id: "m3", thread: "t3", is_read: false },
      ],
      3,
    );

    const write = deferred<{ success: boolean; failed_ids: string[] }>();
    hoisted.bulk_update_items_metadata.mockReturnValue(write.promise);

    const batch = [
      email("m1", "t1", false),
      email("m2", "t2", false),
      email("m3", "t3", false),
    ];

    let action_promise: Promise<boolean>;

    await act(async () => {
      action_promise = actions.bulk_mark_read(batch, true);
      await flush();
    });

    expect(stats_unread()).toBe(0);
    expect(cat_unread()).toBe(0);

    await act(async () => {
      write.resolve({ success: true, failed_ids: [] });
      await action_promise;
      await flush();
    });

    expect(stats_unread()).toBe(0);
    expect(cat_unread()).toBe(0);
  });

  it("bulk_mark_read reverts both counters when the whole batch fails", async () => {
    await seed(
      [
        { id: "m1", thread: "t1", is_read: false },
        { id: "m2", thread: "t2", is_read: false },
        { id: "m3", thread: "t3", is_read: false },
      ],
      3,
    );

    hoisted.bulk_update_items_metadata.mockResolvedValue({
      success: false,
      failed_ids: ["m1", "m2", "m3"],
    });

    const batch = [
      email("m1", "t1", false),
      email("m2", "t2", false),
      email("m3", "t3", false),
    ];

    await act(async () => {
      await actions.bulk_mark_read(batch, true);
      await flush();
    });

    expect(stats_unread()).toBe(3);
    expect(cat_unread()).toBe(3);
  });
});
