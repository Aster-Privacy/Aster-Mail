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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mocks = vi.hoisted(() => ({
  fetch_mail_by_ids_reconciled: vi.fn(async (ids: string[]) => ({
    emails: ids.map((id) => ({
      id,
      item_type: "received",
      is_read: true,
      thread_token: `t-${id}`,
    })) as unknown[],
    missing_ids: [] as string[],
    unrenderable_ids: [] as string[],
    request_ok: true,
  })),
  sync_recent: vi.fn(async () => {}),
  page_ids: ["id1", "id2"] as string[],
  version: 0,
  notify: null as null | (() => void),
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

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: () => true,
  on_keys_ready: () => () => {},
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

vi.mock("@/services/category_index", async () => {
  const removed = await import("@/services/removed_items");

  return {
    batch_index_updates: (run: () => void) => run(),
    init_category_index: vi.fn(async () => {}),
    get_page_ids: () => mocks.page_ids,
    get_category_total: () => mocks.page_ids.length,
    is_fully_built: () => true,
    is_index_settled: () => true,
    is_serving_previous_build: () => false,
    is_build_in_progress: () => false,
    is_build_stalled: () => false,
    subscribe: (fn: () => void) => {
      mocks.notify = fn;

      return () => {
        mocks.notify = null;
      };
    },
    get_version: () => mocks.version,
    remove_ids: (ids: string[]) => removed.note_removed_ids(ids),
    remove_ids_absent_from_server: vi.fn(),
    clear_absent_strikes: vi.fn(),
    suppress_ids: vi.fn(),
    is_recently_read: () => false,
    is_representative_unread: () => false,
    sync_recent: mocks.sync_recent,
    set_sort_order: vi.fn(),
    reconcile_server_read: vi.fn(),
    reconcile_unread_thread_siblings: vi.fn(),
    set_thread_grouping: vi.fn(),
    get_thread_rep_id: () => null,
    build_index: vi.fn(async () => {}),
    get_index_entry_count: () => mocks.page_ids.length,
    get_active_tabs: () => [],
    is_index_capped: () => false,
    clear_suppressed_ids: vi.fn(),
    remove_thread_entries: vi.fn(),
    reindex_ids: vi.fn(),
    request_full_rebuild: vi.fn(),
    index_arrival: vi.fn(),
    set_ids_read: vi.fn(),
  };
});

import { use_category_inbox } from "@/hooks/use_category_inbox";
import { clear_category_row_cache } from "@/hooks/email_list_helpers/row_store";
import { clear_removed_items } from "@/services/removed_items";

interface SeenState {
  is_loading: boolean;
  ids: string[];
}

function render_hook(): {
  states: SeenState[];
  root: Root;
  api: { current: ReturnType<typeof use_category_inbox> | null };
} {
  const states: SeenState[] = [];
  const api: { current: ReturnType<typeof use_category_inbox> | null } = {
    current: null,
  };

  function Harness() {
    const r = use_category_inbox("primary", 0, true);

    api.current = r;
    states.push({
      is_loading: r.state.is_loading,
      ids: r.state.emails.map((email) => email.id),
    });

    return null;
  }

  const container = document.createElement("div");
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });

  return { states, root, api };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
  });
}

function remove_visible(
  api: { current: ReturnType<typeof use_category_inbox> | null },
  ids: string[],
  next_page_ids: string[],
): void {
  act(() => {
    api.current!.remove_emails(ids);
    mocks.page_ids = next_page_ids;
    mocks.version += 1;
    mocks.notify?.();
  });
}

describe("use_category_inbox list removal", () => {
  beforeEach(() => {
    clear_category_row_cache();
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.fetch_mail_by_ids_reconciled.mockClear();
    mocks.sync_recent.mockClear();
    mocks.page_ids = ["id1", "id2"];
    mocks.version = 0;
    clear_removed_items();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fills in the next rows without a loading state when the whole page is removed", async () => {
    const { states, root, api } = render_hook();

    await flush();
    expect(states.at(-1)!.ids).toEqual(["id1", "id2"]);

    const settled = states.length;

    remove_visible(api, ["id1", "id2"], ["id3", "id4"]);
    await flush();

    expect(states.slice(settled).some((s) => s.is_loading)).toBe(false);
    expect(states.at(-1)!.ids).toEqual(["id3", "id4"]);

    act(() => root.unmount());
  });

  it("settles on an empty list without a loading state when the last rows are removed", async () => {
    const { states, root, api } = render_hook();

    await flush();

    const settled = states.length;

    remove_visible(api, ["id1", "id2"], []);
    await flush();

    expect(states.slice(settled).some((s) => s.is_loading)).toBe(false);
    expect(states.at(-1)!.ids).toEqual([]);

    act(() => root.unmount());
  });

  it("never shows a removed row again when a later fetch still returns it", async () => {
    const { states, root, api } = render_hook();

    await flush();

    const settled = states.length;

    remove_visible(api, ["id1"], ["id1", "id2"]);
    await flush();
    act(() => {
      mocks.version += 1;
      mocks.page_ids = ["id1", "id2", "id3"];
      mocks.notify?.();
    });
    await flush();

    const after_removal = states.slice(settled);
    const gone_at = after_removal.findIndex((s) => !s.ids.includes("id1"));

    expect(gone_at).toBeGreaterThanOrEqual(0);
    expect(
      after_removal.slice(gone_at).some((s) => s.ids.includes("id1")),
    ).toBe(false);
    expect(states.at(-1)!.ids).toEqual(["id2", "id3"]);
    expect(
      mocks.fetch_mail_by_ids_reconciled.mock.calls.some(
        (call, index) => index > 0 && call[0].includes("id1"),
      ),
    ).toBe(false);

    act(() => root.unmount());
  });
});
