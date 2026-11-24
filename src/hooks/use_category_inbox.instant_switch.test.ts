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
import type { EmailCategory } from "@/types/email";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

const mocks = vi.hoisted(() => ({
  page_ids: new Map<string, string[]>(),
  fetch_mail_by_ids_reconciled: vi.fn(async (ids: string[]) => ({
    emails: ids.map((id) => ({
      id,
      item_type: "received",
      is_read: false,
      thread_token: `t-${id}`,
    })) as unknown[],
    missing_ids: [] as string[],
    unrenderable_ids: [] as string[],
    request_ok: true,
  })),
}));

vi.mock("@/hooks/email_list_helpers", () => ({
  fetch_mail_by_ids_reconciled: mocks.fetch_mail_by_ids_reconciled,
  group_emails_by_thread: (x: unknown) => x,
  DEFAULT_PAGE_SIZE: 50,
}));

vi.mock("@/hooks/use_email_list_actions", () => ({
  use_email_list_actions: () => ({
    toggle_star: vi.fn(),
    toggle_pin: vi.fn(),
    mark_read: vi.fn(),
    delete_email: vi.fn(),
    archive_email: vi.fn(),
    unarchive_email: vi.fn(),
    mark_spam: vi.fn(),
  }),
}));

vi.mock("@/hooks/use_email_list_bulk", () => ({
  use_email_list_bulk: () => ({
    bulk_delete: vi.fn(),
    bulk_archive: vi.fn(),
    bulk_unarchive: vi.fn(),
  }),
}));

vi.mock("@/hooks/mail_events", () => ({
  MAIL_EVENTS: {
    MAIL_ITEM_UPDATED: "MAIL_ITEM_UPDATED",
    INBOX_UNREAD_INDEXED: "INBOX_UNREAD_INDEXED",
    REFRESH_REQUESTED: "astermail:refresh-requested",
  },
}));

vi.mock("@/components/email/hooks/preload_cache", () => ({
  mark_preload_stale: vi.fn(),
}));

vi.mock("@/services/list_snapshot_store", () => ({
  read_list_snapshot: vi.fn(async () => null),
  schedule_list_snapshot: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: () => true,
  on_keys_ready: (run: () => void) => {
    run();

    return () => {};
  },
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ has_keys: true, user: { email: "a@b.c" } }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      date_format: "iso",
      time_format: "24h",
      conversation_grouping: true,
    },
  }),
}));

vi.mock("@/services/category_index", () => ({
  batch_index_updates: (run: () => void) => run(),
  init_category_index: vi.fn(async () => {}),
  build_index: vi.fn(async () => {}),
  get_page_ids: (category: string) => mocks.page_ids.get(category) ?? [],
  get_category_total: (category: string) =>
    (mocks.page_ids.get(category) ?? []).length,
  get_active_tabs: () => [...mocks.page_ids.keys()],
  get_index_entry_count: () => 10,
  is_fully_built: () => true,
  is_index_settled: () => true,
  is_index_capped: () => false,
  is_serving_previous_build: () => false,
  is_build_in_progress: () => false,
  is_build_stalled: () => false,
  subscribe: () => () => {},
  get_version: () => 0,
  remove_ids: vi.fn(),
  remove_ids_absent_from_server: vi.fn(),
  clear_absent_strikes: vi.fn(),
  suppress_ids: vi.fn(),
  clear_suppressed_ids: vi.fn(),
  is_representative_unread: () => false,
  sync_recent: vi.fn(async () => {}),
  set_sort_order: vi.fn(),
  reconcile_server_read: vi.fn(),
  reconcile_unread_thread_siblings: vi.fn(),
  set_thread_grouping: vi.fn(),
  get_thread_rep_id: () => null,
  set_ids_read: vi.fn(),
}));

import { use_category_inbox } from "@/hooks/use_category_inbox";
import { clear_category_row_cache } from "@/hooks/email_list_helpers/row_store";

interface SeenState {
  emails: string[];
  is_loading: boolean;
}

interface Harness {
  states: SeenState[];
  root: Root;
  set_category: (c: EmailCategory) => void;
}

