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
import type { EncryptedVault } from "@/services/crypto/key_manager";
import type { ThreadDraftChangedEventDetail } from "@/hooks/mail_events";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { MAIL_EVENTS } from "@/hooks/mail_events";

const post = vi.fn();
const put = vi.fn();
const del = vi.fn();
const get = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    post: (...args: unknown[]) => post(...args),
    put: (...args: unknown[]) => put(...args),
    delete: (...args: unknown[]) => del(...args),
    get: (...args: unknown[]) => get(...args),
  },
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: vi.fn(),
}));

const vault = { identity_key: "identity" } as unknown as EncryptedVault;

const content = {
  to_recipients: ["someone@astermail.org"],
  cc_recipients: [],
  bcc_recipients: [],
  subject: "Re: hello",
  message: "typed reply",
};

let thread_events: ThreadDraftChangedEventDetail[] = [];
let drafts_changed_count = 0;

const on_thread_draft = ((
  event: CustomEvent<ThreadDraftChangedEventDetail>,
) => {
  thread_events.push(event.detail);
}) as EventListener;

const on_drafts_changed = (): void => {
  drafts_changed_count++;
};

describe("thread draft change events", () => {
  beforeEach(() => {
    thread_events = [];
    drafts_changed_count = 0;
    post.mockReset();
    put.mockReset();
    del.mockReset();
    get.mockReset();
    window.addEventListener(MAIL_EVENTS.THREAD_DRAFT_CHANGED, on_thread_draft);
    window.addEventListener(MAIL_EVENTS.DRAFTS_CHANGED, on_drafts_changed);
  });

  afterEach(() => {
    window.removeEventListener(
      MAIL_EVENTS.THREAD_DRAFT_CHANGED,
      on_thread_draft,
    );
    window.removeEventListener(MAIL_EVENTS.DRAFTS_CHANGED, on_drafts_changed);
  });

  it("announces a created thread draft with its content", async () => {
    post.mockResolvedValue({ data: { id: "draft_1", version: 1 } });

    const { create_draft } = await import("./multi_drafts");
    const result = await create_draft(
      content,
      vault,
      "reply",
      "email_1",
      undefined,
      "thread_1",
    );

    expect(result.data?.id).toBe("draft_1");
    expect(thread_events).toHaveLength(1);
    expect(thread_events[0].thread_token).toBe("thread_1");
    expect(thread_events[0].draft?.id).toBe("draft_1");
    expect(thread_events[0].draft?.content.message).toBe("typed reply");
    expect(drafts_changed_count).toBe(1);
  });

  it("announces an updated thread draft", async () => {
    put.mockResolvedValue({ data: { success: true, version: 4 } });

    const { update_draft } = await import("./multi_drafts");

    await update_draft(
      "draft_1",
      content,
      3,
      vault,
      "reply",
      "email_1",
      undefined,
      "thread_1",
    );

    expect(thread_events).toHaveLength(1);
    expect(thread_events[0].draft?.version).toBe(4);
  });

  it("stays quiet when a save fails", async () => {
    put.mockResolvedValue({ error: "nope" });

    const { update_draft } = await import("./multi_drafts");

    await update_draft(
      "draft_1",
      content,
      3,
      vault,
      "reply",
      "email_1",
      undefined,
      "thread_1",
    );

    expect(thread_events).toHaveLength(0);
    expect(drafts_changed_count).toBe(0);
  });

  it("announces removal when a thread draft is deleted", async () => {
    del.mockResolvedValue({ data: { success: true } });

    const { delete_thread_draft } = await import("./multi_drafts");

    await delete_thread_draft("draft_1", "thread_1");

    expect(thread_events).toHaveLength(1);
    expect(thread_events[0].draft).toBeNull();
    expect(drafts_changed_count).toBe(1);
  });

  it("skips the thread announcement for a draft with no thread", async () => {
    post.mockResolvedValue({ data: { id: "draft_2", version: 1 } });

    const { create_draft } = await import("./multi_drafts");

    await create_draft(content, vault, "new");

    expect(thread_events).toHaveLength(0);
    expect(drafts_changed_count).toBe(1);
  });
});
