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
import { act, createElement, Fragment } from "react";
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

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => auth_state,
}));

vi.mock("@/services/api/mail", () => ({
  get_mail_stats: () => new Promise(() => {}),
}));
vi.mock("@/services/api/contacts", () => ({
  get_contacts_count: () => new Promise(() => {}),
}));
vi.mock("@/services/api/snooze", () => ({
  list_snoozed_emails: () => new Promise(() => {}),
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

import {
  use_mail_stats,
  clear_mail_stats,
  type MailStats,
} from "./use_mail_stats";

const STORAGE_PREFIX = "aster_mail_stats_";

function persisted_stats(unread: number): string {
  const data: MailStats = {
    total_items: unread,
    total_items_collapsed: unread,
    inbox: unread,
    sent: 0,
    drafts: 0,
    scheduled: 0,
    snoozed: 0,
    starred: 0,
    archived: 0,
    spam: 0,
    trash: 0,
    unread,
    contacts: 0,
    storage_used_bytes: 0,
    storage_total_bytes: 1073741824,
  };

  return JSON.stringify({ version: 3, data, timestamp: Date.now() });
}

const probe_results: Record<string, MailStats> = {};

function Probe({ probe_id }: { probe_id: string }) {
  const { stats } = use_mail_stats();

  probe_results[probe_id] = stats;

  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render_probes(): void {
  root!.render(
    createElement(
      Fragment,
      null,
      createElement(Probe, { probe_id: "first", key: "first" }),
      createElement(Probe, { probe_id: "second", key: "second" }),
    ),
  );
}

describe("use_mail_stats account switch", () => {
  beforeEach(() => {
    localStorage.clear();
    clear_mail_stats();
    auth_state.user = { id: "user_a" };
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
  });

  it("keeps every mounted instance live and preserves the new account's persisted stats", async () => {
    localStorage.setItem(STORAGE_PREFIX + "user_a", persisted_stats(5));
    localStorage.setItem(STORAGE_PREFIX + "user_b", persisted_stats(7));

    await act(async () => {
      render_probes();
    });

    expect(probe_results.first.unread).toBe(5);
    expect(probe_results.second.unread).toBe(5);

    auth_state.user = { id: "user_b" };

    await act(async () => {
      render_probes();
    });

    expect(probe_results.first.unread).toBe(7);
    expect(probe_results.second.unread).toBe(7);
    expect(localStorage.getItem(STORAGE_PREFIX + "user_a")).toBeNull();
    expect(localStorage.getItem(STORAGE_PREFIX + "user_b")).not.toBeNull();
  });

  it("handles the account transition exactly once across multiple instances", async () => {
    localStorage.setItem(STORAGE_PREFIX + "user_b", persisted_stats(9));

    await act(async () => {
      render_probes();
    });

    auth_state.user = { id: "user_b" };

    await act(async () => {
      render_probes();
    });

    auth_state.user = { id: "user_b" };

    await act(async () => {
      render_probes();
    });

    expect(probe_results.first.unread).toBe(9);
    expect(probe_results.second.unread).toBe(9);
    expect(localStorage.getItem(STORAGE_PREFIX + "user_b")).not.toBeNull();
  });
});
