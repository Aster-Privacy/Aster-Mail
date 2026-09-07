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

import {
  adjust_stats_unread,
  prefetch_mail_stats,
  clear_mail_stats,
  get_mail_stats_snapshot,
  invalidate_mail_stats,
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

describe("use_mail_stats ghost unread", () => {
  beforeEach(() => {
    clear_mail_stats();
    mock_get_mail_stats.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("never reads the unread count from a pod cache", async () => {
    mock_get_mail_stats.mockResolvedValue(server_stats(0));

    prefetch_mail_stats();
    await flush();
    expect(mock_get_mail_stats).toHaveBeenCalledTimes(1);
    expect(mock_get_mail_stats).toHaveBeenLastCalledWith(true);

    invalidate_mail_stats();
    await flush();
    expect(mock_get_mail_stats).toHaveBeenCalledTimes(2);
    expect(mock_get_mail_stats).toHaveBeenLastCalledWith(true);
  });

  it("does not let a reverted mark-read leave a phantom unread behind", async () => {
    mock_get_mail_stats.mockResolvedValue(server_stats(0));

    prefetch_mail_stats();
    await flush();
    expect(get_mail_stats_snapshot().unread).toBe(0);

    adjust_stats_unread(-1);
    expect(get_mail_stats_snapshot().unread).toBe(0);

    adjust_stats_unread(1);
    expect(get_mail_stats_snapshot().unread).toBe(0);
  });

  it("clears the clamped debt once the server count is adopted", async () => {
    mock_get_mail_stats.mockResolvedValue(server_stats(0));

    prefetch_mail_stats();
    await flush();

    adjust_stats_unread(-1);
    expect(get_mail_stats_snapshot().unread).toBe(0);

    await vi.advanceTimersByTimeAsync(50_000);
    await flush();
    expect(get_mail_stats_snapshot().unread).toBe(0);

    adjust_stats_unread(1);
    expect(get_mail_stats_snapshot().unread).toBe(1);
  });

  it("recovers from a request that never settles instead of freezing a stale count", async () => {
    mock_get_mail_stats.mockResolvedValue(server_stats(1));

    prefetch_mail_stats();
    await flush();
    expect(get_mail_stats_snapshot().unread).toBe(1);

    mock_get_mail_stats.mockReturnValue(new Promise(() => {}));
    invalidate_mail_stats();
    await flush();
    expect(mock_get_mail_stats).toHaveBeenCalledTimes(2);

    invalidate_mail_stats();
    await flush();
    expect(mock_get_mail_stats).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(46_000);
    mock_get_mail_stats.mockResolvedValue(server_stats(0));
    invalidate_mail_stats();
    await flush();
    expect(mock_get_mail_stats).toHaveBeenCalledTimes(3);
    expect(get_mail_stats_snapshot().unread).toBe(0);
  });

  it("ignores a superseded request that settles after the watchdog moved on", async () => {
    mock_get_mail_stats.mockResolvedValue(server_stats(0));

    prefetch_mail_stats();
    await flush();

    let resolve_late: (value: unknown) => void = () => {};

    mock_get_mail_stats.mockReturnValue(
      new Promise((resolve) => {
        resolve_late = resolve;
      }),
    );
    invalidate_mail_stats();
    await flush();

    await vi.advanceTimersByTimeAsync(46_000);
    mock_get_mail_stats.mockResolvedValue(server_stats(0));
    invalidate_mail_stats();
    await flush();
    expect(get_mail_stats_snapshot().unread).toBe(0);

    resolve_late(server_stats(1));
    await flush();
    expect(get_mail_stats_snapshot().unread).toBe(0);
  });
});
