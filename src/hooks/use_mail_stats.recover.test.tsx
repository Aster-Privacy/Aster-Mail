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
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const auth_state = {
  user: { id: "user_a" } as { id: string } | null,
  has_keys: true,
  is_completing_registration: false,
};

const mock_get_mail_stats = vi.fn();

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => auth_state,
}));

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
vi.mock("@/native/widget_bridge", () => ({ sync_widget_data: () => {} }));
vi.mock("@/native/pwa_badge", () => ({ update_pwa_badge: () => {} }));
vi.mock("@/native/tauri_tray", () => ({ update_tray_badge: () => {} }));
vi.mock("@/services/low_network_state", () => ({
  is_low_network: () => false,
}));

import { use_mail_stats, clear_mail_stats } from "./use_mail_stats";

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

let latest_initialized = false;

function Probe() {
  latest_initialized = use_mail_stats().has_initialized;

  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("use_mail_stats recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    clear_mail_stats();
    mock_get_mail_stats.mockReset();
    latest_initialized = false;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    clear_mail_stats();
    localStorage.clear();
    vi.useRealTimers();
  });

  it("loads stats again when the connection returns", async () => {
    mock_get_mail_stats.mockResolvedValue({ data: null, error: "offline" });

    await act(async () => {
      root!.render(createElement(Probe));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(latest_initialized).toBe(false);

    const calls = mock_get_mail_stats.mock.calls.length;

    mock_get_mail_stats.mockResolvedValue(server_stats(2));
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(1_100);
    });

    expect(mock_get_mail_stats.mock.calls.length).toBeGreaterThan(calls);
    expect(latest_initialized).toBe(true);
  });
});
