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
  fetch_mail_by_ids: vi.fn(async () => [
    {
      id: "id1",
      item_type: "received",
      is_read: true,
      thread_token: "t1",
    } as unknown,
  ]),
  sync_recent: vi.fn(async () => {}),
}));

vi.mock("@/hooks/email_list_helpers", () => ({
  fetch_mail_by_ids: mocks.fetch_mail_by_ids,
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

vi.mock("@/services/category_index", () => ({
  init_category_index: vi.fn(async () => {}),
  get_page_ids: () => ["id1"],
  get_category_total: () => 1,
  is_fully_built: () => true,
  is_build_in_progress: () => false,
  is_build_stalled: () => false,
  subscribe: () => () => {},
  get_version: () => 0,
  remove_ids: vi.fn(),
  is_representative_unread: () => false,
  sync_recent: mocks.sync_recent,
}));

import { use_category_inbox } from "@/hooks/use_category_inbox";

interface SeenState {
  is_loading: boolean;
  emails: number;
}

function render_hook(): { states: SeenState[]; root: Root } {
  const states: SeenState[] = [];

  function Harness() {
    const r = use_category_inbox("primary", 0, true);

    states.push({
      is_loading: r.state.is_loading,
      emails: r.state.emails.length,
    });

    return null;
  }

  const container = document.createElement("div");
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });

  return { states, root };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
  });
}

describe("use_category_inbox refresh", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.fetch_mail_by_ids.mockClear();
    mocks.sync_recent.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("re-syncs and re-fetches the visible page on REFRESH_REQUESTED", async () => {
    const { states, root } = render_hook();

    await flush();

    const initial_fetches = mocks.fetch_mail_by_ids.mock.calls.length;

    expect(initial_fetches).toBeGreaterThanOrEqual(1);

    act(() => {
      window.dispatchEvent(new CustomEvent("astermail:refresh-requested"));
    });

    expect(states.at(-1)!.is_loading).toBe(true);

    await flush();

    expect(mocks.sync_recent).toHaveBeenCalledTimes(1);
    expect(mocks.fetch_mail_by_ids.mock.calls.length).toBeGreaterThan(
      initial_fetches,
    );
    expect(states.at(-1)!.is_loading).toBe(false);

    act(() => root.unmount());
  });
});
