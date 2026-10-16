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
import type { ScheduledEmailWithContent } from "@/services/api/scheduled";
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { describe, it, expect, vi, beforeEach } from "vitest";

const create_draft = vi.fn();
const delete_draft = vi.fn();
const cancel_scheduled_email = vi.fn();
const emit_scheduled_cancelled = vi.fn();
const emit_scheduled_changed = vi.fn();

vi.mock("@/services/api/multi_drafts", () => ({
  create_draft: (...args: unknown[]) => create_draft(...args),
  delete_draft: (...args: unknown[]) => delete_draft(...args),
}));

vi.mock("@/services/api/scheduled", () => ({
  cancel_scheduled_email: (...args: unknown[]) =>
    cancel_scheduled_email(...args),
}));

vi.mock("@/hooks/mail_events", () => ({
  emit_scheduled_cancelled: (...args: unknown[]) =>
    emit_scheduled_cancelled(...args),
  emit_scheduled_changed: (...args: unknown[]) =>
    emit_scheduled_changed(...args),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: vi.fn(),
}));

import { scheduled_to_draft } from "./scheduled_to_draft";

const vault = {} as EncryptedVault;

function make_email(
  overrides: Partial<ScheduledEmailWithContent["content"]> = {},
): ScheduledEmailWithContent {
  return {
    id: "sched-1",
    scheduled_at: "2026-10-20T10:00:00.000Z",
    status: "pending",
    created_at: "2026-10-16T10:00:00.000Z",
    updated_at: "2026-10-16T10:00:00.000Z",
    content: {
      to_recipients: ["a@example.com"],
      cc_recipients: ["b@example.com"],
      bcc_recipients: [],
      subject: "Hello",
      body: "<p>Body</p>",
      scheduled_at: "2026-10-20T10:00:00.000Z",
      ...overrides,
    },
  };
}

beforeEach(() => {
  create_draft.mockReset();
  delete_draft.mockReset();
  cancel_scheduled_email.mockReset();
  emit_scheduled_cancelled.mockReset();
  emit_scheduled_changed.mockReset();
  create_draft.mockResolvedValue({
    data: { id: "draft-1", version: 1, updated_at: "2026-10-16T11:00:00Z" },
  });
  cancel_scheduled_email.mockResolvedValue({ data: { success: true } });
  delete_draft.mockResolvedValue({ data: { success: true } });
});

describe("scheduled_to_draft", () => {
  it("saves a new draft before canceling the scheduled send", async () => {
    const result = await scheduled_to_draft(make_email(), vault);

    expect(create_draft.mock.invocationCallOrder[0]).toBeLessThan(
      cancel_scheduled_email.mock.invocationCallOrder[0],
    );
    expect(create_draft.mock.calls[0][2]).toBe("new");
    expect(result).toEqual({
      data: expect.objectContaining({
        id: "draft-1",
        version: 1,
        draft_type: "new",
        to_recipients: ["a@example.com"],
        cc_recipients: ["b@example.com"],
        subject: "Hello",
        message: "<p>Body</p>",
      }),
    });
    expect(emit_scheduled_cancelled).toHaveBeenCalledWith({
      email_id: "sched-1",
    });
  });

  it("keeps reply threading on the draft", async () => {
    const result = await scheduled_to_draft(
      make_email({
        in_reply_to: "<orig@example.com>",
        thread_id: "thread-9",
        from: { name: "Me", email: "alias@example.com" },
      }),
      vault,
    );

    expect(create_draft.mock.calls[0][2]).toBe("reply");
    expect(create_draft.mock.calls[0][5]).toBe("thread-9");
    expect(result).toEqual({
      data: expect.objectContaining({
        draft_type: "reply",
        thread_token: "thread-9",
        rfc_message_id: "<orig@example.com>",
        from_email: "alias@example.com",
      }),
    });
  });

  it("keeps the original message link and plain text mode", async () => {
    const result = await scheduled_to_draft(
      make_email({
        reply_to_id: "mail-42",
        is_plain_text: true,
        body: "Plain body",
      }),
      vault,
    );

    expect(create_draft.mock.calls[0][0]).toEqual(
      expect.objectContaining({ is_plain_text: true }),
    );
    expect(create_draft.mock.calls[0][2]).toBe("reply");
    expect(create_draft.mock.calls[0][3]).toBe("mail-42");
    expect(result).toEqual({
      data: expect.objectContaining({
        draft_type: "reply",
        reply_to_id: "mail-42",
        is_plain_text: true,
        message: "Plain body",
      }),
    });
  });

  it("leaves the scheduled send alone when the draft cannot be saved", async () => {
    create_draft.mockResolvedValue({ error: "nope" });

    const result = await scheduled_to_draft(make_email(), vault);

    expect(result).toEqual({ error: "nope" });
    expect(cancel_scheduled_email).not.toHaveBeenCalled();
  });

  it("removes the new draft when the scheduled send cannot be canceled", async () => {
    cancel_scheduled_email.mockResolvedValue({ error: "already sending" });

    const result = await scheduled_to_draft(make_email(), vault);

    expect(result).toEqual({ error: "already sending" });
    expect(delete_draft).toHaveBeenCalledWith("draft-1");
    expect(emit_scheduled_cancelled).not.toHaveBeenCalled();
  });
});
