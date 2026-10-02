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

const mocks = vi.hoisted(() => ({
  conversation_grouping: false,
  fetch_mail_by_ids_reconciled: vi.fn(async (ids: string[]) => ({
    emails: ids.map((id) => ({
      id,
      item_type: "received",
      is_read: true,
      thread_token: "thread-1",
      thread_message_count: 3,
    })) as unknown[],
    missing_ids: [] as string[],
    unrenderable_ids: [] as string[],
    request_ok: true,
  })),
  raw_bulk_archive: vi.fn(async (ids: string[]) => ({
    attempted_ids: ids,
    failed_ids: [] as string[],
  })),
  get_thread_messages: vi.fn(async (_token: string) => ({
    data: {
      thread: { message_count: 3 },
      messages: [
        { id: "m1", item_type: "received" },
        { id: "m2", item_type: "received" },
        { id: "m3", item_type: "received" },
      ],
    },
  })),
  api_batch_archive: vi.fn(async (_req: { ids: string[] }) => ({
    data: { success: true },
  })),
  remove_thread_entries: vi.fn((_token: string) => ["m2", "m3"]),
}));

vi.mock("@/hooks/email_list_helpers", async (import_original) => ({
  ...(await import_original<typeof import("@/hooks/email_list_helpers")>()),
  fetch_mail_by_ids_reconciled: mocks.fetch_mail_by_ids_reconciled,
  group_emails_by_thread: (x: unknown) => x,
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
    bulk_archive: mocks.raw_bulk_archive,
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

vi.mock("@/hooks/email_action_types", () => ({
  emit_mail_soft_refresh: vi.fn(),
}));

vi.mock("@/services/api/mail", () => ({
  get_thread_messages: mocks.get_thread_messages,
  trash_thread: vi.fn(),
}));

vi.mock("@/services/api/archive", () => ({
  batch_archive: mocks.api_batch_archive,
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  bulk_update_metadata_by_ids: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/components/email/hooks/preload_cache", () => ({
  mark_preload_stale: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: () => true,
  on_keys_ready: () => () => {},
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ has_keys: true, user: { email: "user@example.com" } }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      date_format: "iso",
      time_format: "24h",
      conversation_grouping: mocks.conversation_grouping,
    },
  }),
}));

vi.mock("@/services/category_index", () => ({
  batch_index_updates: (run: () => void) => run(),
  init_category_index: vi.fn(async () => {}),
  get_page_ids: () => ["m1"],
  get_category_total: () => 1,
  is_fully_built: () => true,
  is_index_settled: () => true,
  is_build_in_progress: () => false,
  is_build_stalled: () => false,
  subscribe: () => () => {},
  get_version: () => 0,
  remove_ids: vi.fn(),
  remove_ids_absent_from_server: vi.fn(),
  clear_absent_strikes: vi.fn(),
  suppress_ids: vi.fn(),
  remove_thread_entries: mocks.remove_thread_entries,
  reindex_ids: vi.fn(),
  request_full_rebuild: vi.fn(),
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

type HookResult = ReturnType<typeof use_category_inbox>;

function render_hook(): { latest: () => HookResult; root: Root } {
  let current: HookResult | null = null;

  function Harness() {
    current = use_category_inbox("primary", 0, true);

    return null;
  }

  const container = document.createElement("div");
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });

  return { latest: () => current!, root };
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }
  });
}

async function archive_first_message(): Promise<void> {
  const { latest, root } = render_hook();

  await flush();
  expect(latest().state.emails.map((e) => e.id)).toEqual(["m1"]);

  await act(async () => {
    await latest().bulk_archive(["m1"]);
  });
  await flush();

  act(() => root.unmount());
}

describe("use_category_inbox archive follows conversation grouping", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
  });

  it("archives only the selected message when grouping is off", async () => {
    mocks.conversation_grouping = false;

    await archive_first_message();

    expect(mocks.raw_bulk_archive).toHaveBeenCalledWith(["m1"]);
    expect(mocks.remove_thread_entries).not.toHaveBeenCalled();
    expect(mocks.get_thread_messages).not.toHaveBeenCalled();
    expect(mocks.api_batch_archive).not.toHaveBeenCalled();
  });

  it("still archives the rest of the conversation when grouping is on", async () => {
    mocks.conversation_grouping = true;

    await archive_first_message();

    expect(mocks.raw_bulk_archive).toHaveBeenCalledWith(["m1"]);
    expect(mocks.remove_thread_entries).toHaveBeenCalledWith("thread-1");
    expect(mocks.api_batch_archive).toHaveBeenCalledWith({
      ids: ["m2", "m3"],
      tier: "hot",
    });
  });
});
