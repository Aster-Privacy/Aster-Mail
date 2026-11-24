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

interface FetchResult {
  emails: unknown[];
  missing_ids: string[];
  unrenderable_ids: string[];
  request_ok: boolean;
}

const mocks = vi.hoisted(() => ({
  fetch_mail_by_ids_reconciled: vi.fn(),
  read_list_snapshot: vi.fn(),
  schedule_list_snapshot: vi.fn(),
  sync_recent: vi.fn(async () => {}),
}));

vi.mock("@/services/list_snapshot_store", () => ({
  read_list_snapshot: mocks.read_list_snapshot,
  schedule_list_snapshot: mocks.schedule_list_snapshot,
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

vi.mock("@/services/category_index", () => ({
  batch_index_updates: (run: () => void) => run(),
  init_category_index: vi.fn(async () => {}),
  get_page_ids: () => ["id1", "id2", "id3", "id4"],
  get_category_total: () => 4,
  get_active_tabs: () => ["primary"],
  is_index_capped: () => false,
  get_index_entry_count: () => 4,
  is_fully_built: () => true,
  is_index_settled: () => true,
  is_serving_previous_build: () => false,
  is_build_in_progress: () => false,
  is_build_stalled: () => false,
  subscribe: () => () => {},
  get_version: () => 0,
  remove_ids: vi.fn(),
  remove_ids_absent_from_server: vi.fn(),
  clear_absent_strikes: vi.fn(),
  suppress_ids: vi.fn(),
  is_representative_unread: () => false,
  sync_recent: mocks.sync_recent,
  set_sort_order: vi.fn(),
  reconcile_server_read: vi.fn(),
  reconcile_unread_thread_siblings: vi.fn(),
  set_thread_grouping: vi.fn(),
  get_thread_rep_id: () => null,
}));

import { use_category_inbox } from "@/hooks/use_category_inbox";
import { clear_category_row_cache } from "@/hooks/email_list_helpers/row_store";

const SEALED = "••••••••••••••";

function row(id: string, subject: string) {
  return {
    id,
    subject,
    item_type: "received",
    is_read: true,
    is_encrypted: false,
    thread_token: `t-${id}`,
  };
}

function sealed_row(id: string) {
  return {
    id,
    subject: SEALED,
    item_type: "received",
    is_read: true,
    is_encrypted: true,
  };
}

function fetch_ok(emails: unknown[]): FetchResult {
  return { emails, missing_ids: [], unrenderable_ids: [], request_ok: true };
}

const FULL_PAGE = ["id1", "id2", "id3", "id4"].map((id) =>
  row(id, `subject ${id}`),
);
const FULL_SUBJECTS = FULL_PAGE.map((email) => email.subject);
const HALF_SEALED_PAGE = [
  row("id1", "subject id1"),
  sealed_row("id2"),
  row("id3", "subject id3"),
  sealed_row("id4"),
];

function render_hook(): { subjects: () => string[]; root: Root } {
  let latest: string[] = [];

  function Harness() {
    const r = use_category_inbox("primary", 0, true);

    latest = r.state.emails.map((email) => email.subject);

    return null;
  }

  const container = document.createElement("div");
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });

  return { subjects: () => latest, root };
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("use_category_inbox first page after a reload", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    clear_category_row_cache();
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.fetch_mail_by_ids_reconciled.mockReset();
    mocks.read_list_snapshot.mockReset();
    mocks.schedule_list_snapshot.mockReset();
    mocks.read_list_snapshot.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fills rows that arrived without content once the server delivers them", async () => {
    mocks.fetch_mail_by_ids_reconciled
      .mockResolvedValueOnce(fetch_ok(HALF_SEALED_PAGE))
      .mockResolvedValue(fetch_ok(FULL_PAGE));

    const { subjects, root } = render_hook();

    await advance(0);
    await advance(60_000);

    expect(subjects()).toEqual(FULL_SUBJECTS);
    expect(
      mocks.fetch_mail_by_ids_reconciled.mock.calls.length,
    ).toBeGreaterThan(1);

    act(() => root.unmount());
  });

  it("never saves a page with rows that have no content as the reload snapshot", async () => {
    mocks.fetch_mail_by_ids_reconciled.mockResolvedValue(
      fetch_ok(HALF_SEALED_PAGE),
    );

    const { root } = render_hook();

    await advance(0);
    await advance(5_000);

    for (const call of mocks.schedule_list_snapshot.mock.calls) {
      const rows = call[3] as { subject: string }[];

      expect(rows.some((email) => email.subject === SEALED)).toBe(false);
    }

    act(() => root.unmount());
  });

  it("keeps the saved rows when the fresh page returns them without content", async () => {
    mocks.read_list_snapshot.mockResolvedValue({
      emails: FULL_PAGE,
      saved_at: Date.now(),
    });

    let release!: (value: FetchResult) => void;

    mocks.fetch_mail_by_ids_reconciled
      .mockReturnValueOnce(
        new Promise<FetchResult>((done) => {
          release = done;
        }),
      )
      .mockResolvedValue(fetch_ok(HALF_SEALED_PAGE));

    const { subjects, root } = render_hook();

    await advance(0);
    expect(subjects()).toEqual(FULL_SUBJECTS);

    await act(async () => {
      release(fetch_ok(HALF_SEALED_PAGE));
      await Promise.resolve();
    });
    await advance(0);

    expect(subjects()).toEqual(FULL_SUBJECTS);

    act(() => root.unmount());
  });

  it("stops asking again after a bounded number of attempts", async () => {
    mocks.fetch_mail_by_ids_reconciled.mockResolvedValue(
      fetch_ok(HALF_SEALED_PAGE),
    );

    const { subjects, root } = render_hook();

    await advance(0);
    await advance(10 * 60_000);

    const calls = mocks.fetch_mail_by_ids_reconciled.mock.calls.length;

    await advance(10 * 60_000);

    expect(mocks.fetch_mail_by_ids_reconciled.mock.calls.length).toBe(calls);
    expect(calls).toBeLessThanOrEqual(8);
    expect(subjects()).toHaveLength(4);

    act(() => root.unmount());
  });
});
