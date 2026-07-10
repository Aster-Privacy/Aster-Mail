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
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mocks = vi.hoisted(() => ({
  read_state: new Map<string, boolean>(),
  fetch_mail_by_ids_reconciled: vi.fn(async (ids: string[]) => ({
    emails: ids.map((id) => ({
      id,
      item_type: "received",
      is_read: mocks.read_state.get(id) ?? false,
      thread_token: `t-${id}`,
    })) as unknown[],
    missing_ids: [] as string[],
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
  get_page_ids: (category: string) =>
    category === "primary" ? ["p1"] : ["u1"],
  get_category_total: () => 1,
  is_fully_built: () => true,
  is_build_in_progress: () => false,
  is_build_stalled: () => false,
  subscribe: () => () => {},
  get_version: () => 0,
  remove_ids: vi.fn(),
  is_representative_unread: () => false,
  sync_recent: vi.fn(async () => {}),
  set_sort_order: vi.fn(),
  reconcile_server_read: vi.fn(),
  set_thread_grouping: vi.fn(),
  get_thread_rep_id: () => null,
}));

import { use_category_inbox } from "@/hooks/use_category_inbox";

interface SeenState {
  emails: { id: string; is_read: boolean }[];
}

function make_harness(): {
  states: SeenState[];
  root: Root;
  set_category: (c: EmailCategory) => void;
} {
  const states: SeenState[] = [];
  let current: EmailCategory = "primary";
  const container = document.createElement("div");
  let root!: Root;

  function Harness({ category }: { category: EmailCategory }) {
    const r = use_category_inbox(category, 0, true);

    states.push({
      emails: r.state.emails.map((e) => ({ id: e.id, is_read: !!e.is_read })),
    });

    return null;
  }

  const render_current = () => {
    root.render(createElement(Harness, { category: current }));
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

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
  });
}

describe("use_category_inbox read-state cache invalidation", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.read_state.clear();
    mocks.fetch_mail_by_ids_reconciled.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not resurrect a stale unread flag from the page cache after switching tabs and back", async () => {
    const { states, root, set_category } = make_harness();

    await flush();

    expect(states.at(-1)!.emails).toEqual([{ id: "p1", is_read: false }]);

    mocks.read_state.set("p1", true);
    act(() => {
      window.dispatchEvent(
        new CustomEvent("MAIL_ITEM_UPDATED", {
          detail: { id: "p1", is_read: true },
        }),
      );
    });

    expect(states.at(-1)!.emails).toEqual([{ id: "p1", is_read: true }]);

    set_category("updates");
    await flush();

    expect(states.at(-1)!.emails).toEqual([{ id: "u1", is_read: false }]);

    set_category("primary");
    await flush();

    expect(states.at(-1)!.emails).toEqual([{ id: "p1", is_read: true }]);

    act(() => root.unmount());
  });
});
