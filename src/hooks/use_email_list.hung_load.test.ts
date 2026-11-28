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
  fetch_mail_from_api: vi.fn(),
  user: { id: "u1", email: "a@b.c" },
}));

vi.mock("@/services/list_snapshot_store", () => ({
  read_list_snapshot: vi.fn(async () => null),
  schedule_list_snapshot: vi.fn(),
}));

vi.mock("@/hooks/email_list_helpers", async () => {
  const views = await vi.importActual<
    typeof import("@/hooks/email_list_helpers/views")
  >("@/hooks/email_list_helpers/views");

  return {
    fetch_mail_from_api: mocks.fetch_mail_from_api,
    insert_emails_at: (emails: unknown[]) => emails,
    resolve_list_total: views.resolve_list_total,
    grow_list_total: views.grow_list_total,
    DEFAULT_PAGE_SIZE: 50,
  };
});

vi.mock("@/hooks/email_list_helpers/silent_refresh", () => ({
  merge_silent_refresh_emails: (_prev: unknown[], next: unknown[]) => next,
  retain_left_filter_rows: (_prev: unknown[], next: unknown[]) => ({
    emails: next,
    retained: 0,
  }),
}));

vi.mock("@/hooks/email_list_cache", () => ({
  get_view_cache: () => undefined,
  set_view_cache: vi.fn(),
  invalidate_mail_cache: vi.fn(),
  clear_mail_cache: vi.fn(),
  remove_email_from_view_cache: vi.fn(),
  mark_view_stale: vi.fn(),
}));

vi.mock("@/hooks/use_email_list_actions", () => ({
  use_email_list_actions: () => ({}),
}));

vi.mock("@/hooks/use_email_list_bulk", () => ({
  use_email_list_bulk: () => ({}),
}));

vi.mock("@/hooks/use_email_list_events", () => ({
  use_email_list_events: vi.fn(),
}));

vi.mock("@/services/removed_items", () => ({
  drop_removed_after: (rows: unknown[]) => rows,
}));

vi.mock("@/services/read_intent", () => ({
  apply_flag_intents: (rows: unknown[]) => rows,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: () => true,
  on_keys_ready: () => () => {},
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    has_keys: true,
    is_loading: false,
    is_authenticated: true,
    user: mocks.user,
    is_completing_registration: false,
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      date_format: "iso",
      time_format: "24h",
      conversation_grouping: true,
      inbox_sort_order: "newest_first",
    },
  }),
}));

vi.mock("@/components/email/hooks/preload_cache_store", () => ({
  clear_preload_cache: vi.fn(),
}));

vi.mock("@/services/offline_email_cache", () => ({
  cache_email_list: vi.fn(async () => {}),
  get_cached_email_list: vi.fn(async () => null),
}));

vi.mock("@/hooks/use_online_status", () => ({
  use_online_status: () => ({ is_online: true }),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock("@/hooks/view_prefetch", () => ({
  PREFETCH_VIEWS: [],
  prefetch_views_when_idle: () => () => {},
  set_view_prefetch_context: () => {},
}));

import { LIST_LOAD_DEADLINE_MS, use_email_list } from "@/hooks/use_email_list";

interface Seen {
  ids: string[];
  is_loading: boolean;
  has_load_error: boolean;
}

function rows() {
  return Array.from({ length: 50 }, (_, i) => ({
    id: `row_${i}`,
    subject: `row ${i}`,
    item_type: "received",
    is_read: true,
  }));
}

function render_hook(view: string): { seen: Seen[]; refresh: () => void; unmount: () => void } {
  const seen: Seen[] = [];
  let refresh: () => void = () => undefined;

  function Harness() {
    const r = use_email_list(view);

    refresh = r.refresh;
    seen.push({
      ids: r.state.emails.map((email) => email.id),
      is_loading: r.state.is_loading,
      has_load_error: r.state.has_load_error === true,
    });

    return null;
  }

  const container = document.createElement("div");
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });

  return {
    seen,
    refresh: () => refresh(),
    unmount: () => act(() => root.unmount()),
  };
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("use_email_list when a page load never settles", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    mocks.fetch_mail_from_api.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops loading and shows the retry state instead of skeletons forever", async () => {
    mocks.fetch_mail_from_api.mockImplementation(
      () => new Promise(() => undefined),
    );

    const { seen, unmount } = render_hook("inbox");

    await advance(1000);
    expect(seen.at(-1)!.is_loading).toBe(true);

    await advance(LIST_LOAD_DEADLINE_MS * 2 + 5000);

    const last = seen.at(-1)!;

    expect(last.is_loading).toBe(false);
    expect(last.has_load_error).toBe(true);
    expect(mocks.fetch_mail_from_api).toHaveBeenCalledTimes(2);

    unmount();
  });

  it("shows rows when the retry after a hung load succeeds", async () => {
    let calls = 0;

    mocks.fetch_mail_from_api.mockImplementation(() => {
      calls += 1;
      if (calls === 1) return new Promise(() => undefined);

      return Promise.resolve({
        emails: rows(),
        total: 50,
        has_more: false,
        raw_consumed: 50,
      });
    });

    const { seen, unmount } = render_hook("inbox");

    await advance(LIST_LOAD_DEADLINE_MS + 5000);

    const last = seen.at(-1)!;

    expect(last.is_loading).toBe(false);
    expect(last.has_load_error).toBe(false);
    expect(last.ids).toHaveLength(50);

    unmount();
  });
});
