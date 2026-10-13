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
  clear_mail_stats,
  get_mail_stats_snapshot,
  invalidate_mail_stats,
  prefetch_mail_stats,
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

describe("use_mail_stats unread drift report", () => {
  const drift_events: number[] = [];
  const on_drift = (event: Event) => {
    drift_events.push(
      (event as CustomEvent<{ server_unread: number }>).detail.server_unread,
    );
  };

  beforeEach(() => {
    clear_mail_stats();
    set_indexed_inbox_unread(null);
    localStorage.clear();
    mock_get_mail_stats.mockReset();
    drift_events.length = 0;
    window.addEventListener(MAIL_EVENTS.INBOX_UNREAD_DRIFT, on_drift);
  });

  afterEach(() => {
    window.removeEventListener(MAIL_EVENTS.INBOX_UNREAD_DRIFT, on_drift);
    set_indexed_inbox_unread(null);
  });

  it("reports the server count when it disagrees with the indexed total", async () => {
    mock_get_mail_stats.mockResolvedValue(server_stats(0));
    set_indexed_inbox_unread(19);

    prefetch_mail_stats();
    await flush();

    expect(get_mail_stats_snapshot().unread).toBe(19);
    expect(drift_events).toEqual([0]);
  });

  it("stays quiet when the server agrees with the indexed total", async () => {
    mock_get_mail_stats.mockResolvedValue(server_stats(4));
    set_indexed_inbox_unread(4);

    prefetch_mail_stats();
    await flush();

    expect(get_mail_stats_snapshot().unread).toBe(4);
    expect(drift_events).toEqual([]);
  });

  it("stays quiet while the index is not authoritative", async () => {
    mock_get_mail_stats.mockResolvedValue(server_stats(7));

    prefetch_mail_stats();
    await flush();

    expect(get_mail_stats_snapshot().unread).toBe(7);
    expect(drift_events).toEqual([]);
  });

  it("reports again on a later fetch while the drift remains", async () => {
    mock_get_mail_stats.mockResolvedValue(server_stats(2));
    set_indexed_inbox_unread(5);

    prefetch_mail_stats();
    await flush();
    invalidate_mail_stats();
    await flush();

    expect(drift_events).toEqual([2, 2]);
  });
});
