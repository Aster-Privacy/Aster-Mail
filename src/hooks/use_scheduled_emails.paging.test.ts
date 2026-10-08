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
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

interface ServerItem {
  id: string;
  scheduled_at: string;
  status: string;
}

const server = vi.hoisted(() => ({
  items: [] as ServerItem[],
  ignore_offset: false,
  descending: false,
  fail_call: -1,
  failing_details: new Set<string>(),
  gone_details: new Set<string>(),
  details_in_flight: 0,
  max_details_in_flight: 0,
  on_list: null as null | ((call: number) => void),
  list_calls: [] as { limit: number; offset: number | undefined }[],
}));

vi.mock("@/services/api/scheduled", () => ({
  list_scheduled_emails: vi.fn(async (limit: number, offset?: number) => {
    server.list_calls.push({ limit, offset });
    server.on_list?.(server.list_calls.length);
    if (server.list_calls.length === server.fail_call) {
      return { error: "Request failed" };
    }
    const ordered = [...server.items].sort((a, b) =>
      server.descending
        ? b.scheduled_at.localeCompare(a.scheduled_at)
        : a.scheduled_at.localeCompare(b.scheduled_at),
    );
    const start = server.ignore_offset ? 0 : (offset ?? 0);
    const page = ordered.slice(start, start + limit);

    return {
      data: {
        emails: page.map((item) => ({
          id: item.id,
          scheduled_at: item.scheduled_at,
          status: item.status,
          created_at: item.scheduled_at,
          updated_at: item.scheduled_at,
        })),
        total: ordered.length,
        has_more: start + page.length < ordered.length,
      },
    };
  }),
  get_scheduled_email: vi.fn(async (id: string) => {
    server.details_in_flight++;
    server.max_details_in_flight = Math.max(
      server.max_details_in_flight,
      server.details_in_flight,
    );
    await new Promise((r) => setTimeout(r, 0));
    server.details_in_flight--;
    const item = server.items.find((i) => i.id === id);

    if (server.failing_details.has(id)) {
      return { data: null, error: "Request failed", code: "TIMEOUT_ERROR" };
    }
    if (!item || server.gone_details.has(id))
      return { data: null, error: "not found", code: "NOT_FOUND" };

    return {
      data: {
        ...item,
        created_at: item.scheduled_at,
        updated_at: item.scheduled_at,
        content: {
          to_recipients: ["someone@example.com"],
          cc_recipients: [],
          bcc_recipients: [],
          subject: `Subject ${item.id}`,
          body: "Body",
          scheduled_at: item.scheduled_at,
        },
      },
    };
  }),
  cancel_scheduled_email: vi.fn(async (id: string) => {
    server.items = server.items.filter((i) => i.id !== id);

    return { data: { success: true } };
  }),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ identity_key: "k" }),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: vi.fn(),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    has_keys: true,
    is_loading: false,
    is_authenticated: true,
  }),
}));

vi.mock("@/contexts/preferences_context", () => {
  const preferences = {
    date_format: "iso",
    time_format: "24h",
    relative_dates: true,
  };

  return { use_preferences: () => ({ preferences }) };
});

vi.mock("@/lib/i18n/context", () => {
  const t = (key: string) => key;

  return { use_i18n: () => ({ t }) };
});

import {
  use_scheduled_emails,
  clear_scheduled_cache,
} from "@/hooks/use_scheduled_emails";

type HookResult = ReturnType<typeof use_scheduled_emails>;