function make_harness(initial: EmailCategory = "primary"): Harness {
  const states: SeenState[] = [];
  let current: EmailCategory = initial;
  const container = document.createElement("div");
  let root!: Root;

  function View({ category }: { category: EmailCategory }) {
    const r = use_category_inbox(category, 0, true);

    useLayoutEffect(() => {
      states.push({
        emails: r.state.emails.map((e) => e.id),
        is_loading: r.state.is_loading,
      });
    });

    return null;
  }

  const render_current = () => {
    root.render(createElement(View, { category: current }));
  };

  act(() => {
    root = createRoot(container);
    render_current();
  });

  return {
    states,
    root,
    set_category: (c: EmailCategory) => {
      current = c;
      act(() => render_current());
    },
  };
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, ms));
    await Promise.resolve();
  });
}

function fetched_ids(): string[][] {
  return mocks.fetch_mail_by_ids_reconciled.mock.calls.map(
    (call) => call[0] as string[],
  );
}

function expect_instant(states: SeenState[], first_ids: string[]): void {
  expect(states.length).toBeGreaterThan(0);
  for (const seen of states) {
    expect(seen.is_loading).toBe(false);
    expect(seen.emails.length).toBeGreaterThan(0);
  }
  expect(states[0].emails).toEqual(first_ids);
}

describe("use_category_inbox instant category switch", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    clear_category_row_cache();
    mocks.page_ids.clear();
    mocks.page_ids.set("primary", ["p1", "p2"]);
    mocks.page_ids.set("updates", ["u1", "u2"]);
    mocks.page_ids.set("promotions", ["m1"]);
    mocks.fetch_mail_by_ids_reconciled.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefetches the other tabs and paints the first visit without loading", async () => {
    const { states, root, set_category } = make_harness();

    await flush();
    await flush(400);

    expect(fetched_ids()).toEqual(
      expect.arrayContaining([["p1", "p2"], ["u1", "u2"], ["m1"]]),
    );

    const switched_at = states.length;

    set_category("promotions");

    expect_instant(states.slice(switched_at), ["m1"]);

    await flush();

    expect_instant(states.slice(switched_at), ["m1"]);
    act(() => root.unmount());
  });

  it("paints a visited tab on the first render after the inbox remounts", async () => {
    const first = make_harness();

    await flush();
    first.set_category("updates");
    await flush();
    act(() => first.root.unmount());

    const second = make_harness("updates");

    expect_instant(second.states, ["u1", "u2"]);

    await flush();

    expect_instant(second.states, ["u1", "u2"]);
    act(() => second.root.unmount());
  });

  it("paints the known rows at once when a visited tab gained new mail", async () => {
    const { states, root, set_category } = make_harness();

    await flush();
    set_category("updates");
    await flush();
    set_category("primary");
    await flush();

    mocks.page_ids.set("updates", ["u0", "u1", "u2"]);

    const switched_at = states.length;

    set_category("updates");

    expect_instant(states.slice(switched_at), ["u1", "u2"]);

    await flush();

    const after = states.slice(switched_at);

    expect_instant(after, ["u1", "u2"]);
    expect(after.at(-1)?.emails).toEqual(["u0", "u1", "u2"]);
    act(() => root.unmount());
  });

  it("keeps the other tabs in memory through a manual refresh", async () => {
    const { states, root, set_category } = make_harness();

    await flush();
    set_category("updates");
    await flush();
    set_category("primary");
    await flush();

    act(() => {
      window.dispatchEvent(new CustomEvent("astermail:refresh-requested"));
    });
    await flush();

    const switched_at = states.length;

    set_category("updates");
    await flush();

    expect_instant(states.slice(switched_at), ["u1", "u2"]);
    act(() => root.unmount());
  });

  it("settles an empty tab on the switch render without a loading pass", async () => {
    mocks.page_ids.set("social", []);

    const { states, root, set_category } = make_harness();

    await flush();

    const switched_at = states.length;

    set_category("social");

    const after = states.slice(switched_at);

    expect(after.length).toBeGreaterThan(0);
    for (const seen of after) {
      expect(seen).toEqual({ emails: [], is_loading: false });
    }

    await flush();

    for (const seen of states.slice(switched_at)) {
      expect(seen.is_loading).toBe(false);
    }
    act(() => root.unmount());
  });

  it("drops the decrypted rows when the mail cache is cleared", async () => {
    const first = make_harness();

    await flush();
    act(() => first.root.unmount());
    clear_category_row_cache();

    const second = make_harness();

    expect(second.states[0]).toEqual({ emails: [], is_loading: true });
    act(() => second.root.unmount());
  });
});
