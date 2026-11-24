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
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

interface FetchResult {
  emails: unknown[];
  total: number;
  has_more: boolean;
  raw_consumed: number;
}

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

import { use_email_list } from "@/hooks/use_email_list";

const PAGE_SIZE = 50;
const TOTAL = 150;

interface Seen {
  ids: string[];
  has_load_error: boolean;
  total: number;
}

type HookApi = ReturnType<typeof use_email_list>;

function page_rows(page: number) {
  return Array.from({ length: PAGE_SIZE }, (_, i) => ({
    id: `p${page}_${i}`,
    subject: `page ${page} row ${i}`,
    item_type: "received",
    is_read: true,
  }));
}

function page_result(page: number): FetchResult {
  return {
    emails: page_rows(page),
    total: TOTAL,
    has_more: (page + 1) * PAGE_SIZE < TOTAL,
    raw_consumed: PAGE_SIZE,
  };
}

function render_hook(view: string): {
  seen: Seen[];
  api: { current: HookApi | null };
  root: Root;
} {
  const seen: Seen[] = [];
  const api: { current: HookApi | null } = { current: null };

  function Harness() {
    const r = use_email_list(view);

    api.current = r;
    seen.push({
      ids: r.state.emails.map((email) => email.id),
      has_load_error: r.state.has_load_error === true,
      total: r.state.total_messages,
    });

    return null;
  }

  const container = document.createElement("div");
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });

  return { seen, api, root };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  await act(async () => {
    await new Promise((r) => setTimeout(r, 2500));
  });
  for (let i = 0; i < 2; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function offset_page(offset: unknown): number {
  return Math.floor(Number(offset ?? 0) / PAGE_SIZE);
}

describe("use_email_list page load error", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.fetch_mail_from_api.mockReset();
  });

  it("never presents the previous page's rows as the page that failed", async () => {
    const failing = new Set<number>();

    mocks.fetch_mail_from_api.mockImplementation(async (...args: unknown[]) => {
      const page = offset_page(args[6]);

      if (failing.has(page)) throw new Error("network");

      return page_result(page);
    });

    const { seen, api, root } = render_hook("archive");

    await settle();

    expect(seen.at(-1)!.ids[0]).toBe("p0_0");

    failing.add(1);
    await act(async () => {
      await api.current!.fetch_page(1, PAGE_SIZE, { force: true });
    });
    await settle();

    const after_failure = seen.at(-1)!;

    expect(after_failure.ids.some((id) => id.startsWith("p0_"))).toBe(false);
    expect(after_failure.has_load_error).toBe(true);
    expect(after_failure.total).toBe(TOTAL);

    failing.delete(1);
    await act(async () => {
      api.current!.refresh();
    });
    await settle();

    const after_retry = seen.at(-1)!;

    expect(after_retry.has_load_error).toBe(false);
    expect(after_retry.ids[0]).toBe("p1_0");
    expect(after_retry.ids).toHaveLength(PAGE_SIZE);

    act(() => root.unmount());
  });

  it("keeps the current rows when a refresh of the same page fails", async () => {
    let fail = false;

    mocks.fetch_mail_from_api.mockImplementation(async (...args: unknown[]) => {
      if (fail) throw new Error("network");

      return page_result(offset_page(args[6]));
    });

    const { seen, api, root } = render_hook("archive");

    await settle();

    fail = true;
    await act(async () => {
      await api.current!.fetch_page(0, PAGE_SIZE, { force: true });
    });
    await settle();

    const last = seen.at(-1)!;

    expect(last.ids[0]).toBe("p0_0");
    expect(last.has_load_error).toBe(false);

    act(() => root.unmount());
  });
});
