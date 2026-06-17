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

describe("use_mail_stats optimistic reconcile", () => {
  beforeEach(() => {
    clear_mail_stats();
    mock_get_mail_stats.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconciles an optimistic adjustment back to the authoritative server count", async () => {
    mock_get_mail_stats.mockResolvedValue(server_stats(5));

    prefetch_mail_stats();
    await flush();
    expect(mock_get_mail_stats).toHaveBeenCalledTimes(1);

    // The user reads a message: optimistic -1 only, but the server (which
    // counts unread by thread) still reports 5. The badge must converge to 5,
    // not stick at the optimistic 4.
    mock_get_mail_stats.mockResolvedValue(server_stats(5));
    adjust_stats_unread(-1);

    await vi.advanceTimersByTimeAsync(2_000);
    await flush();

    expect(mock_get_mail_stats).toHaveBeenCalledTimes(2);
  });

  it("coalesces a burst of optimistic edits into a single reconcile fetch", async () => {
    mock_get_mail_stats.mockResolvedValue(server_stats(10));

    prefetch_mail_stats();
    await flush();
    expect(mock_get_mail_stats).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 8; i++) {
      adjust_stats_unread(-1);
      await vi.advanceTimersByTimeAsync(200);
    }

    // Mid-burst the debounce keeps resetting: no reconcile fetch yet.
    expect(mock_get_mail_stats).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    await flush();

    // Exactly one reconcile after the burst settles.
    expect(mock_get_mail_stats).toHaveBeenCalledTimes(2);
  });
});
