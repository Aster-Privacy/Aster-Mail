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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    post: (...a: unknown[]) => hoisted.post(...a),
    put: (...a: unknown[]) => hoisted.put(...a),
    delete: (...a: unknown[]) => hoisted.del(...a),
    get: vi.fn(),
    get_access_token: () => null,
    refresh_session: async () => {},
    is_authenticated: () => false,
  },
}));

vi.mock("@/services/low_network_state", () => ({
  is_low_network: () => false,
}));

vi.mock("@/hooks/email_list_cache", () => ({
  mark_view_stale: vi.fn(),
}));

vi.mock("@/services/category_index", () => ({
  sync_recent: vi.fn(async () => {}),
}));

vi.mock("@/services/crypto/prekey_service", () => ({
  check_and_replenish_prekeys: vi.fn(),
}));

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: { get_method: () => "direct" },
}));

vi.mock("@/lib/onion_host", () => ({
  is_onion_host: () => false,
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
  LOCKDOWN_CHANGED_EVENT: "astermail:lockdown-changed",
}));

import { MAIL_EVENTS } from "@/hooks/mail_events";

interface MutationFrame {
  type: "mail_mutation";
  action: string;
  item_ids: string[];
  origin_device: string;
}

interface Tab {
  deliver: (frame: MutationFrame) => void;
  archive: (ids: string[]) => Promise<unknown>;
  mark_read: (id: string) => Promise<unknown>;
  disconnect: () => void;
}

const SHARED_DEVICE = "device-shared-by-both-tabs";

async function open_tab(): Promise<Tab> {
  vi.resetModules();

  const { sync_client } = await import("./sync_client");
  const { batch_archive } = await import("./api/archive");
  const { patch_mail_item_metadata } = await import("./api/mail");
  const client = sync_client as unknown as {
    handle_message: (frame: MutationFrame) => void;
  };

  return {
    deliver: (frame) => client.handle_message(frame),
    archive: (ids) => batch_archive({ ids }),
    mark_read: (id) => patch_mail_item_metadata(id, { is_read: true }),
    disconnect: () => sync_client.disconnect(),
  };
}

function frame(action: string, item_ids: string[]): MutationFrame {
  return {
    type: "mail_mutation",
    action,
    item_ids,
    origin_device: SHARED_DEVICE,
  };
}

