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
import type { MailItem } from "@/services/api/mail";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mailbox, cost } = vi.hoisted(() => ({
  mailbox: [] as MailItem[],
  cost: { envelope_ms: 10, envelope_calls: 0 },
}));

function busy(ms: number): void {
  const until = performance.now() + ms;

  while (performance.now() < until) {
    continue;
  }
}

vi.mock("@/services/api/mail", () => ({
  list_encrypted_mail_items: async ({
    cursor,
    limit,
  }: {
    cursor?: string;
    limit: number;
  }) => {
    const start = cursor ? Number(cursor) : 0;
    const end = start + limit;

    return {
      data: {
        items: mailbox.slice(start, end),
        next_cursor: end < mailbox.length ? String(end) : undefined,
      },
    };
  },
  list_mail_items: async () => ({ data: { items: [] } }),
}));
vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: async () => null,
  extract_metadata_from_server: (
    _decrypted: unknown,
    server_fields: Record<string, unknown>,
  ) => ({ ...server_fields }),
}));
vi.mock("@/hooks/use_search/envelope", () => ({
  decrypt_envelope_for_search: async (
    _envelope: string,
    _nonce: string,
    id: string,
  ) => {
    cost.envelope_calls++;
    busy(cost.envelope_ms);

    return {
      subject: `Subject ${id}`,
      body_text: "",
      body_html: `<p>Body of ${id}</p>`,
      from: { name: "Sender", email: "sender@example.com" },
      to: [],
      cc: [],
      bcc: [],
      sent_at: "2026-01-01T00:00:00Z",
    };
  },
  reset_legacy_migration_state: () => {},
}));
vi.mock("@/services/locked_folders", () => ({
  filter_locked_mail_items: (items: MailItem[]) => items,
}));

import { build_generation, empty_index } from "./index_cache";
import { configure_index_pacing, reset_index_pacing } from "./index_pacing";
import { run_index_pipeline } from "./pipeline";

const LONG_TASK_MS = 50;

function make_item(index: number): MailItem {
  return {
    id: `item-${index}`,
    item_type: "received",
    encrypted_envelope: "sealed",
    envelope_nonce: "nonce",
    message_ts: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    is_read: false,
    is_starred: false,
    is_pinned: false,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
  } as MailItem;
}

function fill_mailbox(count: number): void {
  mailbox.length = 0;
  for (let i = 0; i < count; i++) mailbox.push(make_item(i));
  cost.envelope_calls = 0;
}

function build(count: number) {
  return run_index_pipeline({
    user_email: "user@example.com",
    include_body: true,
    my_gen: build_generation,
    max_items: count,
    hot: empty_index("user@example.com", true),
    writer: null,
  });
}

function watch_main_thread() {
  const gaps: number[] = [];
  let last = performance.now();
  let running = true;

  const tick = () => {
    const now = performance.now();

    gaps.push(now - last);
    last = now;
    if (running) setTimeout(tick, 0);
  };

  setTimeout(tick, 0);

  return {
    stop(): number[] {
      running = false;

      return gaps;
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  reset_index_pacing();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    setTimeout(() => callback(performance.now()), 0);

    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  reset_index_pacing();
  vi.unstubAllGlobals();
});

describe("search index build long tasks", () => {
  it("splits a batch of slow decrypts into tasks under 50 ms", async () => {
    fill_mailbox(48);
    configure_index_pacing({ enabled: false });

    const before_watch = watch_main_thread();

    await build(48);

    const before = Math.max(...before_watch.stop());

    fill_mailbox(48);
    configure_index_pacing({ enabled: true });

    const after_watch = watch_main_thread();
    const result = await build(48);
    const after = Math.max(...after_watch.stop());

    console.info(
      `search index longest task: before ${before.toFixed(1)} ms, after ${after.toFixed(1)} ms`,
    );

    expect(result.processed).toBe(48);
    expect(cost.envelope_calls).toBe(48);
    expect(before).toBeGreaterThan(LONG_TASK_MS);
    expect(after).toBeLessThan(LONG_TASK_MS);
  });
});

describe("search index build during interaction", () => {
  it("stops decrypting while the user types or clicks and resumes when they go idle", async () => {
    fill_mailbox(160);
    configure_index_pacing({ quiet_ms: 300, max_wait_ms: 5000 });

    const watch = watch_main_thread();
    const done = build(160);

    while (cost.envelope_calls < 16) await sleep(5);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));

    const at_input = cost.envelope_calls;

    await sleep(150);

    const while_active = cost.envelope_calls - at_input;

    window.dispatchEvent(new Event("pointerdown"));

    const at_click = cost.envelope_calls;

    await sleep(150);

    const while_clicking = cost.envelope_calls - at_click;
    const result = await done;
    const longest = Math.max(...watch.stop());

    expect(while_active).toBeLessThanOrEqual(1);
    expect(while_clicking).toBeLessThanOrEqual(1);
    expect(result.processed).toBe(160);
    expect(cost.envelope_calls).toBe(160);
    expect(longest).toBeLessThan(LONG_TASK_MS);
  });

  it("keeps indexing when input never stops", async () => {
    fill_mailbox(24);
    configure_index_pacing({ quiet_ms: 400, max_wait_ms: 60 });

    const typing = setInterval(
      () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" })),
      20,
    );

    try {
      const result = await build(24);

      expect(result.processed).toBe(24);
    } finally {
      clearInterval(typing);
    }
  });
});
