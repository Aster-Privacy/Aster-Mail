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
  missing_ids: string[];
  unrenderable_ids: string[];
  request_ok: boolean;
}

interface SnapshotResult {
  emails: unknown[];
  saved_at: number;
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
  get_page_ids: () => ["id1", "id2"],
  get_category_total: () => 2,
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
  is_representative_unread: () => false,
  sync_recent: mocks.sync_recent,
  set_sort_order: vi.fn(),
  reconcile_server_read: vi.fn(),
  reconcile_unread_thread_siblings: vi.fn(),
  set_thread_grouping: vi.fn(),
  get_thread_rep_id: () => null,
}));

import { use_category_inbox } from "@/hooks/use_category_inbox";

interface SeenState {
  is_loading: boolean;
  subjects: string[];
}

function row(id: string, subject: string) {
  return {
    id,
    subject,
    item_type: "received",
    is_read: true,
    thread_token: `t-${id}`,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function fetch_ok(emails: unknown[]): FetchResult {
  return { emails, missing_ids: [], unrenderable_ids: [], request_ok: true };
}

function render_hook(): { states: SeenState[]; root: Root } {
  const states: SeenState[] = [];

  function Harness() {
    const r = use_category_inbox("primary", 0, true);

    states.push({
      is_loading: r.state.is_loading,
      subjects: r.state.emails.map((email) => email.subject),
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

const SNAPSHOT_ROWS = [row("id1", "saved one"), row("id2", "saved two")];
const SERVER_ROWS = [row("id1", "server one"), row("id2", "server two")];

describe("use_category_inbox snapshot first paint", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.fetch_mail_by_ids_reconciled.mockReset();
    mocks.read_list_snapshot.mockReset();
    mocks.schedule_list_snapshot.mockReset();
    mocks.sync_recent.mockClear();
    mocks.read_list_snapshot.mockResolvedValue(null);
    mocks.fetch_mail_by_ids_reconciled.mockResolvedValue(fetch_ok(SERVER_ROWS));
  });

  it("paints the saved rows before the server answers, then revalidates", async () => {
    const network = deferred<FetchResult>();

    mocks.fetch_mail_by_ids_reconciled.mockReturnValue(network.promise);
    mocks.read_list_snapshot.mockResolvedValue({
      emails: SNAPSHOT_ROWS,
      saved_at: Date.now(),
    } satisfies SnapshotResult);

    const { states, root } = render_hook();

    await flush();

    expect(states.at(-1)).toEqual({
      is_loading: false,
      subjects: ["saved one", "saved two"],
    });
    expect(mocks.fetch_mail_by_ids_reconciled).toHaveBeenCalledTimes(1);

    await act(async () => {
      network.resolve(fetch_ok(SERVER_ROWS));
      await Promise.resolve();
    });
    await flush();

    expect(states.at(-1)).toEqual({
      is_loading: false,
      subjects: ["server one", "server two"],
    });
    expect(mocks.fetch_mail_by_ids_reconciled).toHaveBeenCalledTimes(1);
    expect(
      states.some(
        (seen, i) =>
          i > 0 &&
          seen.subjects.length === 0 &&
          states[i - 1].subjects.length > 0,
      ),
    ).toBe(false);

    act(() => root.unmount());
  });

  it("asks for the snapshot of the exact page it is about to fetch", async () => {
    const { root } = render_hook();

    await flush();

    expect(mocks.read_list_snapshot).toHaveBeenCalledTimes(1);

    const [scope, owner, signature] = mocks.read_list_snapshot.mock.calls[0];

    expect(scope).toBe("category:primary");
    expect(owner).toBe("a@b.c");
    expect(signature).toContain("id1,id2");
    expect(signature.startsWith("primary:0:")).toBe(true);

    act(() => root.unmount());
  });

  it("keeps the loading state when there is no snapshot", async () => {
    const network = deferred<FetchResult>();

    mocks.fetch_mail_by_ids_reconciled.mockReturnValue(network.promise);

    const { states, root } = render_hook();

    await flush();

    expect(states.at(-1)).toEqual({ is_loading: true, subjects: [] });

    await act(async () => {
      network.resolve(fetch_ok(SERVER_ROWS));
      await Promise.resolve();
    });
    await flush();

    expect(states.at(-1)!.subjects).toEqual(["server one", "server two"]);

    act(() => root.unmount());
  });

  it("saves the first page under the same signature after the server answers", async () => {
    const { root } = render_hook();

    await flush();

    expect(mocks.schedule_list_snapshot).toHaveBeenCalledTimes(1);

    const [scope, owner, signature, rows] =
      mocks.schedule_list_snapshot.mock.calls[0];

    expect(scope).toBe("category:primary");
    expect(owner).toBe("a@b.c");
    expect(signature).toBe(mocks.read_list_snapshot.mock.calls[0][2]);
    expect(rows.map((email: { subject: string }) => email.subject)).toEqual([
      "server one",
      "server two",
    ]);

    act(() => root.unmount());
  });

  it("ignores a snapshot that arrives after the server rows", async () => {
    const snapshot = deferred<SnapshotResult | null>();

    mocks.read_list_snapshot.mockReturnValue(snapshot.promise);

    const { states, root } = render_hook();

    await flush();

    expect(states.at(-1)!.subjects).toEqual(["server one", "server two"]);

    await act(async () => {
      snapshot.resolve({ emails: SNAPSHOT_ROWS, saved_at: Date.now() });
      await Promise.resolve();
    });
    await flush();

    expect(states.at(-1)!.subjects).toEqual(["server one", "server two"]);

    act(() => root.unmount());
  });

  it("keeps the saved rows on screen when the server cannot be reached", async () => {
    mocks.fetch_mail_by_ids_reconciled.mockRejectedValue(new Error("offline"));
    mocks.read_list_snapshot.mockResolvedValue({
      emails: SNAPSHOT_ROWS,
      saved_at: Date.now(),
    });

    const { states, root } = render_hook();

    await flush();

    expect(states.at(-1)).toEqual({
      is_loading: false,
      subjects: ["saved one", "saved two"],
    });
    expect(mocks.schedule_list_snapshot).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("does not replace rows already on screen during a manual refresh", async () => {
    const { states, root } = render_hook();

    await flush();
    expect(states.at(-1)!.subjects).toEqual(["server one", "server two"]);

    const network = deferred<FetchResult>();

    mocks.fetch_mail_by_ids_reconciled.mockReturnValue(network.promise);
    mocks.read_list_snapshot.mockResolvedValue({
      emails: SNAPSHOT_ROWS,
      saved_at: Date.now(),
    });

    act(() => {
      window.dispatchEvent(new CustomEvent("astermail:refresh-requested"));
    });
    await flush();
    await flush();

    expect(states.at(-1)).toEqual({
      is_loading: true,
      subjects: ["server one", "server two"],
    });

    await act(async () => {
      network.resolve(fetch_ok(SERVER_ROWS));
      await Promise.resolve();
    });
    await flush();

    expect(states.at(-1)!.is_loading).toBe(false);
    expect(states.some((seen) => seen.subjects.includes("saved one"))).toBe(
      false,
    );

    act(() => root.unmount());
  });
});
