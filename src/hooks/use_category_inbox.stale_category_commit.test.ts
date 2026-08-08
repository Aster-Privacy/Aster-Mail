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
import { createElement, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

const mocks = vi.hoisted(() => {
  const pending: Record<string, () => void> = {};
  const hang_for = new Set<string>();

  const make_result = (ids: string[]) => ({
    emails: ids.map((id) => ({
      id,
      item_type: "received",
      is_read: true,
      thread_token: id,
      subject: id,
      created_at: new Date().toISOString(),
    })),
    missing_ids: [] as string[],
    unrenderable_ids: [] as string[],
    request_ok: true,
  });

  return {
    pending,
    hang_for,
    passphrase_in_memory: true,
    fetch_mail_by_ids_reconciled: vi.fn((ids: string[]) => {
      const key = ids.join(",");

      if (!hang_for.has(key)) return Promise.resolve(make_result(ids));

      return new Promise((resolve) => {
        pending[key] = () => resolve(make_result(ids));
      });
    }),
  };
});

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
  has_passphrase_in_memory: () => mocks.passphrase_in_memory,
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

vi.mock("@/services/category_index", () => ({
  init_category_index: vi.fn(async () => {}),
  get_page_ids: (category: string) =>
    category === "primary" ? ["primary_1"] : ["promo_1"],
  get_category_total: () => 1,
  is_fully_built: () => true,
  is_index_settled: () => true,
  is_build_in_progress: () => false,
  is_build_stalled: () => false,
  subscribe: () => () => {},
  get_version: () => 0,
  remove_ids: vi.fn(),
  suppress_ids: vi.fn(),
  is_recently_read: () => false,
  is_representative_unread: () => false,
  sync_recent: vi.fn(async () => {}),
  set_sort_order: vi.fn(),
  reconcile_server_read: vi.fn(),
  reconcile_unread_thread_siblings: vi.fn(),
  set_thread_grouping: vi.fn(),
  get_thread_rep_id: () => null,
}));

import { use_category_inbox } from "@/hooks/use_category_inbox";

type Category = Parameters<typeof use_category_inbox>[0];

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
  });
}

describe("use_category_inbox stale category commit", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.fetch_mail_by_ids_reconciled.mockClear();
    mocks.hang_for.clear();
    mocks.passphrase_in_memory = true;
    for (const key of Object.keys(mocks.pending)) delete mocks.pending[key];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("drops a slow category's rows when the user has already switched back", async () => {
    mocks.hang_for.add("promo_1");

    let seen_ids: string[] = [];
    let set_category: (c: string) => void = () => {};

    function harness({ category }: { category: string }) {
      const result = use_category_inbox(category as Category, 0, true);

      seen_ids = result.state.emails.map((e: { id: string }) => e.id);

      return null;
    }

    function app() {
      const [category, set] = useState("primary");

      set_category = set;

      return createElement(harness, { category });
    }

    const container = document.createElement("div");
    let root!: Root;

    act(() => {
      root = createRoot(container);
      root.render(createElement(app));
    });

    await flush();

    expect(seen_ids).toEqual(["primary_1"]);

    act(() => set_category("promotions"));
    await flush();

    expect(seen_ids).not.toContain("promo_1");

    mocks.passphrase_in_memory = false;

    act(() => set_category("primary"));
    await flush();

    mocks.passphrase_in_memory = true;

    act(() => {
      mocks.pending["promo_1"]?.();
    });
    await flush();

    expect(seen_ids).not.toContain("promo_1");

    act(() => root.unmount());
  });
});
