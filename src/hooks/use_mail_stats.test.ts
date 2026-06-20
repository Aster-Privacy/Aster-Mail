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
import { beforeEach, describe, expect, it, vi } from "vitest";

const { update_pwa_badge, get_contacts_count, list_snoozed_emails } =
  vi.hoisted(() => ({
    update_pwa_badge: vi.fn(),
    get_contacts_count: vi.fn(async () => ({ data: { count: 3 }, error: null })),
    list_snoozed_emails: vi.fn(async () => ({ data: [], error: null })),
  }));

vi.mock("@/services/api/mail", () => ({
  get_mail_stats: vi.fn(),
}));
vi.mock("@/services/api/contacts", () => ({ get_contacts_count }));
vi.mock("@/services/api/snooze", () => ({ list_snoozed_emails }));
vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: vi.fn(() => true),
  on_keys_ready: vi.fn(() => () => {}),
}));
vi.mock("@/native/widget_bridge", () => ({ sync_widget_data: vi.fn() }));
vi.mock("@/native/pwa_badge", () => ({ update_pwa_badge }));
vi.mock("@/native/tauri_tray", () => ({ update_tray_badge: vi.fn() }));
vi.mock("@/services/low_network_state", () => ({ is_low_network: () => false }));

import { get_mail_stats } from "@/services/api/mail";
import {
  clear_mail_stats,
  invalidate_mail_stats,
  prefetch_mail_stats,
  should_reconcile_on_item_update,
} from "./use_mail_stats";

function make_server_stats(unread: number) {
  return {
    total_items: 100,
    inbox: unread,
    sent: 0,
    drafts: 0,
    scheduled: 0,
    starred: 0,
    archived: 0,
    spam: 0,
    trash: 0,
    unread,
    storage_used_bytes: 0,
    storage_total_bytes: 1073741824,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("mail stats reliability", () => {
  beforeEach(() => {
    clear_mail_stats();
    update_pwa_badge.mockClear();
    vi.mocked(get_mail_stats).mockReset();
    get_contacts_count.mockReset();
    get_contacts_count.mockResolvedValue({ data: { count: 3 }, error: null });
    list_snoozed_emails.mockReset();
    list_snoozed_emails.mockResolvedValue({ data: [], error: null });
  });

  it("reconciles against a fetch that started after the mutation", async () => {
    const first = deferred<{ data: ReturnType<typeof make_server_stats> }>();
    const second = deferred<{ data: ReturnType<typeof make_server_stats> }>();

    vi.mocked(get_mail_stats)
      .mockReturnValueOnce(first.promise as never)
      .mockReturnValueOnce(second.promise as never);

    prefetch_mail_stats();
    await flush();

    invalidate_mail_stats();
    await flush();

    first.resolve({ data: make_server_stats(5) });
    await flush();
    await flush();

    second.resolve({ data: make_server_stats(4) });
    await flush();
    await flush();

    expect(vi.mocked(get_mail_stats)).toHaveBeenCalledTimes(2);
    const last = update_pwa_badge.mock.calls.at(-1);

    expect(last?.[0]).toBe(4);
  });

  it("does not extend cache freshness on optimistic local adjustments", async () => {
    const initial = deferred<{ data: ReturnType<typeof make_server_stats> }>();

    vi.mocked(get_mail_stats).mockReturnValueOnce(initial.promise as never);

    prefetch_mail_stats();
    await flush();
    initial.resolve({ data: make_server_stats(5) });
    await flush();
    await flush();

    const { adjust_stats_unread } = await import("./use_mail_stats");

    adjust_stats_unread(-1);
    await flush();

    expect(update_pwa_badge.mock.calls.at(-1)?.[0]).toBe(4);

    const second = deferred<{ data: ReturnType<typeof make_server_stats> }>();

    vi.mocked(get_mail_stats).mockReturnValueOnce(second.promise as never);

    invalidate_mail_stats();
    await flush();
    second.resolve({ data: make_server_stats(7) });
    await flush();
    await flush();

    expect(update_pwa_badge.mock.calls.at(-1)?.[0]).toBe(7);
  });

  it("keeps an optimistic mark-read applied during an in-flight reconcile", async () => {
    const initial = deferred<{ data: ReturnType<typeof make_server_stats> }>();

    vi.mocked(get_mail_stats).mockReturnValueOnce(initial.promise as never);

    prefetch_mail_stats();
    await flush();
    initial.resolve({ data: make_server_stats(5) });
    await flush();
    await flush();

    expect(update_pwa_badge.mock.calls.at(-1)?.[0]).toBe(5);

    const stale = deferred<{ data: ReturnType<typeof make_server_stats> }>();

    vi.mocked(get_mail_stats).mockReturnValueOnce(stale.promise as never);

    invalidate_mail_stats();
    await flush();

    const { adjust_stats_unread } = await import("./use_mail_stats");

    adjust_stats_unread(-1);
    await flush();

    expect(update_pwa_badge.mock.calls.at(-1)?.[0]).toBe(4);

    stale.resolve({ data: make_server_stats(5) });
    await flush();
    await flush();

    expect(update_pwa_badge.mock.calls.at(-1)?.[0]).toBe(4);
  });

  it("still reconciles unread when contacts/snoozed sub-requests reject", async () => {
    get_contacts_count.mockRejectedValue(new Error("network"));
    list_snoozed_emails.mockRejectedValue(new Error("network"));

    const first = deferred<{ data: ReturnType<typeof make_server_stats> }>();

    vi.mocked(get_mail_stats).mockReturnValueOnce(first.promise as never);

    prefetch_mail_stats();
    await flush();
    first.resolve({ data: make_server_stats(6) });
    await flush();
    await flush();

    expect(update_pwa_badge.mock.calls.at(-1)?.[0]).toBe(6);
  });
});

describe("should_reconcile_on_item_update", () => {
  it("reconciles when a read-state change is committed", () => {
    expect(should_reconcile_on_item_update({ id: "1", is_read: true })).toBe(
      true,
    );
  });

  it("reconciles on archive, trash, spam and star changes", () => {
    expect(should_reconcile_on_item_update({ id: "1", is_archived: true })).toBe(
      true,
    );
    expect(should_reconcile_on_item_update({ id: "1", is_trashed: true })).toBe(
      true,
    );
    expect(should_reconcile_on_item_update({ id: "1", is_spam: true })).toBe(
      true,
    );
    expect(should_reconcile_on_item_update({ id: "1", is_starred: true })).toBe(
      true,
    );
  });

  it("ignores updates that do not affect any count", () => {
    expect(should_reconcile_on_item_update({ id: "1", is_pinned: true })).toBe(
      false,
    );
    expect(
      should_reconcile_on_item_update({ id: "1", tags: [] }),
    ).toBe(false);
    expect(should_reconcile_on_item_update(null)).toBe(false);
    expect(should_reconcile_on_item_update(undefined)).toBe(false);
  });
});
