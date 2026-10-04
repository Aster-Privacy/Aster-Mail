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
}

interface SnapshotResult {
  emails: unknown[];
  saved_at: number;
}

const mocks = vi.hoisted(() => ({
  fetch_mail_from_api: vi.fn(),
  read_list_snapshot: vi.fn(),
  schedule_list_snapshot: vi.fn(),
  removed_ids: new Set<string>(),
}));

vi.mock("@/services/list_snapshot_store", () => ({
  read_list_snapshot: mocks.read_list_snapshot,
  schedule_list_snapshot: mocks.schedule_list_snapshot,
}));

vi.mock("@/hooks/email_list_helpers", () => ({
  fetch_mail_from_api: mocks.fetch_mail_from_api,
  insert_emails_at: (emails: unknown[]) => emails,
  DEFAULT_PAGE_SIZE: 50,
}));

vi.mock("@/hooks/email_list_helpers/silent_refresh", () => ({
  merge_silent_refresh_emails: (_prev: unknown[], next: unknown[]) => next,
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
  drop_removed_after: (rows: { id: string }[]) =>
    rows.filter((row) => !mocks.removed_ids.has(row.id)),
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
    user: { id: "u1", email: "a@b.c" },
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

interface SeenState {
  is_loading: boolean;
  subjects: string[];
}

function row(id: string, subject: string) {
  return { id, subject, item_type: "received", is_read: true };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function fetch_ok(emails: unknown[]): FetchResult {
  return { emails, total: emails.length, has_more: false };
}

function render_hook(view: string): { states: SeenState[]; root: Root } {
  const states: SeenState[] = [];

  function Harness() {
    const r = use_email_list(view);

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

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await flush();
  await act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });
  await flush();
}

const SNAPSHOT_ROWS = [row("id1", "saved one"), row("id2", "saved two")];
const SERVER_ROWS = [row("id1", "server one"), row("id2", "server two")];

describe("use_email_list snapshot first paint", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.fetch_mail_from_api.mockReset();
    mocks.read_list_snapshot.mockReset();
    mocks.schedule_list_snapshot.mockReset();
    mocks.removed_ids.clear();
    mocks.read_list_snapshot.mockResolvedValue(null);
    mocks.fetch_mail_from_api.mockResolvedValue(fetch_ok(SERVER_ROWS));
  });

  it("paints the saved rows before the server answers, then revalidates", async () => {
    const network = deferred<FetchResult>();

    mocks.fetch_mail_from_api.mockReturnValue(network.promise);
    mocks.read_list_snapshot.mockResolvedValue({
      emails: SNAPSHOT_ROWS,
      saved_at: Date.now(),
    } satisfies SnapshotResult);

    const { states, root } = render_hook("starred");

    await flush();

    expect(states.at(-1)!.subjects).toEqual(["saved one", "saved two"]);
    expect(mocks.fetch_mail_from_api).toHaveBeenCalledTimes(1);

    await act(async () => {
      network.resolve(fetch_ok(SERVER_ROWS));
      await Promise.resolve();
    });
    await settle();

    expect(states.at(-1)).toEqual({
      is_loading: false,
      subjects: ["server one", "server two"],
    });
    expect(mocks.fetch_mail_from_api).toHaveBeenCalledTimes(1);
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

  it("reads and saves under the view, owner, and list settings", async () => {
    const { root } = render_hook("starred");

    await settle();

    expect(mocks.read_list_snapshot).toHaveBeenCalledTimes(1);
    expect(mocks.read_list_snapshot.mock.calls[0].slice(0, 3)).toEqual([
      "view:starred",
      "a@b.c",
      "g1|newest_first",
    ]);

    const last_save = mocks.schedule_list_snapshot.mock.calls.at(-1)!;

    expect(last_save.slice(0, 3)).toEqual([
      "view:starred",
      "a@b.c",
      "g1|newest_first",
    ]);
    expect(
      last_save[3].map((email: { subject: string }) => email.subject),
    ).toEqual(["server one", "server two"]);

    act(() => root.unmount());
  });

  it("keeps the loading state when there is no snapshot", async () => {
    const network = deferred<FetchResult>();

    mocks.fetch_mail_from_api.mockReturnValue(network.promise);

    const { states, root } = render_hook("starred");

    await flush();

    expect(states.at(-1)).toEqual({ is_loading: true, subjects: [] });
    expect(mocks.schedule_list_snapshot).not.toHaveBeenCalled();

    await act(async () => {
      network.resolve(fetch_ok(SERVER_ROWS));
      await Promise.resolve();
    });
    await settle();

    expect(states.at(-1)!.subjects).toEqual(["server one", "server two"]);

    act(() => root.unmount());
  });

  it("ignores a snapshot that arrives after the server rows", async () => {
    const snapshot = deferred<SnapshotResult | null>();

    mocks.read_list_snapshot.mockReturnValue(snapshot.promise);

    const { states, root } = render_hook("starred");

    await settle();

    expect(states.at(-1)!.subjects).toEqual(["server one", "server two"]);

    await act(async () => {
      snapshot.resolve({ emails: SNAPSHOT_ROWS, saved_at: Date.now() });
      await Promise.resolve();
    });
    await flush();

    expect(states.some((seen) => seen.subjects.includes("saved one"))).toBe(
      false,
    );

    act(() => root.unmount());
  });

  it("leaves out saved rows that were removed since the save", async () => {
    const network = deferred<FetchResult>();

    mocks.fetch_mail_from_api.mockReturnValue(network.promise);
    mocks.removed_ids.add("id1");
    mocks.read_list_snapshot.mockResolvedValue({
      emails: SNAPSHOT_ROWS,
      saved_at: Date.now(),
    });

    const { states, root } = render_hook("starred");

    await flush();

    expect(states.at(-1)!.subjects).toEqual(["saved two"]);

    act(() => root.unmount());
  });

  it("keeps the saved rows on screen when the server cannot be reached", async () => {
    mocks.fetch_mail_from_api.mockRejectedValue(new Error("offline"));
    mocks.read_list_snapshot.mockResolvedValue({
      emails: SNAPSHOT_ROWS,
      saved_at: Date.now(),
    });

    const { states, root } = render_hook("starred");

    await settle();

    expect(states.at(-1)!.subjects).toEqual(["saved one", "saved two"]);

    act(() => root.unmount());
  });

  it("does not use snapshots for views outside the plain list views", async () => {
    const { root } = render_hook("trash");

    await settle();

    expect(mocks.read_list_snapshot).not.toHaveBeenCalled();
    expect(mocks.schedule_list_snapshot).not.toHaveBeenCalled();

    act(() => root.unmount());
  });
});
