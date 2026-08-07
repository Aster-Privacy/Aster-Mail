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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mock_get_mail_stats = vi.fn();

vi.mock("@/services/api/mail", () => ({
  get_mail_stats: (...args: unknown[]) => mock_get_mail_stats(...args),
}));

vi.mock("@/services/api/contacts", () => ({
  get_contacts_count: () => Promise.resolve({ data: { count: 0 } }),
}));

vi.mock("@/services/api/snooze", () => ({
  list_snoozed_emails: () => Promise.resolve({ data: [] }),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: () => true,
  on_keys_ready: () => () => {},
}));

vi.mock("@/services/low_network_state", () => ({
  is_low_network: () => false,
}));

vi.mock("@/native/widget_bridge", () => ({ sync_widget_data: () => {} }));
vi.mock("@/native/pwa_badge", () => ({ update_pwa_badge: () => {} }));
vi.mock("@/native/tauri_tray", () => ({ update_tray_badge: () => {} }));

import { MAIL_EVENTS } from "./mail_events";
import {
  adjust_stats_unread,
  clear_mail_stats,
  get_mail_stats_snapshot,
  invalidate_mail_stats,
  prefetch_mail_stats,
  prime_mail_stats,
  set_indexed_inbox_unread,
} from "./use_mail_stats";

function server_stats(unread: number) {
  return {
    data: {
      total_items: 100,
      inbox: 50,
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
    },
    error: undefined,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("use_mail_stats indexed unread authority", () => {
  beforeEach(() => {
    clear_mail_stats();
    set_indexed_inbox_unread(null);
    localStorage.clear();
    mock_get_mail_stats.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    set_indexed_inbox_unread(null);
    vi.useRealTimers();
  });

  it("shows zero after mark all as read even when the server still reports unread", async () => {
    mock_get_mail_stats.mockResolvedValue(server_stats(3));

    prefetch_mail_stats();
    await flush();
    expect(get_mail_stats_snapshot().unread).toBe(3);

    window.dispatchEvent(
      new CustomEvent(MAIL_EVENTS.INBOX_UNREAD_INDEXED, {
        detail: { total: 0 },
      }),
    );

    expect(get_mail_stats_snapshot().unread).toBe(0);

    invalidate_mail_stats();
    await vi.advanceTimersByTimeAsync(3_000);
    await flush();

    expect(get_mail_stats_snapshot().unread).toBe(0);
  });

  it("keeps the indexed total when a stale server response arrives later", async () => {
    mock_get_mail_stats.mockResolvedValue(server_stats(2));

    prefetch_mail_stats();
    await flush();

    set_indexed_inbox_unread(0);
    expect(get_mail_stats_snapshot().unread).toBe(0);

    adjust_stats_unread(-1);
    await vi.advanceTimersByTimeAsync(3_000);
    await flush();

    expect(get_mail_stats_snapshot().unread).toBe(0);
  });

  it("tracks the index instead of double counting optimistic deltas", async () => {
    mock_get_mail_stats.mockResolvedValue(server_stats(9));

    prefetch_mail_stats();
    await flush();

    set_indexed_inbox_unread(5);
    expect(get_mail_stats_snapshot().unread).toBe(5);

    adjust_stats_unread(-1);
    expect(get_mail_stats_snapshot().unread).toBe(5);

    set_indexed_inbox_unread(4);
    expect(get_mail_stats_snapshot().unread).toBe(4);

    await vi.advanceTimersByTimeAsync(3_000);
    await flush();

    expect(get_mail_stats_snapshot().unread).toBe(4);
  });

  it("falls back to the server count once the index releases authority", async () => {
    mock_get_mail_stats.mockResolvedValue(server_stats(7));

    prefetch_mail_stats();
    await flush();

    set_indexed_inbox_unread(0);
    expect(get_mail_stats_snapshot().unread).toBe(0);

    set_indexed_inbox_unread(null);
    invalidate_mail_stats();
    await flush();

    expect(get_mail_stats_snapshot().unread).toBe(7);
  });

  it("releases authority when the index reports it is no longer settled", async () => {
    mock_get_mail_stats.mockResolvedValue(server_stats(4));

    prefetch_mail_stats();
    await flush();

    window.dispatchEvent(
      new CustomEvent(MAIL_EVENTS.INBOX_UNREAD_INDEXED, {
        detail: { total: 0 },
      }),
    );

    expect(get_mail_stats_snapshot().unread).toBe(0);

    window.dispatchEvent(
      new CustomEvent(MAIL_EVENTS.INBOX_UNREAD_INDEXED, {
        detail: { total: null },
      }),
    );

    invalidate_mail_stats();
    await flush();

    expect(get_mail_stats_snapshot().unread).toBe(4);
  });

  it("revalidates a persisted cache on cold load instead of trusting it", async () => {
    localStorage.setItem(
      "aster_mail_stats_user_cold",
      JSON.stringify({
        version: 3,
        data: {
          total_items: 100,
          total_items_collapsed: 100,
          inbox: 50,
          sent: 0,
          drafts: 0,
          scheduled: 0,
          snoozed: 0,
          starred: 0,
          archived: 0,
          spam: 0,
          trash: 0,
          unread: 2,
          contacts: 0,
          storage_used_bytes: 0,
          storage_total_bytes: 1073741824,
        },
        timestamp: Date.now(),
      }),
    );

    mock_get_mail_stats.mockResolvedValue(server_stats(0));

    prime_mail_stats("user_cold");
    expect(get_mail_stats_snapshot().unread).toBe(2);

    prefetch_mail_stats();
    await flush();

    expect(mock_get_mail_stats).toHaveBeenCalledTimes(1);
    expect(get_mail_stats_snapshot().unread).toBe(0);
  });
});
