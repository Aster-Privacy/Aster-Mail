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
  on_list: null as null | ((call: number) => void),
  list_calls: [] as { limit: number; offset: number | undefined }[],
}));

vi.mock("@/services/api/scheduled", () => ({
  list_scheduled_emails: vi.fn(async (limit: number, offset?: number) => {
    server.list_calls.push({ limit, offset });
    server.on_list?.(server.list_calls.length);
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
    const item = server.items.find((i) => i.id === id);

    if (!item) return { error: "not found" };

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

function make_items(count: number, status = "pending"): ServerItem[] {
  const base = Date.UTC(2030, 0, 1);

  return Array.from({ length: count }, (_, i) => ({
    id: `s${String(i).padStart(3, "0")}`,
    scheduled_at: new Date(base + i * 60_000).toISOString(),
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

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
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
    expect(server.list_calls.map((c) => c.offset ?? 0)).toEqual([0, 50, 100]);

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
    expect(latest().state.total_count).toBe(120);

    act(() => root.unmount());
  });

  it("caps the number of pages it requests", async () => {
    server.items = make_items(5000);
    const { latest, root } = render_hook();

    await flush();

    expect(server.list_calls.length).toBeLessThanOrEqual(20);
    expect(latest().state.has_more).toBe(true);
    expect(latest().state.total_count).toBe(5000);

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
});
