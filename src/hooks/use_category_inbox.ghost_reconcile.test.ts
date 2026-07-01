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
  fetch_mail_by_ids_reconciled: vi.fn(),
  remove_ids: vi.fn(),
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
  get_page_ids: () => ["gone1", "gone2"],
  get_category_total: () => 2,
  is_fully_built: () => true,
  is_build_in_progress: () => false,
  is_build_stalled: () => false,
  subscribe: () => () => {},
  get_version: () => 0,
  remove_ids: mocks.remove_ids,
  is_representative_unread: () => false,
  sync_recent: vi.fn(async () => {}),
  set_sort_order: vi.fn(),
}));

import { use_category_inbox } from "@/hooks/use_category_inbox";

function render_hook(): Root {
  function Harness() {
    use_category_inbox("primary", 0, true);

    return null;
  }

  const container = document.createElement("div");
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });

  return root;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
  });
}

describe("use_category_inbox ghost reconcile", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.remove_ids.mockClear();
    mocks.fetch_mail_by_ids_reconciled.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prunes indexed ids the server no longer returns so the ghost count clears", async () => {
    mocks.fetch_mail_by_ids_reconciled.mockResolvedValue({
      emails: [],
      missing_ids: ["gone1", "gone2"],
      request_ok: true,
    });

    const root = render_hook();

    await flush();

    expect(mocks.remove_ids).toHaveBeenCalledWith(["gone1", "gone2"]);

    act(() => root.unmount());
  });

  it("does not prune when the fetch request itself failed", async () => {
    mocks.fetch_mail_by_ids_reconciled.mockResolvedValue({
      emails: [],
      missing_ids: [],
      request_ok: false,
    });

    const root = render_hook();

    await flush();

    expect(mocks.remove_ids).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("retries a transiently failed fetch until it succeeds", async () => {
    vi.useFakeTimers();

    let call = 0;

    mocks.fetch_mail_by_ids_reconciled.mockImplementation(async () => {
      call += 1;

      if (call === 1) {
        return { emails: [], missing_ids: [], request_ok: false };
      }

      return {
        emails: [
          {
            id: "gone1",
            item_type: "received",
            is_read: true,
            thread_token: "t",
          } as unknown,
        ],
        missing_ids: [],
        request_ok: true,
      };
    });

    let root!: Root;

    await act(async () => {
      const container = document.createElement("div");

      root = createRoot(container);
      root.render(
        createElement(function Harness() {
          use_category_inbox("primary", 0, true);

          return null;
        }),
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const after_first = call;

    expect(after_first).toBeGreaterThanOrEqual(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(call).toBeGreaterThan(after_first);
    expect(mocks.remove_ids).not.toHaveBeenCalled();

    act(() => root.unmount());
    vi.useRealTimers();
  });
});
