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
import type { PreloadedEmail } from "@/components/email/hooks/preload_cache_store";
import type { EmailListState, InboxEmail } from "@/types/email";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  is_offline_load_failure,
  offline_cached_copy,
  pending_replies_for_failed_open,
  thread_token_for_email,
} from "./offline_reopen";

import {
  clear_preload_cache,
  get_preload_account_epoch,
  get_preload_cache,
} from "@/components/email/hooks/preload_cache_store";
import { view_cache } from "@/hooks/email_list_cache";
import {
  add_pending_reply_message,
  reset_pending_reply_messages,
  settle_pending_reply_message,
} from "@/hooks/pending_reply_messages";

function seed_cached(overrides: Record<string, unknown> = {}): void {
  get_preload_cache().set("email_1", {
    mail_item: { id: "email_1", thread_token: "thread_1" },
    email: {
      id: "email_1",
      body: "<p>saved</p>",
      html_content: "<p>saved</p>",
    },
    thread_messages: [],
    thread_cid_resolved: new Map(),
    time: Date.now() - 10 * 60_000,
    is_stale: true,
    conversation_grouping: true,
    vault_account_epoch: get_preload_account_epoch(),
    ...overrides,
  } as unknown as PreloadedEmail);
}

function seed_list(emails: Partial<InboxEmail>[]): void {
  view_cache.set("inbox", {
    state: { emails: emails as InboxEmail[] } as EmailListState,
    time: Date.now(),
    is_stale: false,
    conversation_grouping: true,
  });
}

function add_reply(
  optimistic_id: string,
  thread_token: string,
  original_email_id?: string,
): void {
  add_pending_reply_message({
    optimistic_id,
    thread_token,
    original_email_id,
    sender_name: "Me",
    sender_email: "me@astermail.org",
    subject: "Re: hi",
    body: "<p>my reply</p>",
    to_recipients: [{ name: "You", email: "you@astermail.org" }],
  });
}

describe("offline thread reopen", () => {
  beforeEach(() => {
    clear_preload_cache();
    view_cache.clear();
    reset_pending_reply_messages();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("treats a network failure as offline", () => {
    expect(is_offline_load_failure({ code: "NETWORK_ERROR" })).toBe(true);
  });

  it("treats any failure as offline while the browser is offline", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    expect(is_offline_load_failure({ code: "SERVER_ERROR" })).toBe(true);
  });

  it("does not treat a server error as offline while online", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);

    expect(is_offline_load_failure({ code: "SERVER_ERROR" })).toBe(false);
    expect(is_offline_load_failure({ code: "NOT_FOUND" })).toBe(false);
  });

  it("serves a stale cached copy for an offline reopen", () => {
    seed_cached();

    expect(offline_cached_copy("email_1", true)?.email.id).toBe("email_1");
  });

  it("skips a cached copy from the other grouping mode", () => {
    seed_cached();

    expect(offline_cached_copy("email_1", false)).toBeNull();
  });

  it("skips a cached copy without a readable body", () => {
    seed_cached({ email: { id: "email_1", body: "", html_content: "" } });

    expect(offline_cached_copy("email_1", true)).toBeNull();
  });

  it("has no cached copy for an email that was never opened", () => {
    expect(offline_cached_copy("email_2", true)).toBeNull();
  });

  it("finds the thread of an email from the cached list", () => {
    seed_list([{ id: "email_2", thread_token: "thread_2" }]);

    expect(thread_token_for_email("email_2")).toBe("thread_2");
    expect(thread_token_for_email("email_3")).toBeUndefined();
  });

  it("shows a pending reply to the opened email when the load fails", () => {
    add_reply("p_reply", "thread_1", "email_1");

    const replies = pending_replies_for_failed_open("email_1", undefined);

    expect(replies.map((message) => message.id)).toEqual(["p_reply"]);
  });

  it("shows a pending reply in the same thread through the cached list", () => {
    seed_list([{ id: "email_2", thread_token: "thread_1" }]);
    add_reply("p_reply", "thread_1", "email_1");

    const replies = pending_replies_for_failed_open("email_2", undefined);

    expect(replies.map((message) => message.id)).toEqual(["p_reply"]);
  });

  it("does not show a reply from another thread", () => {
    add_reply("p_reply", "thread_9", "email_9");

    expect(pending_replies_for_failed_open("email_1", "thread_1")).toEqual([]);
  });

  it("does not show a reply that already went out", () => {
    add_reply("p_reply", "thread_1", "email_1");
    settle_pending_reply_message("p_reply");

    expect(pending_replies_for_failed_open("email_1", "thread_1")).toEqual([]);
  });
});