describe("sync_client skips echoes of this tab's own mail mutations", () => {
  let soft_refreshes = 0;
  let stats_refreshes = 0;
  const on_soft = () => {
    soft_refreshes += 1;
  };
  const on_stats = () => {
    stats_refreshes += 1;
  };
  const tabs: Tab[] = [];

  async function new_tab(): Promise<Tab> {
    const tab = await open_tab();

    tabs.push(tab);

    return tab;
  }

  function refreshes(): { soft: number; stats: number } {
    return { soft: soft_refreshes, stats: stats_refreshes };
  }

  function reset_counts(): void {
    soft_refreshes = 0;
    stats_refreshes = 0;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    reset_counts();
    hoisted.post.mockReset();
    hoisted.put.mockReset();
    hoisted.del.mockReset();
    hoisted.post.mockResolvedValue({
      data: { success: true, archived_count: 1, total_size_bytes: 0 },
    });
    hoisted.put.mockResolvedValue({
      data: { success: true, updated_count: 1 },
    });
    window.addEventListener(MAIL_EVENTS.MAIL_SOFT_REFRESH, on_soft);
    window.addEventListener(MAIL_EVENTS.MAIL_STATS_STALE, on_stats);
  });

  afterEach(() => {
    for (const tab of tabs.splice(0)) tab.disconnect();
    window.removeEventListener(MAIL_EVENTS.MAIL_SOFT_REFRESH, on_soft);
    window.removeEventListener(MAIL_EVENTS.MAIL_STATS_STALE, on_stats);
    vi.useRealTimers();
  });

  it("does not refetch in the tab that archived, but does in another tab on the same device", async () => {
    const tab_a = await new_tab();

    await tab_a.archive(["m1"]);
    tab_a.deliver(frame("archive", ["m1"]));
    await vi.advanceTimersByTimeAsync(1000);

    expect(refreshes()).toEqual({ soft: 0, stats: 0 });

    const tab_b = await new_tab();

    tab_b.deliver(frame("archive", ["m1"]));
    await vi.advanceTimersByTimeAsync(1000);

    expect(refreshes()).toEqual({ soft: 1, stats: 1 });
  });

  it("still refetches for a different action on the same item", async () => {
    const tab = await new_tab();

    await tab.mark_read("m2");
    tab.deliver(frame("star", ["m2"]));
    await vi.advanceTimersByTimeAsync(1000);

    expect(refreshes()).toEqual({ soft: 1, stats: 1 });

    reset_counts();
    tab.deliver(frame("update_metadata", ["m2"]));
    await vi.advanceTimersByTimeAsync(1000);

    expect(refreshes().soft).toBe(0);
  });

  it("swallows only one echo per own change, so a repeat from elsewhere still refetches", async () => {
    const tab = await new_tab();

    await tab.archive(["m3"]);
    tab.deliver(frame("archive", ["m3"]));
    await vi.advanceTimersByTimeAsync(1000);
    expect(refreshes().soft).toBe(0);

    tab.deliver(frame("archive", ["m3"]));
    await vi.advanceTimersByTimeAsync(1000);
    expect(refreshes().soft).toBe(1);
  });

  it("refetches when the event covers items this tab did not touch", async () => {
    const tab = await new_tab();

    await tab.archive(["m4"]);
    tab.deliver(frame("archive", ["m4", "other"]));
    await vi.advanceTimersByTimeAsync(1000);

    expect(refreshes()).toEqual({ soft: 1, stats: 1 });
  });

  it("refetches when the own request failed", async () => {
    hoisted.post.mockResolvedValueOnce({ error: "boom" });

    const tab = await new_tab();

    await tab.archive(["m5"]);
    tab.deliver(frame("archive", ["m5"]));
    await vi.advanceTimersByTimeAsync(1000);

    expect(refreshes().soft).toBe(1);
  });

  it("refetches when the event arrives after the echo window", async () => {
    const tab = await new_tab();

    await tab.archive(["m6"]);
    await vi.advanceTimersByTimeAsync(11_000);
    tab.deliver(frame("archive", ["m6"]));
    await vi.advanceTimersByTimeAsync(1000);

    expect(refreshes().soft).toBe(1);
  });

  it("forgets own changes on disconnect (logout or account switch)", async () => {
    const tab = await new_tab();

    await tab.archive(["m7"]);
    tab.disconnect();
    tab.deliver(frame("archive", ["m7"]));
    await vi.advanceTimersByTimeAsync(1000);

    expect(refreshes().soft).toBe(1);
  });

  it("coalesces own actions into one late reconcile instead of one refetch each", async () => {
    const tab = await new_tab();

    for (let i = 0; i < 5; i += 1) {
      await tab.archive([`burst-${i}`]);
      tab.deliver(frame("archive", [`burst-${i}`]));
      await vi.advanceTimersByTimeAsync(2000);
    }

    expect(refreshes()).toEqual({ soft: 0, stats: 0 });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(refreshes()).toEqual({ soft: 1, stats: 1 });
  });

  it("adds no refetch when the action already refreshed after the server confirmed it", async () => {
    const tab = await new_tab();

    await tab.mark_read("m8");
    window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
    reset_counts();
    tab.deliver(frame("update_metadata", ["m8"]));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(refreshes()).toEqual({ soft: 0, stats: 0 });
  });

  it("drops the late reconcile once any other refresh has run", async () => {
    const tab = await new_tab();

    await tab.archive(["m9"]);
    tab.deliver(frame("archive", ["m9"]));
    await vi.advanceTimersByTimeAsync(1000);
    tab.deliver(frame("star", ["unrelated"]));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(refreshes()).toEqual({ soft: 1, stats: 1 });
  });
});
