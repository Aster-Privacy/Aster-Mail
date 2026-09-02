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
import type { PreloadedEmail } from "./preload_cache";

import { describe, it, expect, beforeEach } from "vitest";

import {
  await_preloaded_email,
  clear_preload_cache,
  get_preload_cache,
} from "./preload_cache";

import { MAIL_EVENTS } from "@/hooks/mail_events";

function seed_entry(
  overrides: Partial<{ time: number; is_stale: boolean }> = {},
): void {
  const entry = {
    mail_item: {
      id: "email_1",
      thread_token: "thread_1",
      is_starred: false,
      metadata: { is_pinned: false },
    },
    email: { id: "email_1", is_read: false, is_starred: false },
    thread_messages: [{ id: "email_1", is_read: false, is_starred: false }],
    thread_draft: null,
    current_user_email: "me@astermail.org",
    current_user_name: "Me",
    thread_sanitized: new Map(),
    thread_cid_resolved: new Map(),
    time: Date.now(),
    is_stale: false,
    conversation_grouping: true,
    ...overrides,
  } as unknown as PreloadedEmail;

  get_preload_cache().set("email_1", entry);
}

function emit_update(detail: Record<string, unknown>): void {
  window.dispatchEvent(
    new CustomEvent(MAIL_EVENTS.MAIL_ITEM_UPDATED, {
      detail: { id: "email_1", ...detail },
    }),
  );
}

describe("preload cache flag updates", () => {
  beforeEach(() => {
    clear_preload_cache();
  });

  it("applies a star change to the cached email, item, and thread", () => {
    seed_entry();

    emit_update({ is_starred: true });

    const cached = get_preload_cache().get("email_1")!;

    expect(cached.email.is_starred).toBe(true);
    expect(cached.mail_item.is_starred).toBe(true);
    expect(cached.thread_messages[0].is_starred).toBe(true);
  });

  it("applies a pin change to the cached item metadata", () => {
    seed_entry();

    emit_update({ is_pinned: true });

    const cached = get_preload_cache().get("email_1")!;

    expect(cached.mail_item.is_pinned).toBe(true);
    expect(cached.mail_item.metadata?.is_pinned).toBe(true);
  });

  it("marks the entry stale for a change it cannot represent", () => {
    seed_entry();

    emit_update({ is_archived: true });

    expect(get_preload_cache().get("email_1")?.is_stale).toBe(true);
  });

  it("does not serve a stale entry when fresh_only is requested", async () => {
    seed_entry({ is_stale: true });

    expect(
      await await_preloaded_email("email_1", true, { fresh_only: true }),
    ).toBeNull();
    expect(await await_preloaded_email("email_1", true)).not.toBeNull();
  });

  it("does not serve an old entry when fresh_only is requested", async () => {
    seed_entry({ time: Date.now() - 31_000 });

    expect(
      await await_preloaded_email("email_1", true, { fresh_only: true }),
    ).toBeNull();
    expect(
      await await_preloaded_email("email_1", true, {
        fresh_only: true,
        max_age_ms: 60_000,
      }),
    ).not.toBeNull();
  });
});
