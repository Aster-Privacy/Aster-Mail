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

import { get_preload_cache, clear_preload_cache } from "./preload_cache";

import { MAIL_EVENTS } from "@/hooks/mail_events";

function seed_entry(thread_token: string): void {
  const entry = {
    mail_item: { id: "email_1", thread_token },
    email: {},
    thread_messages: [],
    thread_draft: null,
    current_user_email: "me@astermail.org",
    current_user_name: "Me",
    thread_sanitized: new Map(),
    thread_cid_resolved: new Map(),
    time: Date.now(),
    is_stale: false,
    conversation_grouping: true,
  } as unknown as PreloadedEmail;

  get_preload_cache().set("email_1", entry);
}

describe("preload cache thread drafts", () => {
  beforeEach(() => {
    clear_preload_cache();
  });

  it("adopts a saved thread draft so a revisit shows it", () => {
    seed_entry("thread_1");

    const draft = {
      id: "draft_1",
      draft_type: "reply",
      version: 2,
      thread_token: "thread_1",
      created_at: "now",
      updated_at: "now",
      expires_at: "later",
      content: {
        to_recipients: [],
        cc_recipients: [],
        bcc_recipients: [],
        subject: "Re: hello",
        message: "typed reply",
      },
    };

    window.dispatchEvent(
      new CustomEvent(MAIL_EVENTS.THREAD_DRAFT_CHANGED, {
        detail: { thread_token: "thread_1", draft },
      }),
    );

    expect(get_preload_cache().get("email_1")?.thread_draft?.id).toBe(
      "draft_1",
    );
  });

  it("clears the cached draft when it is deleted", () => {
    seed_entry("thread_1");
    get_preload_cache().set("email_1", {
      ...get_preload_cache().get("email_1")!,
      thread_draft: { id: "draft_1" } as never,
    });

    window.dispatchEvent(
      new CustomEvent(MAIL_EVENTS.THREAD_DRAFT_CHANGED, {
        detail: { thread_token: "thread_1", draft: null },
      }),
    );

    expect(get_preload_cache().get("email_1")?.thread_draft).toBeNull();
  });

  it("leaves other threads alone", () => {
    seed_entry("thread_1");

    window.dispatchEvent(
      new CustomEvent(MAIL_EVENTS.THREAD_DRAFT_CHANGED, {
        detail: { thread_token: "thread_other", draft: { id: "d" } },
      }),
    );

    expect(get_preload_cache().get("email_1")?.thread_draft).toBeNull();
  });
});