function make_items(
  count: number,
  status = "pending",
  prefix = "s",
  first_minute = 0,
): ServerItem[] {
  const base = Date.UTC(2030, 0, 1);

  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${String(i).padStart(3, "0")}`,
    scheduled_at: new Date(base + (first_minute + i) * 60_000).toISOString(),
    status,
  }));
}

function render_hook(): { latest: () => HookResult; root: Root } {
  let current: HookResult | null = null;

  function Harness() {
    current = use_scheduled_emails(true);

    return null;
  }

  const container = document.createElement("div");
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });

  return { latest: () => current!, root };
}

async function flush(rounds = 60): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function ids(result: HookResult): string[] {
  return result.state.emails.map((e) => e.id);
}

describe("use_scheduled_emails paging", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    clear_scheduled_cache();
    server.items = [];
    server.ignore_offset = false;
    server.descending = false;
    server.on_list = null;
    server.list_calls = [];
    server.fail_call = -1;
    server.failing_details = new Set();
    server.gone_details = new Set();
    server.details_in_flight = 0;
    server.max_details_in_flight = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads every pending message beyond the first page and counts them all", async () => {
    server.items = make_items(120);
    const { latest, root } = render_hook();

    await flush();

    expect(latest().state.is_loading).toBe(false);
    expect(latest().state.emails).toHaveLength(120);
    expect(latest().state.total_count).toBe(120);
    expect(latest().state.has_more).toBe(false);
    expect(ids(latest())).toEqual(make_items(120).map((i) => i.id));
    expect(server.list_calls.map((c) => c.offset ?? 0)).toEqual([0, 45, 90]);

    act(() => root.unmount());
  });

  it("sorts by send time across pages whatever order the server pages in", async () => {
    server.items = make_items(75);
    server.descending = true;
    const { latest, root } = render_hook();

    await flush();

    expect(ids(latest())).toEqual(make_items(75).map((i) => i.id));

    act(() => root.unmount());
  });

  it("stops when the server keeps returning the same page", async () => {
    server.items = make_items(120);
    server.ignore_offset = true;
    const { latest, root } = render_hook();

    await flush();

    expect(server.list_calls.length).toBeLessThanOrEqual(2);
    expect(new Set(ids(latest())).size).toBe(latest().state.emails.length);
    expect(latest().state.emails).toHaveLength(50);
    expect(latest().state.total_count).toBe(50);
    expect(latest().state.has_more).toBe(true);

    act(() => root.unmount());
  });

  it("caps the number of pages it requests", async () => {
    server.items = make_items(5000);
    const { latest, root } = render_hook();

    await flush(400);

    expect(server.list_calls.length).toBeLessThanOrEqual(40);
    expect(latest().state.has_more).toBe(true);
    expect(latest().state.total_count).toBe(latest().state.emails.length);
    expect(latest().state.total_count).toBeLessThan(5000);

    act(() => root.unmount());
  });

  it("restarts from the first page when the list changes mid-way", async () => {
    server.items = make_items(120);
    server.on_list = (call) => {
      if (call === 2) {
        server.items = server.items.filter((i) => i.id !== "s010");
      }
    };
    const { latest, root } = render_hook();

    await flush();

    const expected = make_items(120)
      .map((i) => i.id)
      .filter((id) => id !== "s010");

    expect(ids(latest())).toEqual(expected);
    expect(latest().state.total_count).toBe(119);

    act(() => root.unmount());
  });

  it("keeps the other pages intact after cancelling a message", async () => {
    server.items = make_items(120);
    const { latest, root } = render_hook();

    await flush();

    await act(async () => {
      await latest().cancel_email("s060");
    });
    await flush();

    const expected = make_items(120)
      .map((i) => i.id)
      .filter((id) => id !== "s060");

    expect(ids(latest())).toEqual(expected);
    expect(latest().state.total_count).toBe(119);

    act(() => root.unmount());
  });

  it("does not count cancelled or sent rows the server still lists", async () => {
    server.items = [
      ...make_items(60),
      ...make_items(3, "cancelled").map((i) => ({ ...i, id: `c${i.id}` })),
    ];
    const { latest, root } = render_hook();

    await flush();

    expect(latest().state.emails).toHaveLength(60);
    expect(latest().state.total_count).toBe(60);

    act(() => root.unmount());
  });

  it("finds pending messages behind a long sent history and counts only them", async () => {
    server.items = [
      ...make_items(1000, "sent", "x"),
      ...make_items(5, "pending", "p", 5000),
    ];
    const { latest, root } = render_hook();

    await flush(400);

    expect(ids(latest())).toEqual(
      make_items(5, "pending", "p", 5000).map((i) => i.id),
    );
    expect(latest().state.total_count).toBe(5);
    expect(latest().state.has_more).toBe(false);

    act(() => root.unmount());
  });

  it("keeps sending and failed messages, like the mobile app", async () => {
    server.items = [
      ...make_items(2, "sending", "a"),
      ...make_items(2, "failed", "b", 10),
      ...make_items(2, "sent", "c", 20),
    ];
    const { latest, root } = render_hook();

    await flush();

    expect(ids(latest()).sort()).toEqual(["a000", "a001", "b000", "b001"]);
    expect(latest().state.total_count).toBe(4);

    act(() => root.unmount());
  });

  it("does not skip rows when messages go out on every page request", async () => {
    server.items = make_items(200);
    server.on_list = () => {
      server.items = server.items.slice(1);
    };
    const { latest, root } = render_hook();

    await flush(400);

    const got = new Set(ids(latest()));
    const missing = server.items.filter((i) => !got.has(i.id));

    expect(missing).toEqual([]);
    expect(latest().state.has_more).toBe(true);

    act(() => root.unmount());
  });

  it("keeps the rows already loaded when a later page fails", async () => {
    server.items = make_items(120);
    server.fail_call = 2;
    const { latest, root } = render_hook();

    await flush();

    expect(ids(latest())).toEqual(make_items(50).map((i) => i.id));
    expect(latest().state.has_more).toBe(true);
    expect(latest().state.error).toBe("common.failed_to_load_scheduled_emails");

    act(() => root.unmount());
  });

  it("keeps the complete list when a later page fails on refresh", async () => {
    server.items = make_items(120);
    const { latest, root } = render_hook();

    await flush();
    server.fail_call = server.list_calls.length + 2;
    act(() => latest().refresh());
    await flush();

    expect(latest().state.emails).toHaveLength(120);
    expect(latest().state.error).toBe("common.failed_to_load_scheduled_emails");

    act(() => root.unmount());
  });

  it("does not mix pages from a refresh that started mid-way", async () => {
    server.items = make_items(150);
    let refresh_now: (() => void) | null = null;
    const { latest, root } = render_hook();

    server.on_list = (call) => {
      if (call === 2) {
        server.items = make_items(30, "pending", "n");
        refresh_now = () => latest().refresh();
      }
    };
    await flush(5);
    if (refresh_now) act(() => refresh_now!());
    await flush();

    expect(ids(latest())).toEqual(
      make_items(30, "pending", "n").map((i) => i.id),
    );

    act(() => root.unmount());
  });

  it("fetches details one page at a time", async () => {
    server.items = make_items(300);
    const { latest, root } = render_hook();

    await flush(200);

    expect(latest().state.emails).toHaveLength(300);
    expect(server.max_details_in_flight).toBeLessThanOrEqual(50);

    act(() => root.unmount());
  });

  it("keeps a loaded message when its detail fails on refresh", async () => {
    server.items = make_items(3);
    const { latest, root } = render_hook();

    await flush();
    expect(ids(latest())).toEqual(["s000", "s001", "s002"]);
    expect(latest().state.error).toBeNull();

    server.failing_details = new Set(["s001"]);
    act(() => latest().refresh());
    await flush();

    expect(ids(latest())).toEqual(["s000", "s001", "s002"]);
    expect(latest().state.total_count).toBe(3);
    expect(latest().state.error).toBe("common.failed_to_load_scheduled_emails");

    act(() => root.unmount());
  });

  it("marks a first load as incomplete when a detail fails", async () => {
    server.items = make_items(3);
    server.failing_details = new Set(["s002"]);
    const { latest, root } = render_hook();

    await flush();

    expect(ids(latest())).toEqual(["s000", "s001"]);
    expect(latest().state.has_more).toBe(true);
    expect(latest().state.error).toBe("common.failed_to_load_scheduled_emails");

    act(() => root.unmount());
  });

  it("drops a message whose detail is gone from the server", async () => {
    server.items = make_items(3);
    const { latest, root } = render_hook();

    await flush();
    server.gone_details = new Set(["s001"]);
    act(() => latest().refresh());
    await flush();

    expect(ids(latest())).toEqual(["s000", "s002"]);
    expect(latest().state.error).toBeNull();
    expect(latest().state.has_more).toBe(false);

    act(() => root.unmount());
  });
});
