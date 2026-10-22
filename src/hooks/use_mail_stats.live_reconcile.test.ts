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
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterAll,
} from "vitest";

const mock_get_mail_stats = vi.fn();
const mock_get_contacts_count = vi.fn();
const mock_list_snoozed_emails = vi.fn();
let socket_connected = false;

vi.mock("@/services/api/mail", () => ({
  get_mail_stats: (...args: unknown[]) => mock_get_mail_stats(...args),
}));

vi.mock("@/services/api/contacts", () => ({
  get_contacts_count: (...args: unknown[]) => mock_get_contacts_count(...args),
}));

vi.mock("@/services/api/snooze", () => ({
  list_snoozed_emails: (...args: unknown[]) =>
    mock_list_snoozed_emails(...args),
}));

vi.mock("@/services/sync_client", () => ({
  sync_client: { is_connected: () => socket_connected },
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

const HOUR_MS = 60 * 60 * 1000;

function server_stats() {
  return {
    data: {
      total_items: 10,
      inbox: 5,
      sent: 0,
      drafts: 0,
      scheduled: 0,
      starred: 0,
      archived: 0,
      spam: 0,
      trash: 0,
      unread: 1,
      storage_used_bytes: 0,
      storage_total_bytes: 1073741824,
    },
    error: undefined,
  };
}

function request_count(): number {
  return (
    mock_get_mail_stats.mock.calls.length +
    mock_get_contacts_count.mock.calls.length +
    mock_list_snoozed_emails.mock.calls.length
  );
}

describe("background stats reconcile", () => {
  let stats: typeof import("./use_mail_stats");

  beforeAll(async () => {
    vi.useFakeTimers();
    stats = await import("./use_mail_stats");
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    mock_get_mail_stats.mockReset();
    mock_get_contacts_count.mockReset();
    mock_list_snoozed_emails.mockReset();
    mock_get_mail_stats.mockImplementation(() =>
      Promise.resolve(server_stats()),
    );
    mock_get_contacts_count.mockImplementation(() =>
      Promise.resolve({ data: { count: 0 } }),
    );
    mock_list_snoozed_emails.mockImplementation(() =>
      Promise.resolve({ data: [] }),
    );
    socket_connected = false;
    stats.invalidate_mail_stats();
    await vi.advanceTimersByTimeAsync(0);
    mock_get_mail_stats.mockClear();
    mock_get_contacts_count.mockClear();
    mock_list_snoozed_emails.mockClear();
  });

  it("does not poll stats within ten minutes while the sync socket is live", async () => {
    socket_connected = true;

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

    expect(request_count()).toBe(0);
  });

  it("reconciles once by sixteen minutes while the sync socket is live", async () => {
    socket_connected = true;

    await vi.advanceTimersByTimeAsync(16 * 60 * 1000);

    expect(mock_get_mail_stats).toHaveBeenCalledTimes(1);
    expect(request_count()).toBe(3);
  });

  it("keeps polling stats while the sync socket is down", async () => {
    socket_connected = false;

    await vi.advanceTimersByTimeAsync(HOUR_MS);

    expect(mock_get_mail_stats.mock.calls.length).toBeGreaterThanOrEqual(15);
    expect(request_count()).toBe(mock_get_mail_stats.mock.calls.length * 3);
  });

  it("resumes polling once the socket drops", async () => {
    socket_connected = true;
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(mock_get_mail_stats).not.toHaveBeenCalled();

    socket_connected = false;
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mock_get_mail_stats).toHaveBeenCalledTimes(1);
  });
});
