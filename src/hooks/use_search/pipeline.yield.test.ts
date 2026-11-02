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

import { afterEach, describe, expect, it, vi } from "vitest";

const { mailbox, strip } = vi.hoisted(() => ({
  mailbox: [] as MailItem[],
  strip: { calls: 0, cost_ms: 3 },
}));

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
  ) => ({
    subject: `Subject ${id}`,
    body_text: "",
    body_html: `<p>Body of ${id}</p>`,
    from: { name: "Sender", email: "sender@example.com" },
    to: [],
    cc: [],
    bcc: [],
    sent_at: "2026-01-01T00:00:00Z",
  }),
  reset_legacy_migration_state: () => {},
}));
vi.mock("@/services/locked_folders", () => ({
  filter_locked_mail_items: (items: MailItem[]) => items,
}));
vi.mock("@/lib/html_sanitizer", async (import_original) => {
  const actual = await import_original<typeof import("@/lib/html_sanitizer")>();

  return {
    ...actual,
    strip_html_tags_bounded: (html: string, min_chars: number) => {
      strip.calls++;
      const until = performance.now() + strip.cost_ms;

      while (performance.now() < until) {
        continue;
      }

      return actual.strip_html_tags_bounded(html, min_chars);
    },
  };
});

import {
  build_generation,
  empty_index,
  reset_index_cache,
} from "./index_cache";
import { run_index_pipeline, type PipelineOptions } from "./pipeline";

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
  strip.calls = 0;
}

function set_visibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

function stub_frames(on_frame: (frame: number) => void = () => {}): void {
  let frames = 0;

  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames++;
    on_frame(frames);
    setTimeout(() => callback(performance.now()), 0);

    return frames;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
}

async function build_index(
  count: number,
  overrides: Partial<PipelineOptions> = {},
) {
  const hot = empty_index("user@example.com", true);
  const result = await run_index_pipeline({
    user_email: "user@example.com",
    include_body: true,
    my_gen: build_generation,
    max_items: count,
    hot,
    writer: null,
    ...overrides,
  });

  return { hot, result };
}

afterEach(() => {
  set_visibility("visible");
  vi.unstubAllGlobals();
});

describe("run_index_pipeline main thread use", () => {
  it("yields between messages instead of extracting a whole batch in one task", async () => {
    mailbox.length = 0;
    for (let i = 0; i < 80; i++) mailbox.push(make_item(i));
    strip.calls = 0;

    const per_task: number[] = [];
    let task = 0;
    let ticking = true;
    let counted = 0;

    const tick = () => {
      per_task[task] = strip.calls - counted;
      counted = strip.calls;
      task++;
      if (ticking) setTimeout(tick, 0);
    };

    setTimeout(tick, 0);

    const hot = empty_index("user@example.com", true);
    const result = await run_index_pipeline({
      user_email: "user@example.com",
      include_body: true,
      my_gen: build_generation,
      max_items: 80,
      hot,
      writer: null,
    });

    ticking = false;
    per_task[task] = strip.calls - counted;

    expect(result.processed).toBe(80);
    expect(strip.calls).toBe(80);
    expect(hot.items.map((item) => item.id)).toEqual(
      mailbox.map((item) => item.id),
    );
    expect(hot.decrypted.get("item-0")?.search_body_text).toBe(
      "body of item-0",
    );
    expect(Math.max(...per_task)).toBeLessThanOrEqual(4);
  });

  it("lets a frame paint after every batch of at most 8 messages", async () => {
    fill_mailbox(80);

    const per_frame: number[] = [];
    let counted = 0;

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      per_frame.push(strip.calls - counted);
      counted = strip.calls;
      setTimeout(() => callback(performance.now()), 0);

      return per_frame.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const { hot, result } = await build_index(80);

    expect(result.processed).toBe(80);
    expect(hot.items.map((item) => item.id)).toEqual(
      mailbox.map((item) => item.id),
    );
    expect(per_frame.length).toBeGreaterThanOrEqual(10);
    expect(Math.max(...per_frame)).toBeLessThanOrEqual(8);
  });

  it("finishes when animation frames never fire", async () => {
    fill_mailbox(16);
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const { hot, result } = await build_index(16);

    expect(result.processed).toBe(16);
    expect(hot.items.map((item) => item.id)).toEqual(
      mailbox.map((item) => item.id),
    );
  });

  it("does not wait for frames between batches while the page is hidden", async () => {
    fill_mailbox(40);
    set_visibility("hidden");

    const frame = vi.fn();

    vi.stubGlobal("requestAnimationFrame", frame);

    const { hot, result } = await build_index(40);

    expect(result.processed).toBe(40);
    expect(hot.items.map((item) => item.id)).toEqual(
      mailbox.map((item) => item.id),
    );
    expect(frame).not.toHaveBeenCalled();
  });

  it("does not wait for frames between envelope only batches", async () => {
    fill_mailbox(40);

    const frame = vi.fn();

    vi.stubGlobal("requestAnimationFrame", frame);

    const { hot, result } = await build_index(40, { include_body: false });

    expect(result.processed).toBe(40);
    expect(hot.items.map((item) => item.id)).toEqual(
      mailbox.map((item) => item.id),
    );
    expect(frame).not.toHaveBeenCalled();
  });

  it("stops within one batch when the build is cancelled", async () => {
    fill_mailbox(80);
    stub_frames((frame) => {
      if (frame === 1) reset_index_cache();
    });

    await expect(build_index(80)).rejects.toThrow("search_index_cancelled");
    expect(strip.calls).toBeLessThanOrEqual(8);
  });
});
